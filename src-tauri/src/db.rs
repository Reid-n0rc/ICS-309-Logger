use rusqlite::{Connection, Result as SqlResult};
use std::path::{Path, PathBuf};

/// The directory the app was launched from — where we keep the database so the
/// whole log travels with a portable copy (e.g. on a USB flash drive).
pub fn get_data_dir() -> PathBuf {
    // Linux AppImage: the binary runs from a read-only mount (e.g.
    // /tmp/.mount_xxx/usr/bin), so current_exe() is NOT where the .AppImage lives.
    // The launcher exports $APPIMAGE with the real on-disk path of the .AppImage.
    if let Ok(appimage) = std::env::var("APPIMAGE") {
        if let Some(parent) = Path::new(&appimage).parent() {
            return parent.to_path_buf();
        }
    }

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

/// True if we can create files in `dir`.
fn is_writable(dir: &Path) -> bool {
    let probe = dir.join(".ics309_write_test");
    match std::fs::File::create(&probe) {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// Per-user fallback data directory, used only when the portable location is not
/// writable (e.g. the app is run directly from a read-only .dmg/AppImage mount).
fn fallback_data_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    let base = std::env::var_os("APPDATA").map(PathBuf::from);

    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME")
        .map(|h| PathBuf::from(h).join("Library").join("Application Support"));

    #[cfg(all(unix, not(target_os = "macos")))]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")));

    let dir = base
        .unwrap_or_else(std::env::temp_dir)
        .join("ICS-309-Logger");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn get_db_path() -> PathBuf {
    let dir = get_data_dir();
    // Prefer the portable, next-to-executable location; fall back to a writable
    // per-user directory if that location is read-only so the app still launches.
    if is_writable(&dir) {
        dir.join("ics309_data.db")
    } else {
        fallback_data_dir().join("ics309_data.db")
    }
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
