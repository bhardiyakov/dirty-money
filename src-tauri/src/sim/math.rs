//! Ground-plane math. The simulation is 2.5D: movement and collision live on X/Z, height is carried separately.

use std::ops::{Add, AddAssign, Div, Mul, Neg, Sub, SubAssign};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec2 {
	pub x: f32,
	pub z: f32,
}

impl Vec2 {
	pub const ZERO: Self = Self { x: 0.0, z: 0.0 };
	pub const X: Self = Self { x: 1.0, z: 0.0 };

	#[inline]
	pub const fn new(x: f32, z: f32) -> Self {
		Self { x, z }
	}

	/// Unit vector for an angle measured from +X towards +Z (the convention used for every heading on the wire).
	#[inline]
	pub fn from_angle(angle: f32) -> Self {
		let (sin, cos) = angle.sin_cos();
		Self::new(cos, sin)
	}

	#[inline]
	pub fn angle(self) -> f32 {
		self.z.atan2(self.x)
	}

	#[inline]
	pub fn dot(self, other: Self) -> f32 {
		self.x * other.x + self.z * other.z
	}

	#[inline]
	pub fn length_squared(self) -> f32 {
		self.dot(self)
	}

	#[inline]
	pub fn length(self) -> f32 {
		self.length_squared().sqrt()
	}

	#[inline]
	pub fn normalize_or(self, fallback: Self) -> Self {
		let length_squared = self.length_squared();
		if length_squared > 1e-12 {
			self * length_squared.sqrt().recip()
		} else {
			fallback
		}
	}

	#[inline]
	pub fn clamp_length(self, max: f32) -> Self {
		let length_squared = self.length_squared();
		if length_squared > max * max {
			self * (max / length_squared.sqrt())
		} else {
			self
		}
	}

	#[inline]
	pub fn lerp(self, target: Self, t: f32) -> Self {
		self + (target - self) * t
	}
}

impl Add for Vec2 {
	type Output = Self;

	#[inline]
	fn add(self, rhs: Self) -> Self {
		Self::new(self.x + rhs.x, self.z + rhs.z)
	}
}

impl Sub for Vec2 {
	type Output = Self;

	#[inline]
	fn sub(self, rhs: Self) -> Self {
		Self::new(self.x - rhs.x, self.z - rhs.z)
	}
}

impl Mul<f32> for Vec2 {
	type Output = Self;

	#[inline]
	fn mul(self, rhs: f32) -> Self {
		Self::new(self.x * rhs, self.z * rhs)
	}
}

impl Div<f32> for Vec2 {
	type Output = Self;

	#[inline]
	fn div(self, rhs: f32) -> Self {
		Self::new(self.x / rhs, self.z / rhs)
	}
}

impl Neg for Vec2 {
	type Output = Self;

	#[inline]
	fn neg(self) -> Self {
		Self::new(-self.x, -self.z)
	}
}

impl AddAssign for Vec2 {
	#[inline]
	fn add_assign(&mut self, rhs: Self) {
		self.x += rhs.x;
		self.z += rhs.z;
	}
}

impl SubAssign for Vec2 {
	#[inline]
	fn sub_assign(&mut self, rhs: Self) {
		self.x -= rhs.x;
		self.z -= rhs.z;
	}
}

/// xorshift32: deterministic, allocation-free, good enough for gameplay randomness.
pub struct Rng(u32);

impl Rng {
	pub fn new(seed: u32) -> Self {
		Self(seed.max(1))
	}

	#[inline]
	pub fn next_u32(&mut self) -> u32 {
		let mut x = self.0;
		x ^= x << 13;
		x ^= x >> 17;
		x ^= x << 5;
		self.0 = x;
		x
	}

	/// Uniform in [0, 1).
	#[inline]
	pub fn next_f32(&mut self) -> f32 {
		(self.next_u32() >> 8) as f32 * (1.0 / 16_777_216.0)
	}

	#[inline]
	pub fn range(&mut self, min: f32, max: f32) -> f32 {
		min + (max - min) * self.next_f32()
	}
}
