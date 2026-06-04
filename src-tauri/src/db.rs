use rusqlite::{Connection, Result as SqlResult};
use std::path::PathBuf;

pub fn get_data_dir() -> PathBuf {
    let exe = std::env::current_exe().expect("failed to get exe path");
    let exe_dir = exe.parent().expect("failed to get exe dir").to_path_buf();

    // On macOS, navigate out of .app bundle: MyApp.app/Contents/MacOS/ -> parent of .app
    #[cfg(target_os = "macos")]
    {
        if let Some(contents) = exe_dir.parent() {
            if let Some(app_bundle) = contents.parent() {
                if app_bundle.extension().map(|e| e == "app").unwrap_or(false) {
                    if let Some(parent) = app_bundle.parent() {
                        return parent.to_path_buf();
                    }
                }
            }
        }
    }

    exe_dir
}

pub fn get_db_path() -> PathBuf {
    get_data_dir().join("ics309_data.db")
}

pub fn init_db() -> SqlResult<Connection> {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;

    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_name TEXT NOT NULL,
            radio_network_name TEXT NOT NULL,
            radio_operator TEXT NOT NULL,
            from_date TEXT,
            from_time TEXT,
            to_date TEXT,
            to_time TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS log_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            time_value TEXT,
            from_callsign TEXT,
            from_msg_num TEXT,
            to_callsign TEXT,
            to_msg_num TEXT,
            message TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS callsign_counters (
            event_id INTEGER NOT NULL,
            callsign TEXT NOT NULL COLLATE NOCASE,
            direction TEXT NOT NULL,
            last_num INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (event_id, callsign, direction),
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
        );
        ",
    )?;

    Ok(conn)
}
