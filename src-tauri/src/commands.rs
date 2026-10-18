//! IPC surface exposed to the WebView. Hot paths use raw bodies (no JSON): snapshots go out through a `Channel`, input
//! comes in as a 12-byte `Uint8Array`, chunks go out as `ArrayBuffer`. Only the one-off `world_info` uses serde.

use serde::Serialize;
use tauri::ipc::{Channel, InvokeBody, InvokeResponseBody, Request, Response};
use tauri::State;

use crate::grid::GridService;
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

/// Build mode: a batch of grid deltas (raw bytes, see grid/mod.rs). Applied in memory; nothing touches the disk until a save.
#[tauri::command]
pub fn grid_apply_deltas(request: Request<'_>, grid: State<'_, GridService>) -> Result<usize, String> {
	let InvokeBody::Raw(bytes) = request.body() else {
		return Err("grid_apply_deltas expects a raw Uint8Array body".into());
	};
	grid.apply_deltas(bytes)
}

/// Build mode: every placement overlapping one chunk, as raw records.
#[tauri::command]
pub fn grid_load_chunk(level: i16, chunk_x: i32, chunk_z: i32, grid: State<'_, GridService>) -> Response {
	Response::new(grid.load_chunk(level, chunk_x, chunk_z))
}

/// Build mode: loading a save makes that slot's grid the working grid. Returns the next free placement id.
#[tauri::command]
pub fn grid_open_slot(save_slot: u8, grid: State<'_, GridService>) -> Result<u32, String> {
	grid.open_slot(save_slot)
}

#[tauri::command]
pub fn grid_reset_working(grid: State<'_, GridService>) {
	grid.reset_working();
}

/// Build mode: saving the game writes the working grid to the slot's file (on the grid writer thread).
#[tauri::command]
pub fn grid_commit_slot(save_slot: u8, grid: State<'_, GridService>) -> Result<(), String> {
	grid.commit_slot(save_slot)
}

#[tauri::command]
pub fn grid_delete_slot(save_slot: u8, grid: State<'_, GridService>) -> Result<(), String> {
	grid.delete_slot(save_slot)
}
