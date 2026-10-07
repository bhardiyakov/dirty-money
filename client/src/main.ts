import {
	Color3,
	Color4,
	DirectionalLight,
	Engine,
	FreeCamera,
	HemisphericLight,
	MeshBuilder,
	Scene,
	ShadowGenerator,
	StandardMaterial,
	Vector3,
} from '@babylonjs/core';

import { InputSampler } from './input/InputSampler';
import { InterpolationBuffer } from './net/InterpolationBuffer';
import { SimLink } from './net/SimLink';
import { ChunkStreamer } from './render/ChunkStreamer';
import { EntityRenderer } from './render/EntityRenderer';
import { createBiomePrototypes, createEntityVisuals } from './render/prototypes';
import { ThinInstanceBiome } from './render/ThinInstanceBiome';

/** Matches the legacy CompassCamera: near-vertical, north (+Z) up, fixed height. */
const CAMERA_HEIGHT = 150;
const CAMERA_VIEW_HALF = 30;
const CAMERA_FOLLOW_RATE = 12;
const BIOME_LOD_DISTANCE = 220;
const SHADOW_MAP_SIZE = 2048;

async function bootstrap(): Promise<void> {
	const canvas = document.getElementById('scene') as HTMLCanvasElement;
	// rAF-driven: renders at the display refresh rate (144 Hz+) independent of the 60 TPS simulation.
	const engine = new Engine(canvas, true, {
		powerPreference: 'high-performance',
		stencil: false,
		preserveDrawingBuffer: false,
		adaptToDeviceRatio: true,
	});
	const scene = new Scene(engine);
	scene.clearColor = new Color4(0.42, 0.55, 0.38, 1);
	scene.skipPointerMovePicking = true;
	scene.skipPointerDownPicking = true;
	scene.skipPointerUpPicking = true;

	const camera = new FreeCamera('camera', new Vector3(0, CAMERA_HEIGHT, 0), scene);
	camera.upVector = new Vector3(0, 0, 1);
	camera.rotation = new Vector3(Math.PI / 2, 0, 0);
	camera.fov = 2 * Math.atan(CAMERA_VIEW_HALF / CAMERA_HEIGHT);
	camera.minZ = 20;
	camera.maxZ = 400;
	camera.inputs.clear();

	new HemisphericLight('sky', new Vector3(0, 1, 0), scene).intensity = 0.65;
	const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.3), scene);
	sun.intensity = 0.8;
	const shadows = new ShadowGenerator(SHADOW_MAP_SIZE, sun);
	shadows.usePercentageCloserFiltering = true;

	const ground = MeshBuilder.CreateGround('ground', { width: 2500, height: 2500 }, scene);
	ground.position.set(-250, 0, 0);
	const groundMaterial = new StandardMaterial('mat-ground', scene);
	groundMaterial.diffuseColor = new Color3(0.36, 0.5, 0.32);
	groundMaterial.specularColor = Color3.Black();
	ground.material = groundMaterial;
	ground.receiveShadows = true;
	ground.freezeWorldMatrix();

	const interpolation = new InterpolationBuffer();
	const link = new SimLink(interpolation);
	const world = await link.worldInfo();

	const biome = new ThinInstanceBiome(BIOME_LOD_DISTANCE);
	for (const prototype of createBiomePrototypes(scene)) {
		biome.register(prototype);
		prototype.mesh.receiveShadows = true;
	}
	const entities = new EntityRenderer();
	for (const visual of createEntityVisuals(scene)) {
		entities.register(visual);
	}
	for (const caster of [...biome.shadowCasters(), ...entities.shadowCasters()]) {
		shadows.addShadowCaster(caster, false);
	}

	const streamer = new ChunkStreamer(camera, biome, link, {
		chunkSize: world.chunkSize,
		worldBounds: world.bounds,
		loadRadius: 2,
		unloadRadius: 3,
		maxConcurrentLoads: 2,
		cullingMargin: 24,
	});
	const input = new InputSampler(canvas, scene, camera);
	await link.connect();

	let focusX = 0;
	let focusZ = 0;
	let lastFrameSeconds = performance.now() / 1000;

	engine.runRenderLoop(() => {
		const now = performance.now() / 1000;
		const frameSeconds = Math.min(now - lastFrameSeconds, 0.1);
		lastFrameSeconds = now;

		const state = interpolation.sample(now);
		if (state.playerRow >= 0) {
			const follow = 1 - Math.exp(-CAMERA_FOLLOW_RATE * frameSeconds);
			focusX += (state.x[state.playerRow] - focusX) * follow;
			focusZ += (state.z[state.playerRow] - focusZ) * follow;
		}
		camera.position.set(focusX, CAMERA_HEIGHT, focusZ);

		streamer.update(focusX, focusZ);
		entities.render(state);
		const playerX = state.playerRow >= 0 ? state.x[state.playerRow] : focusX;
		const playerZ = state.playerRow >= 0 ? state.z[state.playerRow] : focusZ;
		input.flush(now, link, playerX, playerZ);
		scene.render();
	});
	window.addEventListener('resize', () => engine.resize());
}

bootstrap().catch((error: unknown) => {
	console.error('failed to start the client', error);
});
