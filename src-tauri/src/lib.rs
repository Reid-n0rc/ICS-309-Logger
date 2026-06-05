mod commands;
mod db;
mod models;

use commands::DbState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let conn = db::init_db().expect("failed to initialize database");

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());

    // On Android the dialog plugin's save() returns a SAF content:// URI that
    // std::fs cannot write to; this plugin provides a native save dialog + write.
    #[cfg(target_os = "android")]
    {
        builder = builder.plugin(tauri_plugin_android_fs::init());
    }

    builder
        .manage(DbState(Mutex::new(conn)))
        .invoke_handler(tauri::generate_handler![
            commands::create_event,
            commands::get_events,
            commands::get_event,
            commands::update_event,
            commands::close_event,
            commands::reopen_event,
            commands::create_log_entry,
            commands::get_log_entries,
            commands::update_log_entry,
            commands::delete_log_entry,
            commands::get_next_msg_num,
            commands::generate_fldigi_export,
            commands::fldigi_send,
            commands::get_db_path_str,
            commands::write_file,
            commands::save_file_dialog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
