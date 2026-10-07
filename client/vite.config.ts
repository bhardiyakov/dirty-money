import { defineConfig } from 'vite';

// Tauri serves the dev server inside the WebView; the port must match tauri.conf.json → build.devUrl.
export default defineConfig({
	clearScreen: false,
	server: {
		port: 5173,
		strictPort: true,
	},
	build: {
		target: 'es2022',
		sourcemap: true,
	},
});
