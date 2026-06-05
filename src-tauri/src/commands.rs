use crate::models::*;
use chrono::Local;
use rusqlite::{params, Connection, Result as SqlResult};
use std::sync::Mutex;
use tauri::State;

pub struct DbState(pub Mutex<Connection>);

type CmdResult<T> = Result<T, String>;

fn e(err: impl std::fmt::Display) -> String {
    err.to_string()
}

fn now_date() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn now_time() -> String {
    Local::now().format("%H%M").to_string()
}

fn now_ts() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

// ── Core logic (DB-only, no Tauri state) — unit tested in the `tests` module ────
//
// Each command is split into a pure `*_impl(conn, ...)` function and a thin
// `#[tauri::command]` wrapper that locks the connection and maps errors to String.
// The impls operate on a borrowed Connection so they can run against an in-memory
// database in tests, on every OS.

fn fetch_event(conn: &Connection, id: i64) -> SqlResult<Event> {
    conn.query_row(
        "SELECT id, incident_name, radio_network_name, radio_operator,
                from_date, from_time, to_date, to_time, closed, created_at
         FROM events WHERE id = ?1",
        params![id],
        |row| {
            Ok(Event {
                id: row.get(0)?,
                incident_name: row.get(1)?,
                radio_network_name: row.get(2)?,
                radio_operator: row.get(3)?,
                from_date: row.get(4)?,
                from_time: row.get(5)?,
                to_date: row.get(6)?,
                to_time: row.get(7)?,
                closed: row.get::<_, i64>(8)? != 0,
                created_at: row.get(9)?,
            })
        },
    )
}

fn fetch_entry(conn: &Connection, id: i64) -> SqlResult<LogEntry> {
    conn.query_row(
        "SELECT id, event_id, time_value, from_callsign, from_msg_num,
                to_callsign, to_msg_num, message, created_at
         FROM log_entries WHERE id = ?1",
        params![id],
        |row| {
            Ok(LogEntry {
                id: row.get(0)?,
                event_id: row.get(1)?,
                time_value: row.get(2)?,
                from_callsign: row.get(3)?,
                from_msg_num: row.get(4)?,
                to_callsign: row.get(5)?,
                to_msg_num: row.get(6)?,
                message: row.get(7)?,
                created_at: row.get(8)?,
            })
        },
    )
}

fn create_event_impl(conn: &Connection, input: &CreateEventInput) -> SqlResult<Event> {
    conn.execute(
        "INSERT INTO events (incident_name, radio_network_name, radio_operator,
                             from_date, from_time, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            input.incident_name,
            input.radio_network_name,
            input.radio_operator,
            now_date(),
            now_time(),
            now_ts(),
        ],
    )?;
    fetch_event(conn, conn.last_insert_rowid())
}

fn get_events_impl(conn: &Connection) -> SqlResult<Vec<Event>> {
    let mut stmt = conn.prepare(
        "SELECT id, incident_name, radio_network_name, radio_operator,
                from_date, from_time, to_date, to_time, closed, created_at
         FROM events ORDER BY created_at DESC, id DESC",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Event {
                id: row.get(0)?,
                incident_name: row.get(1)?,
                radio_network_name: row.get(2)?,
                radio_operator: row.get(3)?,
                from_date: row.get(4)?,
                from_time: row.get(5)?,
                to_date: row.get(6)?,
                to_time: row.get(7)?,
                closed: row.get::<_, i64>(8)? != 0,
                created_at: row.get(9)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(rows)
}

fn update_event_impl(conn: &Connection, id: i64, input: &UpdateEventInput) -> SqlResult<Event> {
    conn.execute(
        "UPDATE events SET incident_name=?1, radio_network_name=?2, radio_operator=?3,
                           from_date=?4, from_time=?5, to_date=?6, to_time=?7
         WHERE id=?8",
        params![
            input.incident_name,
            input.radio_network_name,
            input.radio_operator,
            input.from_date,
            input.from_time,
            input.to_date,
            input.to_time,
            id,
        ],
    )?;
    fetch_event(conn, id)
}

fn close_event_impl(conn: &Connection, id: i64) -> SqlResult<Event> {
    // Mark closed and stamp the operational-period end if it wasn't already set.
    conn.execute(
        "UPDATE events
         SET closed = 1,
             to_date = COALESCE(to_date, ?1),
             to_time = COALESCE(to_time, ?2)
         WHERE id = ?3",
        params![now_date(), now_time(), id],
    )?;
    fetch_event(conn, id)
}

fn reopen_event_impl(conn: &Connection, id: i64) -> SqlResult<Event> {
    // Reopen: clear the closed flag and the operational-period end so logging resumes.
    conn.execute(
        "UPDATE events SET closed = 0, to_date = NULL, to_time = NULL WHERE id = ?1",
        params![id],
    )?;
    fetch_event(conn, id)
}

fn create_log_entry_impl(conn: &Connection, input: &CreateLogEntryInput) -> SqlResult<LogEntry> {
    conn.execute(
        "INSERT INTO log_entries
            (event_id, time_value, from_callsign, from_msg_num,
             to_callsign, to_msg_num, message, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            input.event_id,
            input.time_value,
            input.from_callsign,
            input.from_msg_num,
            input.to_callsign,
            input.to_msg_num,
            input.message,
            now_ts(),
        ],
    )?;

    let entry_id = conn.last_insert_rowid();

    // Advance the per-callsign counters to max(current, used number) so auto-numbering
    // stays sequential even when a number was entered manually.
    if let (Some(cs), Some(num_str)) = (&input.from_callsign, &input.from_msg_num) {
        if let Ok(num) = num_str.parse::<i64>() {
            bump_counter(conn, input.event_id, cs, "from", num)?;
        }
    }
    if let (Some(cs), Some(num_str)) = (&input.to_callsign, &input.to_msg_num) {
        if let Ok(num) = num_str.parse::<i64>() {
            bump_counter(conn, input.event_id, cs, "to", num)?;
        }
    }

    fetch_entry(conn, entry_id)
}

fn bump_counter(
    conn: &Connection,
    event_id: i64,
    callsign: &str,
    direction: &str,
    num: i64,
) -> SqlResult<usize> {
    conn.execute(
        "INSERT INTO callsign_counters (event_id, callsign, direction, last_num)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(event_id, callsign, direction)
         DO UPDATE SET last_num = MAX(last_num, excluded.last_num)",
        params![event_id, callsign, direction, num],
    )
}

fn get_log_entries_impl(conn: &Connection, event_id: i64) -> SqlResult<Vec<LogEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, event_id, time_value, from_callsign, from_msg_num,
                to_callsign, to_msg_num, message, created_at
         FROM log_entries WHERE event_id = ?1 ORDER BY id ASC",
    )?;
    let rows = stmt
        .query_map(params![event_id], |row| {
            Ok(LogEntry {
                id: row.get(0)?,
                event_id: row.get(1)?,
                time_value: row.get(2)?,
                from_callsign: row.get(3)?,
                from_msg_num: row.get(4)?,
                to_callsign: row.get(5)?,
                to_msg_num: row.get(6)?,
                message: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(rows)
}

fn update_log_entry_impl(
    conn: &Connection,
    id: i64,
    input: &UpdateLogEntryInput,
) -> SqlResult<LogEntry> {
    conn.execute(
        "UPDATE log_entries SET time_value=?1, from_callsign=?2, from_msg_num=?3,
                                to_callsign=?4, to_msg_num=?5, message=?6
         WHERE id=?7",
        params![
            input.time_value,
            input.from_callsign,
            input.from_msg_num,
            input.to_callsign,
            input.to_msg_num,
            input.message,
            id,
        ],
    )?;
    fetch_entry(conn, id)
}

fn delete_log_entry_impl(conn: &Connection, id: i64) -> SqlResult<bool> {
    let n = conn.execute("DELETE FROM log_entries WHERE id=?1", params![id])?;
    Ok(n > 0)
}

fn next_msg_num_impl(
    conn: &Connection,
    event_id: i64,
    callsign: &str,
    direction: &str,
) -> SqlResult<i64> {
    let last: i64 = conn
        .query_row(
            "SELECT last_num FROM callsign_counters
             WHERE event_id=?1 AND callsign=?2 COLLATE NOCASE AND direction=?3",
            params![event_id, callsign, direction],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(last + 1)
}

fn fldigi_export_impl(conn: &Connection, event_id: i64) -> SqlResult<String> {
    let event = fetch_event(conn, event_id)?;

    let mut stmt = conn.prepare(
        "SELECT time_value, from_callsign, from_msg_num, to_callsign, to_msg_num, message
         FROM log_entries WHERE event_id=?1 ORDER BY id ASC",
    )?;

    type Row = (
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    );
    let entries: Vec<Row> = stmt
        .query_map(params![event_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })?
        .collect::<SqlResult<Vec<_>>>()?;

    let from_period = format!(
        "{} {}",
        event.from_date.as_deref().unwrap_or(""),
        event.from_time.as_deref().unwrap_or("")
    );
    let to_period = format!(
        "{} {}",
        event.to_date.as_deref().unwrap_or(""),
        event.to_time.as_deref().unwrap_or("")
    );
    let prepared_dt = Local::now().format("%Y-%m-%d %H%M").to_string();

    let mut out = String::new();
    out.push_str("<flmsg>4.0\n");
    out.push_str("<mo>M\n");
    out.push_str(&format!("<dt>{}\n", Local::now().format("%Y-%m-%d")));
    out.push_str(&format!("<tm>{}\n", Local::now().format("%H%M")));
    out.push_str("<fn>ics309\n");
    out.push_str("<ver>1.0.0.0\n");
    out.push_str(&format!("<1>{}\n", event.incident_name));
    out.push_str(&format!("<2>{}\n", from_period.trim()));
    out.push_str(&format!("<3>{}\n", to_period.trim()));
    out.push_str(&format!("<4>{}\n", event.radio_network_name));
    out.push_str(&format!("<5>{}\n", event.radio_operator));
    out.push_str("<log>\n");
    for (time, from_cs, from_num, to_cs, to_num, msg) in &entries {
        let row = format!(
            "{}|{}|{}|{}|{}|{}\n",
            time.as_deref().unwrap_or(""),
            from_cs.as_deref().unwrap_or(""),
            from_num.as_deref().unwrap_or(""),
            to_cs.as_deref().unwrap_or(""),
            to_num.as_deref().unwrap_or(""),
            msg.as_deref().unwrap_or("").replace('\n', " "),
        );
        out.push_str(&row);
    }
    out.push_str("</log>\n");
    out.push_str(&format!("<6>{}\n", event.radio_operator));
    out.push_str(&format!("<7>{}\n", prepared_dt));

    Ok(out)
}

// ── Tauri command wrappers ──────────────────────────────────────────────────────

#[tauri::command]
pub fn create_event(state: State<DbState>, input: CreateEventInput) -> CmdResult<Event> {
    let conn = state.0.lock().map_err(e)?;
    create_event_impl(&conn, &input).map_err(e)
}

#[tauri::command]
pub fn get_events(state: State<DbState>) -> CmdResult<Vec<Event>> {
    let conn = state.0.lock().map_err(e)?;
    get_events_impl(&conn).map_err(e)
}

#[tauri::command]
pub fn get_event(state: State<DbState>, id: i64) -> CmdResult<Event> {
    let conn = state.0.lock().map_err(e)?;
    fetch_event(&conn, id).map_err(e)
}

#[tauri::command]
pub fn update_event(state: State<DbState>, id: i64, input: UpdateEventInput) -> CmdResult<Event> {
    let conn = state.0.lock().map_err(e)?;
    update_event_impl(&conn, id, &input).map_err(e)
}

#[tauri::command]
pub fn close_event(state: State<DbState>, id: i64) -> CmdResult<Event> {
    let conn = state.0.lock().map_err(e)?;
    close_event_impl(&conn, id).map_err(e)
}

#[tauri::command]
pub fn reopen_event(state: State<DbState>, id: i64) -> CmdResult<Event> {
    let conn = state.0.lock().map_err(e)?;
    reopen_event_impl(&conn, id).map_err(e)
}

#[tauri::command]
pub fn create_log_entry(state: State<DbState>, input: CreateLogEntryInput) -> CmdResult<LogEntry> {
    let conn = state.0.lock().map_err(e)?;
    create_log_entry_impl(&conn, &input).map_err(e)
}

#[tauri::command]
pub fn get_log_entries(state: State<DbState>, event_id: i64) -> CmdResult<Vec<LogEntry>> {
    let conn = state.0.lock().map_err(e)?;
    get_log_entries_impl(&conn, event_id).map_err(e)
}

#[tauri::command]
pub fn update_log_entry(
    state: State<DbState>,
    id: i64,
    input: UpdateLogEntryInput,
) -> CmdResult<LogEntry> {
    let conn = state.0.lock().map_err(e)?;
    update_log_entry_impl(&conn, id, &input).map_err(e)
}

#[tauri::command]
pub fn delete_log_entry(state: State<DbState>, id: i64) -> CmdResult<bool> {
    let conn = state.0.lock().map_err(e)?;
    delete_log_entry_impl(&conn, id).map_err(e)
}

#[tauri::command]
pub fn get_next_msg_num(
    state: State<DbState>,
    event_id: i64,
    callsign: String,
    direction: String,
) -> CmdResult<i64> {
    let conn = state.0.lock().map_err(e)?;
    next_msg_num_impl(&conn, event_id, &callsign, &direction).map_err(e)
}

#[tauri::command]
pub fn generate_fldigi_export(state: State<DbState>, event_id: i64) -> CmdResult<String> {
    let conn = state.0.lock().map_err(e)?;
    fldigi_export_impl(&conn, event_id).map_err(e)
}

#[tauri::command]
pub fn get_db_path_str() -> String {
    crate::db::get_db_path().to_string_lossy().to_string()
}

/// Write raw bytes to an absolute path chosen by the user via a save dialog.
/// Used by the PDF / FLdigi exports so the user controls the file name and location.
#[tauri::command]
pub fn write_file(path: String, contents: Vec<u8>) -> CmdResult<()> {
    std::fs::write(&path, &contents).map_err(e)
}

/// Save `contents` to a user-chosen location via a native save dialog.
///
/// Android only: the dialog plugin's `save()` returns a Storage Access Framework
/// `content://` URI that `std::fs::write` (used by [`write_file`]) cannot write to,
/// which produced a created-but-unopenable PDF. The android-fs plugin shows the
/// native save dialog and writes to the granted URI. Desktop platforms keep using
/// the dialog plugin + [`write_file`] and never call this.
///
/// Returns the saved file name, or `None` if the user cancelled.
#[tauri::command]
pub async fn save_file_dialog(
    app: tauri::AppHandle,
    name: String,
    mime: String,
    contents: Vec<u8>,
) -> CmdResult<Option<String>> {
    #[cfg(target_os = "android")]
    {
        use std::io::Write;
        use tauri_plugin_android_fs::AndroidFsExt;

        let api = app.android_fs_async();
        let selected = api
            .file_picker()
            .save_file(None, &name, Some(mime.as_str()), false)
            .await
            .map_err(e)?;
        match selected {
            Some(uri) => {
                let mut file = api.open_file_writable(&uri).await.map_err(e)?;
                file.write_all(&contents).map_err(e)?;
                Ok(Some(name))
            }
            None => Ok(None),
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, name, mime, contents);
        Err("save_file_dialog is only available on Android".to_string())
    }
}

// ── Tests: exercise every feature against an in-memory DB (runs on each OS) ──────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_schema;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    fn sample_event(conn: &Connection) -> Event {
        create_event_impl(
            conn,
            &CreateEventInput {
                incident_name: "Test Incident".into(),
                radio_network_name: "Test Net".into(),
                radio_operator: "Op One, W1AAA".into(),
            },
        )
        .unwrap()
    }

    fn entry_input(event_id: i64, from: Option<&str>, to: Option<&str>) -> CreateLogEntryInput {
        CreateLogEntryInput {
            event_id,
            time_value: Some("1200".into()),
            from_callsign: from.map(|s| s.to_string()),
            from_msg_num: None,
            to_callsign: to.map(|s| s.to_string()),
            to_msg_num: None,
            message: Some("hello".into()),
        }
    }

    #[test]
    fn create_event_records_start_datetime() {
        let conn = db();
        let ev = sample_event(&conn);
        assert!(ev.id > 0);
        assert_eq!(ev.incident_name, "Test Incident");
        // From (start) date/time recorded on creation; To (stop) left empty.
        assert!(ev.from_date.as_deref().unwrap_or("").len() >= 8);
        assert!(ev.from_time.as_deref().unwrap_or("").len() >= 3);
        assert!(ev.to_date.is_none());
        assert!(ev.to_time.is_none());
    }

    #[test]
    fn get_events_and_get_event() {
        let conn = db();
        let ev = sample_event(&conn);
        let all = get_events_impl(&conn).unwrap();
        assert_eq!(all.len(), 1);
        let one = fetch_event(&conn, ev.id).unwrap();
        assert_eq!(one.id, ev.id);
    }

    #[test]
    fn update_event_persists_fields() {
        let conn = db();
        let ev = sample_event(&conn);
        let updated = update_event_impl(
            &conn,
            ev.id,
            &UpdateEventInput {
                incident_name: "Renamed".into(),
                radio_network_name: "Net 2".into(),
                radio_operator: "Op Two, W2BBB".into(),
                from_date: Some("2026-01-01".into()),
                from_time: Some("0800".into()),
                to_date: Some("2026-01-01".into()),
                to_time: Some("1700".into()),
            },
        )
        .unwrap();
        assert_eq!(updated.incident_name, "Renamed");
        assert_eq!(updated.to_time.as_deref(), Some("1700"));
    }

    #[test]
    fn close_event_records_stop_datetime() {
        let conn = db();
        let ev = sample_event(&conn);
        let closed = close_event_impl(&conn, ev.id).unwrap();
        assert!(closed.closed);
        assert!(closed.to_date.as_deref().unwrap_or("").len() >= 8);
        assert!(closed.to_time.as_deref().unwrap_or("").len() >= 3);
    }

    #[test]
    fn new_event_is_open() {
        let conn = db();
        let ev = sample_event(&conn);
        assert!(!ev.closed);
    }

    #[test]
    fn reopen_event_clears_closed_and_stop_datetime() {
        let conn = db();
        let ev = sample_event(&conn);
        close_event_impl(&conn, ev.id).unwrap();
        let reopened = reopen_event_impl(&conn, ev.id).unwrap();
        assert!(!reopened.closed);
        assert!(reopened.to_date.is_none());
        assert!(reopened.to_time.is_none());
    }

    #[test]
    fn log_entry_crud() {
        let conn = db();
        let ev = sample_event(&conn);
        let entry = create_log_entry_impl(&conn, &entry_input(ev.id, Some("W1AAA"), Some("W2BBB")))
            .unwrap();
        assert_eq!(get_log_entries_impl(&conn, ev.id).unwrap().len(), 1);

        let updated = update_log_entry_impl(
            &conn,
            entry.id,
            &UpdateLogEntryInput {
                time_value: Some("1300".into()),
                from_callsign: Some("W1AAA".into()),
                from_msg_num: Some("5".into()),
                to_callsign: Some("W2BBB".into()),
                to_msg_num: Some("5".into()),
                message: Some("edited".into()),
            },
        )
        .unwrap();
        assert_eq!(updated.message.as_deref(), Some("edited"));
        assert_eq!(updated.time_value.as_deref(), Some("1300"));

        assert!(delete_log_entry_impl(&conn, entry.id).unwrap());
        assert_eq!(get_log_entries_impl(&conn, ev.id).unwrap().len(), 0);
    }

    #[test]
    fn auto_numbering_is_sequential_per_callsign_and_direction() {
        let conn = db();
        let ev = sample_event(&conn);

        // No history yet → first number is 1 for each callsign/direction.
        assert_eq!(next_msg_num_impl(&conn, ev.id, "W1AAA", "from").unwrap(), 1);

        // Log W1AAA -> NET with from #1, NET to #1.
        create_log_entry_impl(
            &conn,
            &CreateLogEntryInput {
                event_id: ev.id,
                time_value: None,
                from_callsign: Some("W1AAA".into()),
                from_msg_num: Some("1".into()),
                to_callsign: Some("NET".into()),
                to_msg_num: Some("1".into()),
                message: None,
            },
        )
        .unwrap();

        // W1AAA(from) next is 2; NET(to) next is 2; an untouched callsign is still 1.
        assert_eq!(next_msg_num_impl(&conn, ev.id, "W1AAA", "from").unwrap(), 2);
        assert_eq!(next_msg_num_impl(&conn, ev.id, "NET", "to").unwrap(), 2);
        assert_eq!(next_msg_num_impl(&conn, ev.id, "KD7XYZ", "from").unwrap(), 1);

        // Counters are per-direction: W1AAA in the "to" direction is independent.
        assert_eq!(next_msg_num_impl(&conn, ev.id, "W1AAA", "to").unwrap(), 1);
    }

    #[test]
    fn auto_numbering_is_case_insensitive() {
        let conn = db();
        let ev = sample_event(&conn);
        create_log_entry_impl(
            &conn,
            &CreateLogEntryInput {
                event_id: ev.id,
                time_value: None,
                from_callsign: Some("w1aaa".into()),
                from_msg_num: Some("1".into()),
                to_callsign: None,
                to_msg_num: None,
                message: None,
            },
        )
        .unwrap();
        // Different case must resolve to the same counter.
        assert_eq!(next_msg_num_impl(&conn, ev.id, "W1AAA", "from").unwrap(), 2);
    }

    #[test]
    fn manual_message_number_advances_the_counter() {
        let conn = db();
        let ev = sample_event(&conn);
        // A manually entered high number should advance the sequence.
        create_log_entry_impl(
            &conn,
            &CreateLogEntryInput {
                event_id: ev.id,
                time_value: None,
                from_callsign: Some("W1AAA".into()),
                from_msg_num: Some("10".into()),
                to_callsign: None,
                to_msg_num: None,
                message: None,
            },
        )
        .unwrap();
        assert_eq!(next_msg_num_impl(&conn, ev.id, "W1AAA", "from").unwrap(), 11);
    }

    #[test]
    fn deleting_event_cascades_to_entries() {
        let conn = db();
        let ev = sample_event(&conn);
        create_log_entry_impl(&conn, &entry_input(ev.id, Some("W1AAA"), Some("W2BBB"))).unwrap();
        conn.execute("DELETE FROM events WHERE id=?1", params![ev.id])
            .unwrap();
        assert_eq!(get_log_entries_impl(&conn, ev.id).unwrap().len(), 0);
    }

    #[test]
    fn fldigi_export_contains_header_and_log_rows() {
        let conn = db();
        let ev = sample_event(&conn);
        create_log_entry_impl(
            &conn,
            &CreateLogEntryInput {
                event_id: ev.id,
                time_value: Some("1201".into()),
                from_callsign: Some("W1AAA".into()),
                from_msg_num: Some("1".into()),
                to_callsign: Some("NET".into()),
                to_msg_num: Some("1".into()),
                message: Some("multi\nline".into()),
            },
        )
        .unwrap();

        let out = fldigi_export_impl(&conn, ev.id).unwrap();
        assert!(out.starts_with("<flmsg>"));
        assert!(out.contains("<fn>ics309"));
        assert!(out.contains("<1>Test Incident"));
        assert!(out.contains("<4>Test Net"));
        assert!(out.contains("<log>"));
        assert!(out.contains("</log>"));
        // The log row is pipe-delimited and newlines in messages are flattened.
        assert!(out.contains("1201|W1AAA|1|NET|1|multi line"));
    }
}
