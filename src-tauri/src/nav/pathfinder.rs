//! Port of `Navigation.findPath` / `walk` / `los` / `closestPoint` (src/core/navigation.js). Keep both in sync: same
//! search window, costs, corner rule, expansion cap, partial-path fallback and line-of-sight smoothing.

const SEARCH_PADDING: i32 = 28;
const MAX_EXPANSIONS: u32 = 30_000;
const DIAGONAL_COST: f32 = 1.414;
const WALL_ADJACENT_COST: f32 = 1.8;
const SNAP_RADIUS: i32 = 6;
const LOS_STEP: f32 = 0.4;
const LOS_SIDE_MARGIN: f32 = 0.25;
const HEADER_SIZE: usize = 16;

const NEIGHBOUR_DX: [i32; 8] = [1, -1, 0, 0, 1, 1, -1, -1];
const NEIGHBOUR_DZ: [i32; 8] = [0, 0, 1, -1, 1, -1, 1, -1];

#[derive(Clone)]
pub struct NavGrid {
	width: i32,
	height: i32,
	min_x: f32,
	min_z: f32,
	cells: Vec<u8>,
}

impl NavGrid {
	pub fn from_bytes(bytes: &[u8]) -> Result<Self, String> {
		if bytes.len() < HEADER_SIZE {
			return Err("nav grid shorter than its header".into());
		}
		let word = |o: usize| [bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]];
		let width = u32::from_le_bytes(word(0)) as usize;
		let height = u32::from_le_bytes(word(4)) as usize;
		let cell_count = width.checked_mul(height).ok_or("nav grid size overflows")?;
		if width == 0 || height == 0 || width > i32::MAX as usize || height > i32::MAX as usize {
			return Err("nav grid has invalid dimensions".into());
		}
		if bytes.len() != HEADER_SIZE + cell_count {
			return Err(format!("nav grid declares {width}×{height} cells but carries {} bytes", bytes.len() - HEADER_SIZE));
		}
		Ok(Self {
			width: width as i32,
			height: height as i32,
			min_x: f32::from_le_bytes(word(8)),
			min_z: f32::from_le_bytes(word(12)),
			cells: bytes[HEADER_SIZE..].to_vec(),
		})
	}

	/// Mirrors `Navigation._fill` for runtime edits (favela barricades): inclusive cell range, clamped to the grid.
	pub fn fill_rect(&mut self, i0: i32, j0: i32, i1: i32, j1: i32, value: u8) {
		let (i0, i1) = (i0.max(0), i1.min(self.width - 1));
		let (j0, j1) = (j0.max(0), j1.min(self.height - 1));
		for j in j0..=j1 {
			let row = (j * self.width) as usize;
			for i in i0..=i1 {
				self.cells[row + i as usize] = value;
			}
		}
	}

	#[inline]
	fn in_bounds(&self, i: i32, j: i32) -> bool {
		i >= 0 && j >= 0 && i < self.width && j < self.height
	}

	/// Caller guarantees bounds.
	#[inline]
	fn cell(&self, i: i32, j: i32) -> u8 {
		self.cells[(j * self.width + i) as usize]
	}

	#[inline]
	fn column(&self, x: f32) -> i32 {
		(x - self.min_x).floor() as i32
	}

	#[inline]
	fn row(&self, z: f32) -> i32 {
		(z - self.min_z).floor() as i32
	}

	#[inline]
	pub fn walk(&self, x: f32, z: f32) -> bool {
		let (i, j) = (self.column(x), self.row(z));
		self.in_bounds(i, j) && self.cell(i, j) != 0
	}

	/// Straight segment free of obstacles, sampled every 0.4 u with a 0.25 u side margin.
	pub fn line_of_sight(&self, ax: f32, az: f32, bx: f32, bz: f32) -> bool {
		let (dx, dz) = (bx - ax, bz - az);
		let distance = (dx * dx + dz * dz).sqrt();
		if distance < 0.01 {
			return true;
		}
		let steps = (distance / LOS_STEP).ceil() as i32;
		let (ux, uz) = (dx / distance, dz / distance);
		let (px, pz) = (-uz * LOS_SIDE_MARGIN, ux * LOS_SIDE_MARGIN);
		for k in 1..=steps {
			let t = distance.min(k as f32 * LOS_STEP);
			let (x, z) = (ax + ux * t, az + uz * t);
			if !self.walk(x, z) || !self.walk(x + px, z + pz) || !self.walk(x - px, z - pz) {
				return false;
			}
		}
		true
	}

	/// Nearest walkable cell centre within `max_ring` cells (square rings, closest centre wins).
	fn closest_point(&self, x: f32, z: f32, max_ring: i32) -> Option<(f32, f32)> {
		if self.walk(x, z) {
			return Some((x, z));
		}
		let (ci, cj) = (self.column(x), self.row(z));
		let (local_x, local_z) = (x - self.min_x, z - self.min_z);
		for ring in 1..=max_ring {
			let mut best: Option<(i32, i32)> = None;
			let mut best_distance = f32::INFINITY;
			for dz in -ring..=ring {
				for dx in -ring..=ring {
					if dx.abs().max(dz.abs()) != ring {
						continue;
					}
					let (i, j) = (ci + dx, cj + dz);
					if !self.in_bounds(i, j) || self.cell(i, j) == 0 {
						continue;
					}
					let (ex, ez) = (i as f32 + 0.5 - local_x, j as f32 + 0.5 - local_z);
					let distance = ex * ex + ez * ez;
					if distance < best_distance {
						best_distance = distance;
						best = Some((i, j));
					}
				}
			}
			if let Some((i, j)) = best {
				return Some((self.min_x + i as f32 + 0.5, self.min_z + j as f32 + 0.5));
			}
		}
		None
	}

	/// Snaps a point onto walkable ground (within SNAP_RADIUS) and returns its cell.
	fn snapped_cell(&self, x: f32, z: f32) -> Option<(i32, i32)> {
		let (i, j) = (self.column(x), self.row(z));
		if self.cell(i, j) != 0 {
			return Some((i, j));
		}
		let (qx, qz) = self.closest_point(x, z, SNAP_RADIUS)?;
		let (i, j) = (self.column(qx), self.row(qz));
		(self.in_bounds(i, j) && self.cell(i, j) != 0).then_some((i, j))
	}
}

/// Reusable A* buffers (grow-only), equivalent to Navigation._ensure.
#[derive(Default)]
pub struct Pathfinder {
	cost: Vec<f32>,
	parent: Vec<i32>,
	stamp: Vec<u32>,
	closed: Vec<bool>,
	heap_node: Vec<i32>,
	heap_score: Vec<f32>,
	generation: u32,
	raw_path: Vec<(f32, f32)>,
}

impl Pathfinder {
	fn ensure(&mut self, nodes: usize) {
		if nodes <= self.cost.len() {
			return;
		}
		self.cost = vec![0.0; nodes];
		self.parent = vec![0; nodes];
		self.stamp = vec![0; nodes];
		self.closed = vec![false; nodes];
		self.heap_node = vec![0; nodes * 4 + 16];
		self.heap_score = vec![0.0; nodes * 4 + 16];
		self.generation = 0;
	}

	fn next_generation(&mut self) -> u32 {
		if self.generation == u32::MAX {
			self.stamp.fill(0);
			self.generation = 0;
		}
		self.generation += 1;
		self.generation
	}

	/// Fills `out` with the smoothed waypoints (start excluded). Returns false when there is no usable path. When the goal
	/// is unreachable inside the search window, the path leads to the explored cell closest to it (like the JS version).
	pub fn find_path(&mut self, grid: &NavGrid, sx: f32, sz: f32, gx: f32, gz: f32, out: &mut Vec<(f32, f32)>) -> bool {
		out.clear();
		if !grid.in_bounds(grid.column(sx), grid.row(sz)) || !grid.in_bounds(grid.column(gx), grid.row(gz)) {
			return false;
		}
		let Some((si, sj)) = grid.snapped_cell(sx, sz) else {
			return false;
		};
		let Some((gi, gj)) = grid.snapped_cell(gx, gz) else {
			return false;
		};
		if si == gi && sj == gj {
			out.push((gx, gz));
			return true;
		}

		let i0 = (si.min(gi) - SEARCH_PADDING).max(0);
		let i1 = (si.max(gi) + SEARCH_PADDING).min(grid.width - 1);
		let j0 = (sj.min(gj) - SEARCH_PADDING).max(0);
		let j1 = (sj.max(gj) + SEARCH_PADDING).min(grid.height - 1);
		let window_width = i1 - i0 + 1;
		self.ensure((window_width * (j1 - j0 + 1)) as usize);
		let generation = self.next_generation();
		let index = |i: i32, j: i32| ((j - j0) * window_width + (i - i0)) as usize;
		let heuristic = |i: i32, j: i32| {
			let (dx, dz) = ((i - gi).abs() as f32, (j - gj).abs() as f32);
			dx + dz + (DIAGONAL_COST - 2.0) * dx.min(dz)
		};

		let start = index(si, sj);
		let goal = index(gi, gj);
		self.stamp[start] = generation;
		self.cost[start] = 0.0;
		self.parent[start] = -1;
		self.closed[start] = false;
		let mut heap_size = 0usize;
		self.push(&mut heap_size, start as i32, heuristic(si, sj));

		let mut best = start;
		let mut best_heuristic = heuristic(si, sj);
		let mut found = false;
		let mut expansions = 0u32;
		while heap_size > 0 && expansions < MAX_EXPANSIONS {
			let node = self.pop(&mut heap_size) as usize;
			if self.closed[node] && self.stamp[node] == generation {
				continue;
			}
			self.closed[node] = true;
			expansions += 1;
			if node == goal {
				found = true;
				break;
			}
			let ni = (node as i32 % window_width) + i0;
			let nj = (node as i32 / window_width) + j0;
			let h = heuristic(ni, nj);
			if h < best_heuristic {
				best_heuristic = h;
				best = node;
			}
			for d in 0..8 {
				let (i, j) = (ni + NEIGHBOUR_DX[d], nj + NEIGHBOUR_DZ[d]);
				if i < i0 || i > i1 || j < j0 || j > j1 {
					continue;
				}
				let cell = grid.cell(i, j);
				if cell == 0 {
					continue;
				}
				// No corner cutting: both orthogonal cells of a diagonal step must be walkable.
				if d >= 4 && (grid.cell(ni + NEIGHBOUR_DX[d], nj) == 0 || grid.cell(ni, nj + NEIGHBOUR_DZ[d]) == 0) {
					continue;
				}
				let neighbour = index(i, j);
				if self.stamp[neighbour] == generation && self.closed[neighbour] {
					continue;
				}
				let step = if d < 4 { 1.0 } else { DIAGONAL_COST };
				let next_cost = self.cost[node] + step * if cell == 2 { WALL_ADJACENT_COST } else { 1.0 };
				let fresh = self.stamp[neighbour] != generation;
				if fresh || next_cost < self.cost[neighbour] {
					if fresh {
						self.stamp[neighbour] = generation;
						self.closed[neighbour] = false;
					}
					self.cost[neighbour] = next_cost;
					self.parent[neighbour] = node as i32;
					self.push(&mut heap_size, neighbour as i32, next_cost + heuristic(i, j));
				}
			}
		}

		let end = if found { goal } else { best };
		if !found && end == start {
			return false;
		}
		self.raw_path.clear();
		let mut node = end as i32;
		while node != -1 && node as usize != start {
			let n = node as usize;
			let cell_x = (node % window_width) + i0;
			let cell_z = (node / window_width) + j0;
			self.raw_path.push((grid.min_x + cell_x as f32 + 0.5, grid.min_z + cell_z as f32 + 0.5));
			node = self.parent[n];
		}
		self.raw_path.reverse();
		if found {
			self.raw_path.push((gx, gz));
		}
		smooth(grid, sx, sz, &self.raw_path, out);
		!out.is_empty()
	}

	/// Binary min-heap with duplicate entries (1-based). Drops the entry on the (improbable) overflow, like the JS version.
	fn push(&mut self, size: &mut usize, node: i32, score: f32) {
		let mut k = *size + 1;
		if k >= self.heap_node.len() {
			return;
		}
		*size = k;
		while k > 1 && self.heap_score[k >> 1] > score {
			self.heap_node[k] = self.heap_node[k >> 1];
			self.heap_score[k] = self.heap_score[k >> 1];
			k >>= 1;
		}
		self.heap_node[k] = node;
		self.heap_score[k] = score;
	}

	fn pop(&mut self, size: &mut usize) -> i32 {
		let top = self.heap_node[1];
		let last_node = self.heap_node[*size];
		let last_score = self.heap_score[*size];
		*size -= 1;
		let mut k = 1;
		loop {
			let mut child = k << 1;
			if child > *size {
				break;
			}
			if child < *size && self.heap_score[child + 1] < self.heap_score[child] {
				child += 1;
			}
			if last_score <= self.heap_score[child] {
				break;
			}
			self.heap_node[k] = self.heap_node[child];
			self.heap_score[k] = self.heap_score[child];
			k = child;
		}
		if *size >= 1 {
			self.heap_node[k] = last_node;
			self.heap_score[k] = last_score;
		}
		top
	}
}

/// From the current point, jump to the farthest waypoint still in line of sight.
fn smooth(grid: &NavGrid, sx: f32, sz: f32, points: &[(f32, f32)], out: &mut Vec<(f32, f32)>) {
	let (mut ax, mut az) = (sx, sz);
	let mut k = 0;
	while k < points.len() {
		let mut far = k;
		for q in (k + 1..points.len()).rev() {
			if grid.line_of_sight(ax, az, points[q].0, points[q].1) {
				far = q;
				break;
			}
		}
		out.push(points[far]);
		(ax, az) = points[far];
		k = far + 1;
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	/// 20 × 20 open field with a wall across x = 10 that has a gap at z = 2.
	fn walled_grid() -> NavGrid {
		let (width, height) = (20usize, 20usize);
		let mut bytes = Vec::new();
		bytes.extend_from_slice(&(width as u32).to_le_bytes());
		bytes.extend_from_slice(&(height as u32).to_le_bytes());
		bytes.extend_from_slice(&0f32.to_le_bytes());
		bytes.extend_from_slice(&0f32.to_le_bytes());
		for z in 0..height {
			for x in 0..width {
				bytes.push(if x == 10 && z != 2 { 0 } else { 1 });
			}
		}
		NavGrid::from_bytes(&bytes).unwrap()
	}

	#[test]
	fn straight_line_when_visible() {
		let grid = walled_grid();
		let mut out = Vec::new();
		assert!(Pathfinder::default().find_path(&grid, 2.5, 15.5, 7.5, 15.5, &mut out));
		assert_eq!(out, vec![(7.5, 15.5)]);
	}

	#[test]
	fn routes_through_the_gap() {
		let grid = walled_grid();
		let mut out = Vec::new();
		assert!(Pathfinder::default().find_path(&grid, 5.5, 15.5, 15.5, 15.5, &mut out));
		assert_eq!(*out.last().unwrap(), (15.5, 15.5));
		assert!(out.iter().any(|&(x, z)| (x - 10.5).abs() < 1.5 && z < 5.0), "path must pass the gap: {out:?}");
	}

	#[test]
	fn reused_buffers_give_identical_results() {
		let grid = walled_grid();
		let mut pathfinder = Pathfinder::default();
		let (mut first, mut second) = (Vec::new(), Vec::new());
		pathfinder.find_path(&grid, 5.5, 15.5, 15.5, 15.5, &mut first);
		pathfinder.find_path(&grid, 5.5, 15.5, 15.5, 15.5, &mut second);
		assert_eq!(first, second);
	}
}
