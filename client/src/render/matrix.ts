/**
 * Writes a Babylon matrix (row-vector convention, translation in elements 12–14) for scale → yaw → translate straight
 * into a Float32Array. Replaces Matrix.Compose + copyToArray: no temporaries, no quaternion round-trip.
 */
export function writeTrsMatrix(
	out: Float32Array,
	offset: number,
	x: number,
	y: number,
	z: number,
	yaw: number,
	scaleX: number,
	scaleY: number,
	scaleZ: number,
): void {
	const cos = Math.cos(yaw);
	const sin = Math.sin(yaw);
	out[offset] = cos * scaleX;
	out[offset + 1] = 0;
	out[offset + 2] = -sin * scaleX;
	out[offset + 3] = 0;
	out[offset + 4] = 0;
	out[offset + 5] = scaleY;
	out[offset + 6] = 0;
	out[offset + 7] = 0;
	out[offset + 8] = sin * scaleZ;
	out[offset + 9] = 0;
	out[offset + 10] = cos * scaleZ;
	out[offset + 11] = 0;
	out[offset + 12] = x;
	out[offset + 13] = y;
	out[offset + 14] = z;
	out[offset + 15] = 1;
}

/** Server headings are atan2(dz, dx); meshes are authored facing +Z, so yaw = π/2 − heading. */
export function headingToYaw(heading: number): number {
	return Math.PI * 0.5 - heading;
}
