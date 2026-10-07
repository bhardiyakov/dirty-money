//! IPC surface exposed to the WebView. Hot paths use raw bodies (no JSON): snapshots go out through a `Channel`, input
//! comes in as a 12-byte `Uint8Array`, chunks go out as `ArrayBuffer`. Only the one-off `world_info` uses serde.

use serde::Serialize;
use tauri::ipc::{Channel, InvokeBody, InvokeResponseBody, Request, Response};
use tauri::State;

use crate::nav::{self, NavService};
use crate::net::protocol::TICK_RATE;
use crate::runtime::SimRuntime;
use crate::world::pack::WorldBounds;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldInfo {
	bounds: WorldBounds,
	chunk_size: f32,
	tick_rate: u32,
}

#[tauri::command]
pub fn world_info(sim: State<'_, SimRuntime>) -> WorldInfo {
	let pack = sim.world_pack();
	WorldInfo { bounds: pack.bounds, chunk_size: pack.chunk_size, tick_rate: TICK_RATE }
}

#[tauri::command]
pub fn subscribe_snapshots(channel: Channel<InvokeResponseBody>, sim: State<'_, SimRuntime>) {
	sim.subscribe(channel);
}

#[tauri::command]
pub fn push_input(request: Request<'_>, sim: State<'_, SimRuntime>) -> Result<(), String> {
	let InvokeBody::Raw(packet) = request.body() else {
		return Err("push_input expects a raw Uint8Array body".into());
	};
	sim.input().publish(packet).map_err(|error| error.to_string())
}

/// Legacy crowd: walkability raster, uploaded once after the game builds it (~6 MB, raw bytes).
#[tauri::command]
pub fn nav_set_grid(request: Request<'_>, nav: State<'_, NavService>) -> Result<(), String> {
	let InvokeBody::Raw(bytes) = request.body() else {
		return Err("nav_set_grid expects a raw Uint8Array body".into());
	};
	nav.set_grid(bytes)
}

/// Legacy crowd: runtime raster edit (barricade placed/removed), same inclusive cell range as `Navigation._fill`.
#[tauri::command]
pub fn nav_fill_rect(i0: i32, j0: i32, i1: i32, j1: i32, value: u8, nav: State<'_, NavService>) -> Result<(), String> {
	nav.fill_rect(i0, j0, i1, j1, value)
}

/// Legacy crowd: a batch of A* requests, solved on the blocking pool so the WebView never waits on pathfinding.
#[tauri::command]
pub async fn nav_find_paths(request: Request<'_>, nav: State<'_, NavService>) -> Result<Response, String> {
	let InvokeBody::Raw(bytes) = request.body() else {
		return Err("nav_find_paths expects a raw Uint8Array body".into());
	};
	let grid = nav.grid().ok_or("nav grid not uploaded yet")?;
	let batch = bytes.clone();
	let solved = tauri::async_runtime::spawn_blocking(move || nav::solve_batch(&grid, &batch))
		.await
		.map_err(|error| error.to_string())??;
	Ok(Response::new(solved))
}

/// Load-time path (chunk streaming), not per-frame: the copy into an owned buffer is irrelevant here.
#[tauri::command]
pub fn get_chunk(chunk_x: i32, chunk_z: i32, sim: State<'_, SimRuntime>) -> Response {
	Response::new(sim.world_pack().chunk_bytes(chunk_x, chunk_z).to_vec())
}
