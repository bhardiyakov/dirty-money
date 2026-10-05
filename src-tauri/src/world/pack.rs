//! World pack: the single source of truth for static world data, shared by physics (colliders) and rendering (biome
//! instances). Loaded once; instances are pre-bucketed into per-chunk binary payloads so serving a chunk is a slice copy.
//!
//! File layout ("DMWP", little-endian):
//!   0 u32 magic │ 4 u16 version │ 6 u16 reserved │ 8 f32 min_x │ 12 f32 min_z │ 16 f32 max_x │ 20 f32 max_z
//!   24 f32 chunk_size │ 28 u32 seed │ 32 u32 collider_count │ 36 u32 instance_count
//!   colliders: collider_count × (min_x, min_z, max_x, max_z: f32)
//!   instances: instance_count × (u16 prototype, u16 reserved, x, y, z, yaw, scale_x, scale_y, scale_z: f32, u32 tint)
//!
//! The pack is produced offline by exporting the legacy JS map generator (MapData/WorldBuilder) — see
//! docs/architecture-tauri.md. Until that exporter exists, `procedural_test_world` provides a stand-in city.

use std::collections::{BTreeMap, HashMap};
use std::fmt;
use std::path::Path;

use serde::Serialize;

use crate::net::protocol::{
	CHUNK_GROUP_HEADER_SIZE, CHUNK_HEADER_SIZE, CHUNK_INSTANCE_SIZE, CHUNK_MAGIC, PROTOCOL_VERSION,
};
use crate::sim::math::Rng;
use crate::sim::spatial::Aabb;

const PACK_MAGIC: u32 = u32::from_le_bytes(*b"DMWP");
const PACK_VERSION: u16 = 1;

/// Prototype ids, mirrored in `client/src/render/prototypes.ts`.
pub mod prototype {
	pub const BUILDING: u16 = 0;
	pub const TREE_BROADLEAF: u16 = 1;
	pub const TREE_PALM: u16 = 2;
	pub const STREETLIGHT: u16 = 3;
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldBounds {
	pub min_x: f32,
	pub min_z: f32,
	pub max_x: f32,
	pub max_z: f32,
}

impl WorldBounds {
	pub fn contains(&self, x: f32, z: f32) -> bool {
		x >= self.min_x && x <= self.max_x && z >= self.min_z && z <= self.max_z
	}
}

#[derive(Clone, Copy, Debug)]
pub struct InstanceRecord {
	pub prototype: u16,
	pub x: f32,
	pub y: f32,
	pub z: f32,
	/// Babylon yaw (rotation about +Y), authored in client space.
	pub yaw: f32,
	pub scale_x: f32,
	pub scale_y: f32,
	pub scale_z: f32,
	/// RGBA8, R in the low byte.
	pub tint: u32,
}

#[derive(Debug)]
pub enum PackError {
	Io(std::io::Error),
	Format(&'static str),
}

impl fmt::Display for PackError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Self::Io(error) => write!(f, "io error: {error}"),
			Self::Format(reason) => write!(f, "malformed world pack: {reason}"),
		}
	}
}

pub struct WorldPack {
	pub bounds: WorldBounds,
	pub chunk_size: f32,
	pub seed: u32,
	pub colliders: Vec<Aabb>,
	chunks: HashMap<(i32, i32), Vec<u8>>,
}

impl WorldPack {
	pub fn load_or_procedural(path: &Path) -> Self {
		match Self::load(path) {
			Ok(pack) => pack,
			Err(error) => {
				eprintln!("world pack {} unavailable ({error}); using the procedural test world", path.display());
				Self::procedural_test_world(20_261_003)
			}
		}
	}

	pub fn load(path: &Path) -> Result<Self, PackError> {
		let bytes = std::fs::read(path).map_err(PackError::Io)?;
		let mut reader = ByteReader::new(&bytes);
		if reader.u32()? != PACK_MAGIC {
			return Err(PackError::Format("bad magic"));
		}
		if reader.u16()? != PACK_VERSION {
			return Err(PackError::Format("unsupported version"));
		}
		reader.u16()?;
		let bounds = WorldBounds { min_x: reader.f32()?, min_z: reader.f32()?, max_x: reader.f32()?, max_z: reader.f32()? };
		let chunk_size = reader.f32()?;
		let seed = reader.u32()?;
		let collider_count = reader.u32()? as usize;
		let instance_count = reader.u32()? as usize;

		let mut colliders = Vec::with_capacity(collider_count);
		for _ in 0..collider_count {
			colliders.push(Aabb::new(reader.f32()?, reader.f32()?, reader.f32()?, reader.f32()?));
		}
		let mut instances = Vec::with_capacity(instance_count);
		for _ in 0..instance_count {
			let prototype = reader.u16()?;
			reader.u16()?;
			instances.push(InstanceRecord {
				prototype,
				x: reader.f32()?,
				y: reader.f32()?,
				z: reader.f32()?,
				yaw: reader.f32()?,
				scale_x: reader.f32()?,
				scale_y: reader.f32()?,
				scale_z: reader.f32()?,
				tint: reader.u32()?,
			});
		}
		Ok(Self::from_parts(bounds, chunk_size, seed, colliders, &instances))
	}

	pub fn from_parts(
		bounds: WorldBounds,
		chunk_size: f32,
		seed: u32,
		colliders: Vec<Aabb>,
		instances: &[InstanceRecord],
	) -> Self {
		assert!(chunk_size > 0.0, "chunk size must be positive");
		let mut buckets: HashMap<(i32, i32), BTreeMap<u16, Vec<&InstanceRecord>>> = HashMap::new();
		for instance in instances {
			let key = ((instance.x / chunk_size).floor() as i32, (instance.z / chunk_size).floor() as i32);
			buckets.entry(key).or_default().entry(instance.prototype).or_default().push(instance);
		}
		let chunks = buckets.into_iter().map(|(key, groups)| (key, encode_chunk(key, &groups))).collect();
		Self { bounds, chunk_size, seed, colliders, chunks }
	}

	/// Empty slice for chunks without instances (the client still marks them resident).
	pub fn chunk_bytes(&self, chunk_x: i32, chunk_z: i32) -> &[u8] {
		self.chunks.get(&(chunk_x, chunk_z)).map(Vec::as_slice).unwrap_or(&[])
	}

	/// Stand-in until the legacy map exporter lands: a 16 × 16 block downtown, streetlights along every road and
	/// forest/palms across the rest of the 2500 × 2500 u island.
	pub fn procedural_test_world(seed: u32) -> Self {
		const BLOCK_PITCH: f32 = 64.0;
		const ROAD_HALF_WIDTH: f32 = 7.0;
		const CITY_BLOCKS: i32 = 8;
		const LAMP_SPACING: f32 = 16.0;
		const TRUNK_HALF: f32 = 0.3;
		const TREE_COUNT: usize = 24_000;

		let bounds = WorldBounds { min_x: -1500.0, min_z: -1250.0, max_x: 1000.0, max_z: 1250.0 };
		let city_extent = CITY_BLOCKS as f32 * BLOCK_PITCH;
		let mut rng = Rng::new(seed);
		let mut colliders = Vec::new();
		let mut instances = Vec::new();

		for block_x in -CITY_BLOCKS..CITY_BLOCKS {
			for block_z in -CITY_BLOCKS..CITY_BLOCKS {
				let x0 = block_x as f32 * BLOCK_PITCH + ROAD_HALF_WIDTH;
				let z0 = block_z as f32 * BLOCK_PITCH + ROAD_HALF_WIDTH;
				let lot = (BLOCK_PITCH - 2.0 * ROAD_HALF_WIDTH) * 0.5;
				for (lot_x, lot_z) in [(0.0, 0.0), (lot, 0.0), (0.0, lot), (lot, lot)] {
					let inset = rng.range(1.0, 4.0);
					let (min_x, min_z) = (x0 + lot_x + inset, z0 + lot_z + inset);
					let (max_x, max_z) = (x0 + lot_x + lot - inset, z0 + lot_z + lot - inset);
					let height = rng.range(6.0, 48.0);
					colliders.push(Aabb::new(min_x, min_z, max_x, max_z));
					instances.push(InstanceRecord {
						prototype: prototype::BUILDING,
						x: (min_x + max_x) * 0.5,
						y: 0.0,
						z: (min_z + max_z) * 0.5,
						yaw: 0.0,
						scale_x: max_x - min_x,
						scale_y: height,
						scale_z: max_z - min_z,
						tint: pastel_tint(&mut rng),
					});
				}
			}
		}

		let mut road = -city_extent;
		while road <= city_extent {
			let mut along = -city_extent;
			while along <= city_extent {
				let offset = ROAD_HALF_WIDTH - 1.0;
				for (x, z) in [(road + offset, along), (along, road + offset)] {
					colliders.push(Aabb::new(x - 0.15, z - 0.15, x + 0.15, z + 0.15));
					instances.push(InstanceRecord {
						prototype: prototype::STREETLIGHT,
						x,
						y: 0.0,
						z,
						yaw: 0.0,
						scale_x: 1.0,
						scale_y: 1.0,
						scale_z: 1.0,
						tint: u32::MAX,
					});
				}
				along += LAMP_SPACING;
			}
			road += BLOCK_PITCH;
		}

		let city_margin = city_extent + 16.0;
		let mut planted = 0;
		while planted < TREE_COUNT {
			let x = rng.range(bounds.min_x, bounds.max_x);
			let z = rng.range(bounds.min_z, bounds.max_z);
			if x.abs() < city_margin && z.abs() < city_margin {
				continue;
			}
			let is_palm = x > 600.0;
			let scale = rng.range(0.7, 1.4);
			colliders.push(Aabb::new(x - TRUNK_HALF, z - TRUNK_HALF, x + TRUNK_HALF, z + TRUNK_HALF));
			instances.push(InstanceRecord {
				prototype: if is_palm { prototype::TREE_PALM } else { prototype::TREE_BROADLEAF },
				x,
				y: 0.0,
				z,
				yaw: rng.range(0.0, std::f32::consts::TAU),
				scale_x: scale,
				scale_y: scale * rng.range(0.85, 1.2),
				scale_z: scale,
				tint: foliage_tint(&mut rng),
			});
			planted += 1;
		}

		Self::from_parts(bounds, 128.0, seed, colliders, &instances)
	}
}

fn encode_chunk(key: (i32, i32), groups: &BTreeMap<u16, Vec<&InstanceRecord>>) -> Vec<u8> {
	let instance_total: usize = groups.values().map(Vec::len).sum();
	let mut bytes = Vec::with_capacity(
		CHUNK_HEADER_SIZE + groups.len() * CHUNK_GROUP_HEADER_SIZE + instance_total * CHUNK_INSTANCE_SIZE,
	);
	bytes.extend_from_slice(&CHUNK_MAGIC.to_le_bytes());
	bytes.extend_from_slice(&PROTOCOL_VERSION.to_le_bytes());
	bytes.extend_from_slice(&(groups.len() as u16).to_le_bytes());
	bytes.extend_from_slice(&key.0.to_le_bytes());
	bytes.extend_from_slice(&key.1.to_le_bytes());
	for (&prototype, records) in groups {
		bytes.extend_from_slice(&prototype.to_le_bytes());
		bytes.extend_from_slice(&0u16.to_le_bytes());
		bytes.extend_from_slice(&(records.len() as u32).to_le_bytes());
		for record in records {
			for value in [
				record.x,
				record.y,
				record.z,
				record.yaw,
				record.scale_x,
				record.scale_y,
				record.scale_z,
			] {
				bytes.extend_from_slice(&value.to_le_bytes());
			}
			bytes.extend_from_slice(&record.tint.to_le_bytes());
		}
	}
	bytes
}

fn rgba(r: f32, g: f32, b: f32) -> u32 {
	let channel = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u32;
	channel(r) | channel(g) << 8 | channel(b) << 16 | 0xFF << 24
}

fn pastel_tint(rng: &mut Rng) -> u32 {
	rgba(rng.range(0.65, 1.0), rng.range(0.6, 0.95), rng.range(0.55, 0.9))
}

fn foliage_tint(rng: &mut Rng) -> u32 {
	let shade = rng.range(0.8, 1.15);
	rgba(0.85 * shade, shade, 0.8 * shade)
}

struct ByteReader<'a> {
	bytes: &'a [u8],
	offset: usize,
}

impl<'a> ByteReader<'a> {
	fn new(bytes: &'a [u8]) -> Self {
		Self { bytes, offset: 0 }
	}

	fn take<const N: usize>(&mut self) -> Result<[u8; N], PackError> {
		let end = self.offset + N;
		let slice = self.bytes.get(self.offset..end).ok_or(PackError::Format("unexpected end of file"))?;
		self.offset = end;
		Ok(slice.try_into().expect("slice length equals N"))
	}

	fn u16(&mut self) -> Result<u16, PackError> {
		self.take::<2>().map(u16::from_le_bytes)
	}

	fn u32(&mut self) -> Result<u32, PackError> {
		self.take::<4>().map(u32::from_le_bytes)
	}

	fn f32(&mut self) -> Result<f32, PackError> {
		self.take::<4>().map(f32::from_le_bytes)
	}
}
