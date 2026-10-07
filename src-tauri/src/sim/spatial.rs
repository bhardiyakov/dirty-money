//! Uniform-grid spatial partitioning over the bounded world (2500 × 2500 u).
//!
//! `DynamicGrid` — moving bodies, rebuilt every tick with a counting sort that touches only occupied cells:
//!   O(n) rebuild, zero allocation, no full-grid clear, and each cell's entries are contiguous (position + radius inline,
//!   so broadphase never dereferences the entity pool). Pair search uses a forward half-stencil: each pair exactly once.
//!
//! `StaticGrid` — immovable colliders (buildings, walls, trunks), built once at load in CSR form. AABBs spanning several
//!   cells are deduplicated per query with a stamp counter instead of a hash set.
//!
//! A dense grid beats a HashMap or quadtree here: the world is bounded, body sizes are uniform-ish, and the hot path is
//! "neighbours of a point", which becomes plain index arithmetic.

#[derive(Clone, Copy, Debug)]
pub struct GridLayout {
	min_x: f32,
	min_z: f32,
	cell_size: f32,
	inverse_cell_size: f32,
	columns: i32,
	rows: i32,
}

#[derive(Clone, Copy, Debug)]
struct CellSpan {
	first_column: i32,
	last_column: i32,
	first_row: i32,
	last_row: i32,
}

impl GridLayout {
	pub fn new(min_x: f32, min_z: f32, max_x: f32, max_z: f32, cell_size: f32) -> Self {
		assert!(cell_size > 0.0 && max_x > min_x && max_z > min_z, "invalid grid layout");
		Self {
			min_x,
			min_z,
			cell_size,
			inverse_cell_size: cell_size.recip(),
			columns: (((max_x - min_x) / cell_size).ceil() as i32).max(1),
			rows: (((max_z - min_z) / cell_size).ceil() as i32).max(1),
		}
	}

	#[inline]
	pub fn cell_size(&self) -> f32 {
		self.cell_size
	}

	#[inline]
	pub fn cell_count(&self) -> usize {
		(self.columns * self.rows) as usize
	}

	/// Out-of-bounds coordinates clamp to the border cells: still correct (exact tests follow), just denser there.
	#[inline]
	fn column_of(&self, x: f32) -> i32 {
		(((x - self.min_x) * self.inverse_cell_size).floor() as i32).clamp(0, self.columns - 1)
	}

	#[inline]
	fn row_of(&self, z: f32) -> i32 {
		(((z - self.min_z) * self.inverse_cell_size).floor() as i32).clamp(0, self.rows - 1)
	}

	#[inline]
	fn cell_index(&self, column: i32, row: i32) -> usize {
		(row * self.columns + column) as usize
	}

	#[inline]
	fn cell_of(&self, x: f32, z: f32) -> usize {
		self.cell_index(self.column_of(x), self.row_of(z))
	}

	#[inline]
	fn span(&self, min_x: f32, min_z: f32, max_x: f32, max_z: f32) -> CellSpan {
		CellSpan {
			first_column: self.column_of(min_x),
			last_column: self.column_of(max_x),
			first_row: self.row_of(min_z),
			last_row: self.row_of(max_z),
		}
	}
}

// ─── Dynamic bodies ─────────────────────────────────────────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, Default)]
#[repr(C)]
pub struct GridEntry {
	pub slot: u32,
	pub x: f32,
	pub z: f32,
	pub radius: f32,
}

pub struct DynamicGrid {
	layout: GridLayout,
	cell_start: Vec<u32>,
	cell_count: Vec<u32>,
	occupied: Vec<u32>,
	staged: Vec<GridEntry>,
	staged_cell: Vec<u32>,
	entries: Vec<GridEntry>,
}

impl DynamicGrid {
	pub fn new(layout: GridLayout, capacity: usize) -> Self {
		let cells = layout.cell_count();
		Self {
			layout,
			cell_start: vec![0; cells],
			cell_count: vec![0; cells],
			occupied: Vec::with_capacity(capacity.min(cells)),
			staged: Vec::with_capacity(capacity),
			staged_cell: Vec::with_capacity(capacity),
			entries: vec![GridEntry::default(); capacity],
		}
	}

	/// Largest radius the pair search supports: overlapping bodies must land in the same or adjacent cells.
	#[inline]
	pub fn max_radius(&self) -> f32 {
		self.layout.cell_size * 0.5
	}

	#[inline]
	pub fn len(&self) -> usize {
		self.staged.len()
	}

	#[inline]
	pub fn is_empty(&self) -> bool {
		self.staged.is_empty()
	}

	/// Starts a rebuild. Only the cells occupied last tick are reset.
	pub fn begin(&mut self) {
		for &cell in &self.occupied {
			self.cell_count[cell as usize] = 0;
		}
		self.occupied.clear();
		self.staged.clear();
		self.staged_cell.clear();
	}

	/// Returns false (body skipped) when the grid is full; never reallocates.
	pub fn insert(&mut self, slot: u32, x: f32, z: f32, radius: f32) -> bool {
		debug_assert!(radius <= self.max_radius(), "body radius exceeds half a cell; the pair search would miss overlaps");
		if self.staged.len() == self.entries.len() {
			return false;
		}
		let cell = self.layout.cell_of(x, z);
		if self.cell_count[cell] == 0 {
			self.occupied.push(cell as u32);
		}
		self.cell_count[cell] += 1;
		self.staged.push(GridEntry { slot, x, z, radius });
		self.staged_cell.push(cell as u32);
		true
	}

	/// Counting sort: assign each occupied cell a contiguous range, then scatter the staged entries into it.
	pub fn finish(&mut self) {
		let mut offset = 0u32;
		for &cell in &self.occupied {
			let cell = cell as usize;
			self.cell_start[cell] = offset;
			offset += self.cell_count[cell];
			self.cell_count[cell] = 0;
		}
		for (entry, &cell) in self.staged.iter().zip(&self.staged_cell) {
			let cell = cell as usize;
			let write = (self.cell_start[cell] + self.cell_count[cell]) as usize;
			self.entries[write] = *entry;
			self.cell_count[cell] += 1;
		}
	}

	/// Empty cells keep a stale start but a zero count, which still yields a valid empty slice.
	#[inline]
	fn cell_entries(&self, cell: usize) -> &[GridEntry] {
		let start = self.cell_start[cell] as usize;
		&self.entries[start..start + self.cell_count[cell] as usize]
	}

	/// Visits every body whose centre lies within `radius` of (x, z).
	pub fn query_radius(&self, x: f32, z: f32, radius: f32, mut visit: impl FnMut(&GridEntry)) {
		let span = self.layout.span(x - radius, z - radius, x + radius, z + radius);
		let radius_squared = radius * radius;
		for row in span.first_row..=span.last_row {
			for column in span.first_column..=span.last_column {
				for entry in self.cell_entries(self.layout.cell_index(column, row)) {
					let dx = entry.x - x;
					let dz = entry.z - z;
					if dx * dx + dz * dz <= radius_squared {
						visit(entry);
					}
				}
			}
		}
	}

	/// Visits each overlapping pair exactly once: pairs inside a cell, then the forward neighbours (E, SW, S, SE).
	/// Cost is O(occupied cells × local density), independent of world size.
	pub fn for_each_overlapping_pair(&self, mut on_pair: impl FnMut(&GridEntry, &GridEntry)) {
		const FORWARD_NEIGHBOURS: [(i32, i32); 4] = [(1, 0), (-1, 1), (0, 1), (1, 1)];
		let columns = self.layout.columns;
		let rows = self.layout.rows;
		for &cell in &self.occupied {
			let home = self.cell_entries(cell as usize);
			for (i, a) in home.iter().enumerate() {
				for b in &home[i + 1..] {
					test_pair(a, b, &mut on_pair);
				}
			}
			let column = cell as i32 % columns;
			let row = cell as i32 / columns;
			for (column_offset, row_offset) in FORWARD_NEIGHBOURS {
				let neighbour_column = column + column_offset;
				let neighbour_row = row + row_offset;
				if neighbour_column < 0 || neighbour_column >= columns || neighbour_row >= rows {
					continue;
				}
				let neighbour = self.cell_entries(self.layout.cell_index(neighbour_column, neighbour_row));
				for a in home {
					for b in neighbour {
						test_pair(a, b, &mut on_pair);
					}
				}
			}
		}
	}
}

#[inline]
fn test_pair(a: &GridEntry, b: &GridEntry, on_pair: &mut impl FnMut(&GridEntry, &GridEntry)) {
	let dx = b.x - a.x;
	let dz = b.z - a.z;
	let reach = a.radius + b.radius;
	if dx * dx + dz * dz < reach * reach {
		on_pair(a, b);
	}
}

// ─── Static colliders ───────────────────────────────────────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Aabb {
	pub min_x: f32,
	pub min_z: f32,
	pub max_x: f32,
	pub max_z: f32,
}

impl Aabb {
	pub fn new(x0: f32, z0: f32, x1: f32, z1: f32) -> Self {
		Self { min_x: x0.min(x1), min_z: z0.min(z1), max_x: x0.max(x1), max_z: z0.max(z1) }
	}

	#[inline]
	pub fn closest_point(&self, x: f32, z: f32) -> (f32, f32) {
		(x.clamp(self.min_x, self.max_x), z.clamp(self.min_z, self.max_z))
	}
}

pub struct StaticGrid {
	layout: GridLayout,
	/// CSR: cell `c` owns `references[cell_start[c]..cell_start[c + 1]]`.
	cell_start: Vec<u32>,
	references: Vec<u32>,
	boxes: Vec<Aabb>,
	visit_stamp: Vec<u32>,
	current_stamp: u32,
}

impl StaticGrid {
	/// Load-time only; allocates freely.
	pub fn build(layout: GridLayout, boxes: Vec<Aabb>) -> Self {
		let boxes: Vec<Aabb> = boxes.into_iter().map(|b| Aabb::new(b.min_x, b.min_z, b.max_x, b.max_z)).collect();
		let cells = layout.cell_count();
		let mut cell_start = vec![0u32; cells + 1];
		for aabb in &boxes {
			for_each_cell(&layout, aabb, |cell| cell_start[cell + 1] += 1);
		}
		for cell in 0..cells {
			cell_start[cell + 1] += cell_start[cell];
		}
		let mut cursor = cell_start.clone();
		let mut references = vec![0u32; cell_start[cells] as usize];
		for (index, aabb) in boxes.iter().enumerate() {
			for_each_cell(&layout, aabb, |cell| {
				references[cursor[cell] as usize] = index as u32;
				cursor[cell] += 1;
			});
		}
		Self { layout, cell_start, references, visit_stamp: vec![0; boxes.len()], boxes, current_stamp: 0 }
	}

	/// Visits each collider touching the circle once. `&mut self` only for the dedup stamp.
	pub fn query_circle(&mut self, x: f32, z: f32, radius: f32, mut visit: impl FnMut(&Aabb)) {
		self.current_stamp = self.current_stamp.wrapping_add(1);
		if self.current_stamp == 0 {
			self.visit_stamp.fill(0);
			self.current_stamp = 1;
		}
		let stamp = self.current_stamp;
		let span = self.layout.span(x - radius, z - radius, x + radius, z + radius);
		let radius_squared = radius * radius;
		for row in span.first_row..=span.last_row {
			for column in span.first_column..=span.last_column {
				let cell = self.layout.cell_index(column, row);
				let range = self.cell_start[cell] as usize..self.cell_start[cell + 1] as usize;
				for &reference in &self.references[range] {
					let index = reference as usize;
					if self.visit_stamp[index] == stamp {
						continue;
					}
					self.visit_stamp[index] = stamp;
					let aabb = &self.boxes[index];
					let (closest_x, closest_z) = aabb.closest_point(x, z);
					let dx = x - closest_x;
					let dz = z - closest_z;
					if dx * dx + dz * dz <= radius_squared {
						visit(aabb);
					}
				}
			}
		}
	}

	pub fn intersects_circle(&mut self, x: f32, z: f32, radius: f32) -> bool {
		let mut hit = false;
		self.query_circle(x, z, radius, |_| hit = true);
		hit
	}
}

fn for_each_cell(layout: &GridLayout, aabb: &Aabb, mut visit: impl FnMut(usize)) {
	let span = layout.span(aabb.min_x, aabb.min_z, aabb.max_x, aabb.max_z);
	for row in span.first_row..=span.last_row {
		for column in span.first_column..=span.last_column {
			visit(layout.cell_index(column, row));
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn layout() -> GridLayout {
		GridLayout::new(-100.0, -100.0, 100.0, 100.0, 8.0)
	}

	#[test]
	fn pair_search_matches_brute_force() {
		let mut grid = DynamicGrid::new(layout(), 512);
		let mut rng = crate::sim::math::Rng::new(42);
		let bodies: Vec<(f32, f32, f32)> =
			(0..400).map(|_| (rng.range(-60.0, 60.0), rng.range(-60.0, 60.0), rng.range(0.3, 4.0))).collect();
		grid.begin();
		for (slot, &(x, z, r)) in bodies.iter().enumerate() {
			grid.insert(slot as u32, x, z, r);
		}
		grid.finish();

		let mut found = Vec::new();
		grid.for_each_overlapping_pair(|a, b| found.push((a.slot.min(b.slot), a.slot.max(b.slot))));
		found.sort_unstable();

		let mut expected = Vec::new();
		for i in 0..bodies.len() {
			for j in i + 1..bodies.len() {
				let (dx, dz, reach) = (bodies[j].0 - bodies[i].0, bodies[j].1 - bodies[i].1, bodies[i].2 + bodies[j].2);
				if dx * dx + dz * dz < reach * reach {
					expected.push((i as u32, j as u32));
				}
			}
		}
		assert_eq!(found, expected);
	}

	#[test]
	fn rebuild_resets_previous_tick() {
		let mut grid = DynamicGrid::new(layout(), 8);
		grid.begin();
		grid.insert(0, 1.0, 1.0, 0.5);
		grid.finish();
		grid.begin();
		grid.insert(1, 50.0, 50.0, 0.5);
		grid.finish();
		let mut hits = 0;
		grid.query_radius(1.0, 1.0, 2.0, |_| hits += 1);
		assert_eq!(hits, 0);
	}

	#[test]
	fn static_query_deduplicates_multi_cell_boxes() {
		let mut grid = StaticGrid::build(layout(), vec![Aabb::new(-20.0, -20.0, 20.0, 20.0)]);
		let mut hits = 0;
		grid.query_circle(0.0, 0.0, 30.0, |_| hits += 1);
		assert_eq!(hits, 1);
	}
}
