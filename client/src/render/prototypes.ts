import { Color3, Matrix, MeshBuilder, StandardMaterial } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';

import { EntityKind } from '../net/protocol';
import type { EntityVisual } from './EntityRenderer';
import type { BiomePrototype } from './ThinInstanceBiome';

/** Mirrors `prototype` ids in src-tauri/src/world/pack.rs. */
export const PrototypeId = {
	Building: 0,
	TreeBroadleaf: 1,
	TreePalm: 2,
	Streetlight: 3,
} as const;

/**
 * Placeholder geometry until the baked sprite/mesh atlas from the legacy art pipeline is wired in. Every mesh has its
 * pivot at ground level so instance y = terrain height. Instance colours (thin-instance "color" buffer) multiply the
 * material's diffuse, so one material serves every tint variant.
 */
export function createBiomePrototypes(scene: Scene): BiomePrototype[] {
	const building = MeshBuilder.CreateBox('proto-building', { size: 1 }, scene);
	building.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
	building.material = material(scene, 'mat-building', new Color3(1, 1, 1));

	const broadleaf = MeshBuilder.CreateCylinder('proto-tree', { height: 6, diameterTop: 0, diameterBottom: 4, tessellation: 10 }, scene);
	broadleaf.bakeTransformIntoVertices(Matrix.Translation(0, 3, 0));
	broadleaf.material = material(scene, 'mat-tree', new Color3(0.25, 0.5, 0.22));
	const broadleafLod = MeshBuilder.CreateCylinder('proto-tree-lod', { height: 6, diameterTop: 0, diameterBottom: 4, tessellation: 4 }, scene);
	broadleafLod.bakeTransformIntoVertices(Matrix.Translation(0, 3, 0));
	broadleafLod.material = broadleaf.material;

	const palm = MeshBuilder.CreateCylinder('proto-palm', { height: 8, diameterTop: 3.5, diameterBottom: 0.4, tessellation: 8 }, scene);
	palm.bakeTransformIntoVertices(Matrix.Translation(0, 4, 0));
	palm.material = material(scene, 'mat-palm', new Color3(0.35, 0.55, 0.25));

	const streetlight = MeshBuilder.CreateBox('proto-streetlight', { width: 0.25, height: 6, depth: 0.25 }, scene);
	streetlight.bakeTransformIntoVertices(Matrix.Translation(0, 3, 0));
	streetlight.material = material(scene, 'mat-streetlight', new Color3(0.3, 0.3, 0.32));

	return [
		{ id: PrototypeId.Building, mesh: building, radius: 0.71, height: 1 },
		{ id: PrototypeId.TreeBroadleaf, mesh: broadleaf, lodMesh: broadleafLod, radius: 2, height: 6 },
		{ id: PrototypeId.TreePalm, mesh: palm, radius: 1.75, height: 8 },
		{ id: PrototypeId.Streetlight, mesh: streetlight, radius: 0.2, height: 6 },
	];
}

export function createEntityVisuals(scene: Scene): EntityVisual[] {
	const person = (name: string, color: Color3): Mesh => {
		const mesh = MeshBuilder.CreateCapsule(name, { height: 1.8, radius: 0.35, tessellation: 8 }, scene);
		mesh.bakeTransformIntoVertices(Matrix.Translation(0, 0.9, 0));
		mesh.material = material(scene, `mat-${name}`, color);
		return mesh;
	};
	const projectile = MeshBuilder.CreateBox('entity-projectile', { width: 0.08, height: 0.08, depth: 1.2 }, scene);
	const projectileMaterial = material(scene, 'mat-projectile', new Color3(1, 0.85, 0.3));
	projectileMaterial.emissiveColor = new Color3(1, 0.8, 0.2);
	projectile.material = projectileMaterial;

	return [
		{ kind: EntityKind.Pedestrian, mesh: person('entity-pedestrian', new Color3(0.75, 0.62, 0.5)), capacity: 4096 },
		{ kind: EntityKind.Player, mesh: person('entity-player', new Color3(0.9, 0.2, 0.2)), capacity: 1 },
		{ kind: EntityKind.Police, mesh: person('entity-police', new Color3(0.15, 0.25, 0.7)), capacity: 256 },
		{ kind: EntityKind.Gangster, mesh: person('entity-gangster', new Color3(0.15, 0.15, 0.15)), capacity: 512 },
		{ kind: EntityKind.Projectile, mesh: projectile, capacity: 1024 },
	];
}

function material(scene: Scene, name: string, diffuse: Color3): StandardMaterial {
	const result = new StandardMaterial(name, scene);
	result.diffuseColor = diffuse;
	result.specularColor = Color3.Black();
	return result;
}
