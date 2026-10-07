//! Fixed-capacity object pool with generational handles.
//!
//! All storage is allocated once in `with_capacity`; `spawn` and `despawn` never touch the allocator. Live slots are kept in
//! a packed `dense` list so iteration costs O(live), not O(capacity). A despawned slot bumps its generation, so stale
//! handles held by AI targets, projectile owners or the client are rejected instead of aliasing a recycled entity.

const INDEX_BITS: u32 = 20;
const INDEX_MASK: u32 = (1 << INDEX_BITS) - 1;
const GENERATION_BITS: u32 = 11;
const GENERATION_MASK: u32 = (1 << GENERATION_BITS) - 1;
const NOT_LIVE: u32 = u32::MAX;

/// 20-bit slot index + 11-bit generation. Bit 31 stays free: the wire protocol uses it as the pool namespace.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Handle(u32);

impl Handle {
	/// Index 0xFFFFF is above any allowed capacity, so NULL can never be live.
	pub const NULL: Self = Self(INDEX_MASK | (GENERATION_MASK << INDEX_BITS));

	#[inline]
	fn new(index: u32, generation: u32) -> Self {
		Self((generation << INDEX_BITS) | index)
	}

	#[inline]
	pub fn index(self) -> usize {
		(self.0 & INDEX_MASK) as usize
	}

	#[inline]
	pub fn generation(self) -> u32 {
		(self.0 >> INDEX_BITS) & GENERATION_MASK
	}

	#[inline]
	pub fn raw(self) -> u32 {
		self.0
	}
}

impl Default for Handle {
	fn default() -> Self {
		Self::NULL
	}
}

pub struct Pool<T> {
	slots: Vec<T>,
	generations: Vec<u32>,
	dense: Vec<u32>,
	dense_position: Vec<u32>,
	free: Vec<u32>,
}

impl<T: Default> Pool<T> {
	pub fn with_capacity(capacity: usize) -> Self {
		assert!(capacity > 0 && capacity < INDEX_MASK as usize, "pool capacity outside the handle index range");
		let mut slots = Vec::with_capacity(capacity);
		slots.resize_with(capacity, T::default);
		Self {
			slots,
			generations: vec![0; capacity],
			dense: Vec::with_capacity(capacity),
			dense_position: vec![NOT_LIVE; capacity],
			// Reversed so slot 0 is handed out first (keeps low indices hot in cache).
			free: (0..capacity as u32).rev().collect(),
		}
	}
}

impl<T> Pool<T> {
	#[inline]
	pub fn capacity(&self) -> usize {
		self.slots.len()
	}

	#[inline]
	pub fn len(&self) -> usize {
		self.dense.len()
	}

	#[inline]
	pub fn is_empty(&self) -> bool {
		self.dense.is_empty()
	}

	/// Moves `value` into a free slot. Returns `None` when the pool is exhausted — callers decide the policy (drop the
	/// spawn, recycle the farthest entity…); the pool itself never grows.
	pub fn spawn(&mut self, value: T) -> Option<Handle> {
		let index = self.free.pop()?;
		let slot = index as usize;
		self.slots[slot] = value;
		self.dense_position[slot] = self.dense.len() as u32;
		self.dense.push(index);
		Some(Handle::new(index, self.generations[slot]))
	}

	pub fn despawn(&mut self, handle: Handle) -> bool {
		if !self.contains(handle) {
			return false;
		}
		let slot = handle.index();
		let position = self.dense_position[slot] as usize;
		self.dense.swap_remove(position);
		if let Some(&moved) = self.dense.get(position) {
			self.dense_position[moved as usize] = position as u32;
		}
		self.dense_position[slot] = NOT_LIVE;
		self.generations[slot] = (self.generations[slot] + 1) & GENERATION_MASK;
		self.free.push(slot as u32);
		true
	}

	#[inline]
	pub fn contains(&self, handle: Handle) -> bool {
		let slot = handle.index();
		slot < self.slots.len() && self.dense_position[slot] != NOT_LIVE && self.generations[slot] == handle.generation()
	}

	#[inline]
	pub fn get(&self, handle: Handle) -> Option<&T> {
		self.contains(handle).then(|| &self.slots[handle.index()])
	}

	#[inline]
	pub fn get_mut(&mut self, handle: Handle) -> Option<&mut T> {
		if self.contains(handle) {
			Some(&mut self.slots[handle.index()])
		} else {
			None
		}
	}

	/// Handle of a live slot. Slot indices come from the spatial grid, which is rebuilt from live entities each tick.
	#[inline]
	pub fn handle_at(&self, slot: usize) -> Handle {
		Handle::new(slot as u32, self.generations[slot])
	}

	/// Unchecked-by-generation access for hot loops that already hold a slot index from the current tick's grid.
	#[inline]
	pub fn slot(&self, slot: usize) -> &T {
		&self.slots[slot]
	}

	#[inline]
	pub fn slot_mut(&mut self, slot: usize) -> &mut T {
		&mut self.slots[slot]
	}

	pub fn for_each(&self, mut visit: impl FnMut(Handle, &T)) {
		for &index in &self.dense {
			let slot = index as usize;
			visit(Handle::new(index, self.generations[slot]), &self.slots[slot]);
		}
	}

	/// Spawning or despawning inside `visit` is impossible by construction (the pool is mutably borrowed); collect
	/// handles into a pre-allocated queue and apply them after the pass.
	pub fn for_each_mut(&mut self, mut visit: impl FnMut(Handle, &mut T)) {
		let Self { slots, generations, dense, .. } = self;
		for &index in dense.iter() {
			let slot = index as usize;
			visit(Handle::new(index, generations[slot]), &mut slots[slot]);
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn stale_handles_are_rejected_after_slot_reuse() {
		let mut pool: Pool<u32> = Pool::with_capacity(1);
		let first = pool.spawn(7).unwrap();
		assert!(pool.despawn(first));
		let second = pool.spawn(9).unwrap();
		assert_eq!(first.index(), second.index());
		assert!(!pool.contains(first));
		assert_eq!(pool.get(second), Some(&9));
	}

	#[test]
	fn never_grows_past_capacity() {
		let mut pool: Pool<u32> = Pool::with_capacity(2);
		assert!(pool.spawn(1).is_some());
		assert!(pool.spawn(2).is_some());
		assert!(pool.spawn(3).is_none());
	}

	#[test]
	fn dense_list_stays_consistent_after_swap_remove() {
		let mut pool: Pool<u32> = Pool::with_capacity(4);
		let handles: Vec<Handle> = (0..4).map(|v| pool.spawn(v).unwrap()).collect();
		pool.despawn(handles[1]);
		pool.despawn(handles[3]);
		let mut seen = Vec::new();
		pool.for_each(|_, &v| seen.push(v));
		seen.sort_unstable();
		assert_eq!(seen, vec![0, 2]);
		assert!(pool.contains(handles[0]) && pool.contains(handles[2]));
	}
}
