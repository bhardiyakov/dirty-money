//! Crowd pathfinding for the legacy game, off the WebView thread.
//!
//! The WebView uploads its walkability raster once (`nav_set_grid`), then sends batches of path requests
//! (`nav_find_paths`). Each batch runs on Tauri's blocking pool, so A* never stalls rendering; results come back as raw
//! bytes in request order. `pathfinder.rs` is a faithful port of `Navigation.findPath` (src/core/navigation.js).
//!
//! Wire format (little-endian):
//!   nav_set_grid    u32 width │ u32 height │ f32 min_x │ f32 min_z │ width × height cells (0 blocked, 1 walkable, 2 wall-adjacent)
//!   nav_find_paths  request:  u32 count │ count × (f32 start_x, f32 start_z, f32 goal_x, f32 goal_z)
//!                   response: per request: u32 point_count (u32::MAX = no path) │ point_count × (f32 x, f32 z)

pub mod pathfinder;

use std::cell::RefCell;
use std::sync::{Arc, RwLock};

use pathfinder::{NavGrid, Pathfinder};

const REQUEST_SIZE: usize = 16;
const NO_PATH: u32 = u32::MAX;

#[derive(Default)]
pub struct NavService {
	grid: RwLock<Option<Arc<NavGrid>>>,
}

impl NavService {
	pub fn set_grid(&self, bytes: &[u8]) -> Result<(), String> {
		let grid = NavGrid::from_bytes(bytes)?;
		*self.grid.write().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(Arc::new(grid));
		Ok(())
	}

	/// Copy-on-write: batches already running keep the grid they started with; later batches see the edit.
	pub fn fill_rect(&self, i0: i32, j0: i32, i1: i32, j1: i32, value: u8) -> Result<(), String> {
		let mut slot = self.grid.write().unwrap_or_else(|poisoned| poisoned.into_inner());
		let grid = slot.as_mut().ok_or("nav grid not uploaded yet")?;
		Arc::make_mut(grid).fill_rect(i0, j0, i1, j1, value);
		Ok(())
	}

	pub fn grid(&self) -> Option<Arc<NavGrid>> {
		self.grid.read().unwrap_or_else(|poisoned| poisoned.into_inner()).clone()
	}
}

thread_local! {
	/// One set of A* buffers per blocking-pool thread, reused across batches.
	static PATHFINDER: RefCell<Pathfinder> = RefCell::new(Pathfinder::default());
}

/// Solves a request batch. Runs on a blocking-pool thread.
pub fn solve_batch(grid: &NavGrid, request: &[u8]) -> Result<Vec<u8>, String> {
	let count = request
		.get(0..4)
		.map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize)
		.ok_or("path batch shorter than its header")?;
	if request.len() < 4 + count * REQUEST_SIZE {
		return Err(format!("path batch declares {count} requests but holds {} bytes", request.len()));
	}
	let read_f32 = |offset: usize| f32::from_le_bytes([request[offset], request[offset + 1], request[offset + 2], request[offset + 3]]);

	PATHFINDER.with(|cell| {
		let mut pathfinder = cell.borrow_mut();
		let mut points = Vec::new();
		let mut response = Vec::with_capacity(count * 64);
		for k in 0..count {
			let offset = 4 + k * REQUEST_SIZE;
			let (start_x, start_z) = (read_f32(offset), read_f32(offset + 4));
			let (goal_x, goal_z) = (read_f32(offset + 8), read_f32(offset + 12));
			points.clear();
			if pathfinder.find_path(grid, start_x, start_z, goal_x, goal_z, &mut points) {
				response.extend_from_slice(&(points.len() as u32).to_le_bytes());
				for &(x, z) in &points {
					response.extend_from_slice(&x.to_le_bytes());
					response.extend_from_slice(&z.to_le_bytes());
				}
			} else {
				response.extend_from_slice(&NO_PATH.to_le_bytes());
			}
		}
		Ok(response)
	})
}
