//! Fixed-step simulation thread (60 TPS) decoupled from the WebView's frame rate.
//!
//! The sim thread owns the `World` exclusively — no lock around game state. It talks to the outside through two narrow
//! doors: the lock-free `InputMailbox` (in) and a Tauri IPC `Channel` carrying raw snapshot bytes (out).
//!
//! IPC cost: the tick itself never allocates. Handing bytes to the WebView needs one owned `Vec<u8>` per publish (Tauri
//! takes ownership and the WebView2 boundary copies anyway) — ~30–80 KB at 60 Hz, outside the simulation hot path.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use tauri::ipc::{Channel, InvokeResponseBody};

use crate::net::input::InputMailbox;
use crate::net::protocol::{MAX_SNAPSHOT_ENTITIES, TICK_RATE};
use crate::net::snapshot::SnapshotWriter;
use crate::sim::{World, MAX_EVENTS};
use crate::world::pack::WorldPack;

/// Ticks simulated in one burst before the loop gives up catching up (prevents the spiral of death after a stall).
const MAX_CATCH_UP_TICKS: u32 = 5;
/// OS sleep is coarse; the last stretch before a deadline is spun.
const SPIN_THRESHOLD: Duration = Duration::from_micros(1500);

type Subscriber = Arc<Mutex<Option<Channel<InvokeResponseBody>>>>;

/// Lazy: neither the world pack nor the simulation thread exist until a client asks for them, so a frontend that does
/// not use the native simulation (the packaged legacy game) costs nothing.
pub struct SimRuntime {
	world_pack_path: PathBuf,
	world_pack: OnceLock<Arc<WorldPack>>,
	input: Arc<InputMailbox>,
	subscriber: Subscriber,
	running: Arc<AtomicBool>,
	thread: Mutex<Option<JoinHandle<()>>>,
}

impl SimRuntime {
	pub fn new(world_pack_path: PathBuf) -> Self {
		Self {
			world_pack_path,
			world_pack: OnceLock::new(),
			input: Arc::new(InputMailbox::default()),
			subscriber: Arc::new(Mutex::new(None)),
			running: Arc::new(AtomicBool::new(true)),
			thread: Mutex::new(None),
		}
	}

	pub fn input(&self) -> &InputMailbox {
		&self.input
	}

	pub fn world_pack(&self) -> &Arc<WorldPack> {
		self.world_pack.get_or_init(|| Arc::new(WorldPack::load_or_procedural(&self.world_pack_path)))
	}

	/// Replaces any previous subscriber (e.g. after a WebView reload) and starts the simulation on first use.
	pub fn subscribe(&self, channel: Channel<InvokeResponseBody>) {
		*lock(&self.subscriber) = Some(channel);
		self.ensure_started();
	}

	fn ensure_started(&self) {
		let mut thread = lock(&self.thread);
		if thread.is_some() || !self.running.load(Ordering::Acquire) {
			return;
		}
		let (input, subscriber, running, pack) =
			(self.input.clone(), self.subscriber.clone(), self.running.clone(), self.world_pack().clone());
		let handle = thread::Builder::new()
			.name("simulation".into())
			.spawn(move || run_loop(&pack, &input, &subscriber, &running))
			.expect("failed to spawn the simulation thread");
		*thread = Some(handle);
	}

	pub fn stop(&self) {
		self.running.store(false, Ordering::Release);
		if let Some(handle) = lock(&self.thread).take() {
			let _ = handle.join();
		}
	}
}

fn run_loop(pack: &WorldPack, input: &InputMailbox, subscriber: &Subscriber, running: &AtomicBool) {
	let tick_duration = Duration::from_nanos(1_000_000_000 / TICK_RATE as u64);
	let dt = 1.0 / TICK_RATE as f32;
	let mut world = World::new(pack);
	let mut writer = SnapshotWriter::new(MAX_SNAPSHOT_ENTITIES, MAX_EVENTS);
	let mut next_tick = Instant::now();

	while running.load(Ordering::Acquire) {
		let mut ticks = 0;
		while Instant::now() >= next_tick && ticks < MAX_CATCH_UP_TICKS {
			world.step(&input.take(), dt);
			next_tick += tick_duration;
			ticks += 1;
		}
		if ticks == MAX_CATCH_UP_TICKS {
			next_tick = Instant::now() + tick_duration;
		}
		if ticks > 0 {
			publish(&mut world, &mut writer, subscriber);
		}
		wait_until(next_tick);
	}
}

fn publish(world: &mut World, writer: &mut SnapshotWriter, subscriber: &Subscriber) {
	let mut guard = lock(subscriber);
	if let Some(channel) = guard.as_ref() {
		world.write_snapshot(writer);
		let payload = InvokeResponseBody::Raw(writer.finish().to_vec());
		if channel.send(payload).is_err() {
			// WebView gone or reloaded: drop the channel; the next `subscribe_snapshots` installs a fresh one.
			*guard = None;
		}
	}
	world.clear_events();
}

fn wait_until(deadline: Instant) {
	loop {
		let now = Instant::now();
		if now >= deadline {
			return;
		}
		let remaining = deadline - now;
		if remaining > SPIN_THRESHOLD {
			thread::sleep(remaining - SPIN_THRESHOLD);
		} else {
			std::hint::spin_loop();
		}
	}
}

/// A panic elsewhere must not take the simulation down with a poisoned lock; the guarded data stays valid.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
	mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}
