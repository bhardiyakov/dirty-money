//! Build-mode placement grid (src/placement/GridPersistence.js), kept here so the WebView never holds or serializes the
//! whole city. The game streams deltas in; Rust keeps the WORKING grid, indexed by chunk, and answers chunk loads.
//! Disk follows the game's save rules: nothing is written until the player saves (`grid_commit_slot`), and loading a save
//! (`grid_open_slot`) replaces the working grid with that slot's file. Files are written by one writer thread, atomically
//! (temporary file + rename), so a save never stalls the WebView or leaves a half-written slot behind.
//!
//! Wire format (little-endian), shared with GridPersistence.js:
//!   batch   u8 version │ u8 reserved │ u8 micro_per_macro │ u8 reserved │ u16 chunk_micro_cells │ u16 count │ count × record
//!   record  u32 id │ u16 definition │ u8 kind (1 place, 2 remove) │ u8 layer (0 macro, 1 micro) │ i16 level │ u8 rotation │
//!           u8 reserved │ i32 cell_x │ i32 cell_z │ u16 width │ u16 depth
//!   slot file = one or more batches of `place` records; `grid_load_chunk` answers with bare records.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;
use std::thread;

pub const WIRE_VERSION: u8 = 1;
pub const HEADER_SIZE: usize = 8;
pub const RECORD_SIZE: usize = 24;
const KIND_PLACE: u8 = 1;
const KIND_REMOVE: u8 = 2;
const LAYER_MACRO: u8 = 0;
const MAX_RECORDS_PER_BATCH: usize = u16::MAX as usize;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct GridGeometry {
	pub micro_per_macro: i32,
	pub chunk_micro_cells: i32,
}

impl Default for GridGeometry {
	fn default() -> Self {
		Self { micro_per_macro: 8, chunk_micro_cells: 128 }
	}
}

#[derive(Clone, Copy, Debug)]
pub struct PlacementRecord {
	pub id: u32,
	pub level: i16,
	pub layer: u8,
	pub cell_x: i32,
	pub cell_z: i32,
	pub width: u16,
	pub depth: u16,
	bytes: [u8; RECORD_SIZE],
}

impl PlacementRecord {
	fn parse(bytes: &[u8]) -> (u8, Self) {
		let u16_at = |offset: usize| u16::from_le_bytes([bytes[offset], bytes[offset + 1]]);
		let i32_at = |offset: usize| i32::from_le_bytes([bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]]);
		let mut stored = [0u8; RECORD_SIZE];
		stored.copy_from_slice(&bytes[..RECORD_SIZE]);
		stored[6] = KIND_PLACE;
		let record = Self {
			id: u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]),
			layer: bytes[7],
			level: u16_at(8) as i16,
			cell_x: i32_at(12),
			cell_z: i32_at(16),
			width: u16_at(20).max(1),
			depth: u16_at(22).max(1),
			bytes: stored,
		};
		(bytes[6], record)
	}

	/// Inclusive chunk range covered by the footprint, in chunk coordinates.
	fn chunk_range(&self, geometry: GridGeometry) -> (i32, i32, i32, i32) {
		let cells_per_chunk = if self.layer == LAYER_MACRO {
			(geometry.chunk_micro_cells / geometry.micro_per_macro).max(1)
		} else {
			geometry.chunk_micro_cells.max(1)
		};
		let to_chunk = |cell: i32| cell.div_euclid(cells_per_chunk);
		(
			to_chunk(self.cell_x),
			to_chunk(self.cell_z),
			to_chunk(self.cell_x + self.width as i32 - 1),
			to_chunk(self.cell_z + self.depth as i32 - 1),
		)
	}
}

type ChunkKey = (i16, i32, i32);

/// The whole city's placements, in memory, with a chunk → ids index for `grid_load_chunk`.
#[derive(Default)]
pub struct WorkingGrid {
	geometry: GridGeometry,
	records_by_id: HashMap<u32, PlacementRecord>,
	ids_by_chunk: HashMap<ChunkKey, HashSet<u32>>,
}

impl WorkingGrid {
	#[cfg(test)]
	fn len(&self) -> usize {
		self.records_by_id.len()
	}

	pub fn next_placement_id(&self) -> u32 {
		self.records_by_id.keys().max().map_or(1, |max_id| max_id + 1)
	}

	/// Applies one or more concatenated batches. A malformed batch is rejected whole, before anything changes.
	pub fn apply_batches(&mut self, bytes: &[u8]) -> Result<usize, String> {
		let batches = split_batches(bytes)?;
		let mut applied_records = 0;
		for (geometry, records) in batches {
			self.set_geometry(geometry);
			for record_bytes in records.chunks_exact(RECORD_SIZE) {
				let (kind, record) = PlacementRecord::parse(record_bytes);
				if kind == KIND_REMOVE {
					self.remove(record.id);
				} else {
					self.insert(record);
				}
				applied_records += 1;
			}
		}
		Ok(applied_records)
	}

	/// Every placement overlapping the chunk, as bare records.
	pub fn chunk_records(&self, level: i16, chunk_x: i32, chunk_z: i32) -> Vec<u8> {
		let Some(ids) = self.ids_by_chunk.get(&(level, chunk_x, chunk_z)) else {
			return Vec::new();
		};
		let mut answer = Vec::with_capacity(ids.len() * RECORD_SIZE);
		for id in ids {
			if let Some(record) = self.records_by_id.get(id) {
				answer.extend_from_slice(&record.bytes);
			}
		}
		answer
	}

	/// The slot file: every record as `place`, split into batches that fit the u16 count.
	pub fn encode_snapshot(&self) -> Vec<u8> {
		let records: Vec<&PlacementRecord> = self.records_by_id.values().collect();
		let mut bytes = Vec::with_capacity(records.len() * RECORD_SIZE + HEADER_SIZE);
		for batch in records.chunks(MAX_RECORDS_PER_BATCH) {
			bytes.extend_from_slice(&encode_header(self.geometry, batch.len()));
			for record in batch {
				bytes.extend_from_slice(&record.bytes);
			}
		}
		bytes
	}

	/// The chunk index depends on the geometry: if the game changes it, every record is indexed again.
	fn set_geometry(&mut self, geometry: GridGeometry) {
		if geometry == self.geometry {
			return;
		}
		self.geometry = geometry;
		self.ids_by_chunk.clear();
		let records: Vec<PlacementRecord> = self.records_by_id.values().copied().collect();
		for record in records {
			self.index(record);
		}
	}

	fn insert(&mut self, record: PlacementRecord) {
		self.remove(record.id);
		self.records_by_id.insert(record.id, record);
		self.index(record);
	}

	fn index(&mut self, record: PlacementRecord) {
		let (min_x, min_z, max_x, max_z) = record.chunk_range(self.geometry);
		for chunk_x in min_x..=max_x {
			for chunk_z in min_z..=max_z {
				self.ids_by_chunk.entry((record.level, chunk_x, chunk_z)).or_default().insert(record.id);
			}
		}
	}

	fn remove(&mut self, id: u32) {
		let Some(record) = self.records_by_id.remove(&id) else {
			return;
		};
		let (min_x, min_z, max_x, max_z) = record.chunk_range(self.geometry);
		for chunk_x in min_x..=max_x {
			for chunk_z in min_z..=max_z {
				let key = (record.level, chunk_x, chunk_z);
				if let Some(ids) = self.ids_by_chunk.get_mut(&key) {
					ids.remove(&id);
					if ids.is_empty() {
						self.ids_by_chunk.remove(&key);
					}
				}
			}
		}
	}
}

fn encode_header(geometry: GridGeometry, count: usize) -> [u8; HEADER_SIZE] {
	let chunk_micro_cells = (geometry.chunk_micro_cells as u16).to_le_bytes();
	let count = (count as u16).to_le_bytes();
	[WIRE_VERSION, 0, geometry.micro_per_macro as u8, 0, chunk_micro_cells[0], chunk_micro_cells[1], count[0], count[1]]
}

/// Every batch of `bytes`, fully checked (sizes and delta kinds) before the caller changes anything.
fn split_batches(mut bytes: &[u8]) -> Result<Vec<(GridGeometry, &[u8])>, String> {
	let mut batches = Vec::new();
	while !bytes.is_empty() {
		let (geometry, records, rest) = parse_batch(bytes)?;
		if let Some(unknown) = records.chunks_exact(RECORD_SIZE).map(|record| record[6]).find(|kind| *kind != KIND_PLACE && *kind != KIND_REMOVE) {
			return Err(format!("unknown grid delta kind {unknown}"));
		}
		batches.push((geometry, records));
		bytes = rest;
	}
	Ok(batches)
}

/// Splits off the first batch: (geometry, its record bytes, what follows it).
fn parse_batch(bytes: &[u8]) -> Result<(GridGeometry, &[u8], &[u8]), String> {
	if bytes.len() < HEADER_SIZE {
		return Err(format!("grid batch of {} bytes is shorter than its header", bytes.len()));
	}
	if bytes[0] != WIRE_VERSION {
		return Err(format!("grid batch version {} (expected {WIRE_VERSION})", bytes[0]));
	}
	let geometry = GridGeometry {
		micro_per_macro: bytes[2].max(1) as i32,
		chunk_micro_cells: u16::from_le_bytes([bytes[4], bytes[5]]).max(1) as i32,
	};
	let count = u16::from_le_bytes([bytes[6], bytes[7]]) as usize;
	let end = HEADER_SIZE + count * RECORD_SIZE;
	if bytes.len() < end {
		return Err(format!("grid batch declares {count} records but holds {} bytes", bytes.len() - HEADER_SIZE));
	}
	Ok((geometry, &bytes[HEADER_SIZE..end], &bytes[end..]))
}

enum DiskJob {
	Write { path: PathBuf, bytes: Vec<u8> },
	Delete { path: PathBuf },
	Flush { done: Sender<()> },
}

/// Tauri state: the working grid plus the writer thread that owns every disk write of the slot files.
pub struct GridService {
	working: Mutex<WorkingGrid>,
	directory: PathBuf,
	disk: Sender<DiskJob>,
}

impl GridService {
	pub fn new(directory: PathBuf) -> Self {
		let (disk, jobs) = mpsc::channel::<DiskJob>();
		thread::Builder::new()
			.name("grid-writer".into())
			.spawn(move || {
				for job in jobs {
					let result = match job {
						DiskJob::Write { path, bytes } => write_atomically(&path, &bytes),
						DiskJob::Delete { path } => match fs::remove_file(&path) {
							Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.to_string()),
							_ => Ok(()),
						},
						DiskJob::Flush { done } => {
							let _ = done.send(());
							Ok(())
						}
					};
					if let Err(error) = result {
						eprintln!("[grid] disk write failed: {error}");
					}
				}
			})
			.expect("failed to start the grid writer thread");
		Self { working: Mutex::new(WorkingGrid::default()), directory, disk }
	}

	fn working(&self) -> std::sync::MutexGuard<'_, WorkingGrid> {
		self.working.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
	}

	fn slot_path(&self, save_slot: u8) -> PathBuf {
		self.directory.join(format!("grid-slot{save_slot}.bin"))
	}

	/// Waits for queued writes, so a read right after a commit sees the new file.
	fn wait_for_disk(&self) {
		let (done, finished) = mpsc::channel();
		if self.disk.send(DiskJob::Flush { done }).is_ok() {
			let _ = finished.recv();
		}
	}

	pub fn apply_deltas(&self, bytes: &[u8]) -> Result<usize, String> {
		self.working().apply_batches(bytes)
	}

	pub fn load_chunk(&self, level: i16, chunk_x: i32, chunk_z: i32) -> Vec<u8> {
		self.working().chunk_records(level, chunk_x, chunk_z)
	}

	/// Replaces the working grid with the slot's file (an empty grid if the slot has none). Returns the next free id.
	pub fn open_slot(&self, save_slot: u8) -> Result<u32, String> {
		self.wait_for_disk();
		let mut loaded = WorkingGrid::default();
		match fs::read(self.slot_path(save_slot)) {
			Ok(bytes) => {
				loaded.apply_batches(&bytes)?;
			}
			Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
			Err(error) => return Err(error.to_string()),
		}
		let next_placement_id = loaded.next_placement_id();
		*self.working() = loaded;
		Ok(next_placement_id)
	}

	pub fn reset_working(&self) {
		*self.working() = WorkingGrid::default();
	}

	/// Snapshot taken under the lock (fast, memory only); encoding and the file write happen on the writer thread.
	pub fn commit_slot(&self, save_slot: u8) -> Result<(), String> {
		let bytes = self.working().encode_snapshot();
		self.disk.send(DiskJob::Write { path: self.slot_path(save_slot), bytes }).map_err(|error| error.to_string())
	}

	pub fn delete_slot(&self, save_slot: u8) -> Result<(), String> {
		self.disk.send(DiskJob::Delete { path: self.slot_path(save_slot) }).map_err(|error| error.to_string())
	}
}

fn write_atomically(path: &Path, bytes: &[u8]) -> Result<(), String> {
	if let Some(parent) = path.parent() {
		fs::create_dir_all(parent).map_err(|error| error.to_string())?;
	}
	let temporary_path = path.with_extension("bin.tmp");
	fs::write(&temporary_path, bytes).map_err(|error| error.to_string())?;
	fs::rename(&temporary_path, path).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
	use super::*;

	fn record(id: u32, kind: u8, layer: u8, cell_x: i32, cell_z: i32, width: u16, depth: u16) -> Vec<u8> {
		let mut bytes = vec![0u8; RECORD_SIZE];
		bytes[0..4].copy_from_slice(&id.to_le_bytes());
		bytes[4..6].copy_from_slice(&7u16.to_le_bytes());
		bytes[6] = kind;
		bytes[7] = layer;
		bytes[12..16].copy_from_slice(&cell_x.to_le_bytes());
		bytes[16..20].copy_from_slice(&cell_z.to_le_bytes());
		bytes[20..22].copy_from_slice(&width.to_le_bytes());
		bytes[22..24].copy_from_slice(&depth.to_le_bytes());
		bytes
	}

	fn batch(records: &[Vec<u8>]) -> Vec<u8> {
		let mut bytes = encode_header(GridGeometry::default(), records.len()).to_vec();
		for record in records {
			bytes.extend_from_slice(record);
		}
		bytes
	}

	#[test]
	fn straddling_record_is_indexed_in_every_chunk_it_covers() {
		let mut grid = WorkingGrid::default();
		// Macro cell 15 is the last of chunk 0 (16 macro cells per chunk); width 2 spills into chunk 1.
		grid.apply_batches(&batch(&[record(1, KIND_PLACE, LAYER_MACRO, 15, 0, 2, 1)])).unwrap();
		assert_eq!(grid.chunk_records(0, 0, 0).len(), RECORD_SIZE);
		assert_eq!(grid.chunk_records(0, 1, 0).len(), RECORD_SIZE);
		assert!(grid.chunk_records(0, 2, 0).is_empty());
	}

	#[test]
	fn negative_cells_use_floor_division() {
		let mut grid = WorkingGrid::default();
		grid.apply_batches(&batch(&[record(1, KIND_PLACE, 1, -1, -128, 1, 1)])).unwrap();
		assert_eq!(grid.chunk_records(0, -1, -1).len(), RECORD_SIZE);
	}

	#[test]
	fn remove_clears_the_index_and_snapshot_round_trips() {
		let mut grid = WorkingGrid::default();
		grid.apply_batches(&batch(&[record(1, KIND_PLACE, 1, 0, 0, 2, 2), record(2, KIND_PLACE, 1, 4, 4, 1, 1)])).unwrap();
		grid.apply_batches(&batch(&[record(1, KIND_REMOVE, 1, 0, 0, 2, 2)])).unwrap();
		assert_eq!(grid.len(), 1);
		let mut reloaded = WorkingGrid::default();
		reloaded.apply_batches(&grid.encode_snapshot()).unwrap();
		assert_eq!(reloaded.len(), 1);
		assert_eq!(reloaded.next_placement_id(), 3);
		assert_eq!(reloaded.chunk_records(0, 0, 0)[6], KIND_PLACE);
	}

	#[test]
	fn malformed_input_changes_nothing() {
		let mut grid = WorkingGrid::default();
		let mut truncated = batch(&[record(1, KIND_PLACE, 1, 0, 0, 1, 1)]);
		truncated.truncate(truncated.len() - 1);
		assert!(grid.apply_batches(&truncated).is_err());
		let mut bad_second_batch = batch(&[record(2, KIND_PLACE, 1, 0, 0, 1, 1)]);
		bad_second_batch.extend(batch(&[record(3, 9, 1, 0, 0, 1, 1)]));
		assert!(grid.apply_batches(&bad_second_batch).is_err());
		assert_eq!(grid.len(), 0);
	}
}
