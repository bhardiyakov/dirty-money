mod commands;
mod grid;
mod nav;
mod net;
mod runtime;
mod sim;
mod world;

use tauri::path::BaseDirectory;
use tauri::{Manager, RunEvent};

use grid::GridService;
use nav::NavService;
use runtime::SimRuntime;

const WORLD_PACK_RESOURCE: &str = "world/world.pack";

pub fn run() {
	tauri::Builder::default()
		.setup(|app| {
			let pack_path = app.path().resolve(WORLD_PACK_RESOURCE, BaseDirectory::Resource)?;
			app.manage(SimRuntime::new(pack_path));
			app.manage(NavService::default());
			app.manage(GridService::new(app.path().app_data_dir()?.join("grid")));
			Ok(())
		})
		.invoke_handler(tauri::generate_handler![
			commands::world_info,
			commands::subscribe_snapshots,
			commands::push_input,
			commands::get_chunk,
			commands::nav_set_grid,
			commands::nav_fill_rect,
			commands::nav_find_paths,
			commands::grid_apply_deltas,
			commands::grid_load_chunk,
			commands::grid_open_slot,
			commands::grid_reset_working,
			commands::grid_commit_slot,
			commands::grid_delete_slot,
		])
		.build(tauri::generate_context!())
		.expect("failed to build the Tauri application")
		.run(|app, event| {
			if let RunEvent::Exit = event {
				app.state::<SimRuntime>().stop();
			}
		});
}
