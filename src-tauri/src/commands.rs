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

    let now = Local::now();
    let callsign = callsign_of(&event.radio_operator);
    // flmsg header-editor metadata: a leading newline, the station call sign, and a
    // YYYYMMDDHHMMSS serial (matches flmsg's :hdr_ed: field).
    let hdr = format!("\n{} {}", callsign, now.format("%Y%m%d%H%M%S"));
    let dtm = format!("{}, {}L", now.format("%Y-%m-%d"), now.format("%H%M"));

    let mut out = String::new();
    out.push_str("<flmsg>4.0.24\n");
    field(&mut out, "hdr_ed", &hdr);
    out.push_str("<ics309>\n");
    field(&mut out, "inc", &event.incident_name);
    field(&mut out, "dfm", event.from_date.as_deref().unwrap_or(""));
    field(&mut out, "tfm", &fmt_time(event.from_time.as_deref()));
    field(&mut out, "dto", event.to_date.as_deref().unwrap_or(""));
    field(&mut out, "tto", &fmt_time(event.to_time.as_deref()));
    field(&mut out, "pre", &event.radio_operator);
    field(&mut out, "dtm", &dtm);
    field(&mut out, "net", &event.radio_network_name);
    field(&mut out, "opr", &event.radio_operator);
    for (i, (time, from_cs, from_num, to_cs, to_num, msg)) in entries.iter().enumerate() {
        field(&mut out, &format!("tm[{i}]"), &fmt_time(time.as_deref()));
        field(&mut out, &format!("to[{i}]"), &combine(to_cs.as_deref(), to_num.as_deref()));
        field(&mut out, &format!("fm[{i}]"), &combine(from_cs.as_deref(), from_num.as_deref()));
        field(&mut out, &format!("msg[{i}]"), msg.as_deref().unwrap_or(""));
    }
    Ok(out)
}

/// One flmsg field record: `:name:<byte-len> <value>` followed by a newline.
fn field(out: &mut String, name: &str, value: &str) {
    out.push_str(&format!(":{}:{} {}\n", name, value.len(), value));
}

/// Combine a call sign and message number into one flmsg from/to field,
/// separated by a space (either part may be empty).
fn combine(cs: Option<&str>, num: Option<&str>) -> String {
    let cs = cs.unwrap_or("").trim();
    let num = num.unwrap_or("").trim();
    match (cs.is_empty(), num.is_empty()) {
        (false, false) => format!("{cs} {num}"),
        (false, true) => cs.to_string(),
        (true, false) => num.to_string(),
        (true, true) => String::new(),
    }
}

/// flmsg local-time convention: an `L` suffix on the HHMM value (empty stays empty).
fn fmt_time(t: Option<&str>) -> String {
    match t.map(str::trim).filter(|s| !s.is_empty()) {
        Some(s) => format!("{s}L"),
        None => String::new(),
    }
}

/// The operator's call sign — the part after the last comma in "Name, CALL",
/// lower-cased the way flmsg names its files.
fn callsign_of(operator: &str) -> String {
    let cs = operator.rsplit(',').next().unwrap_or(operator).trim();
    let cs = if cs.is_empty() { operator.trim() } else { cs };
    cs.to_lowercase()
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

// ── FLdigi auto-send (via FLdigi's XML-RPC socket) ───────────────────────────────

/// CRC-16/MODBUS (init 0xFFFF, reflected poly 0xA001), upper-hex — byte-compatible
/// with flmsg's `Ccrc16` so a receiving flmsg accepts the transmitted message.
fn crc16_modbus(s: &str) -> String {
    let mut crc: u16 = 0xFFFF;
    for &b in s.as_bytes() {
        crc ^= b as u16;
        for _ in 0..8 {
            crc = if crc & 1 != 0 { (crc >> 1) ^ 0xA001 } else { crc >> 1 };
        }
    }
    format!("{crc:04X}")
}

/// Wrap flmsg content in the transfer envelope flmsg transmits (see flmsg
/// src/utils/wrap.cxx): `[WRAP:beg][WRAP:lf][WRAP:fn name]<content>[WRAP:chksum CRC][WRAP:end]`,
/// where the CRC covers the `[WRAP:fn ...]` tag plus the content.
fn wrap_flmsg(content: &str, filename: &str) -> String {
    let inner = format!("[WRAP:fn {filename}]{content}");
    let crc = crc16_modbus(&inner);
    format!("[WRAP:beg][WRAP:lf]{inner}[WRAP:chksum {crc}][WRAP:end]")
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

/// One XML-RPC call to FLdigi over its socket service (HTTP POST to /RPC2).
fn fldigi_rpc(host: &str, port: u16, method: &str, args: &[&str]) -> CmdResult<String> {
    use std::io::{Read, Write};
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::Duration;

    let params: String = args
        .iter()
        .map(|a| format!("<param><value><string>{}</string></value></param>", xml_escape(a)))
        .collect();
    let body = format!(
        "<?xml version=\"1.0\"?><methodCall><methodName>{method}</methodName><params>{params}</params></methodCall>"
    );
    let req = format!(
        "POST /RPC2 HTTP/1.1\r\nHost: {host}:{port}\r\nContent-Type: text/xml\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );

    let addr = format!("{host}:{port}")
        .to_socket_addrs()
        .map_err(|err| format!("Bad FLdigi address {host}:{port}: {err}"))?
        .next()
        .ok_or_else(|| format!("Could not resolve FLdigi address {host}:{port}"))?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(4)).map_err(|err| {
        format!("Cannot reach FLdigi at {host}:{port} ({err}). Is FLdigi running with its XML-RPC server enabled?")
    })?;
    stream.set_read_timeout(Some(Duration::from_secs(6))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(6))).ok();
    stream.write_all(req.as_bytes()).map_err(e)?;
    let mut resp = String::new();
    stream.read_to_string(&mut resp).map_err(e)?;
    if resp.contains("<fault>") {
        return Err(format!("FLdigi returned a fault for {method}: {resp}"));
    }
    Ok(resp)
}

/// Send an flmsg ICS-309 to FLdigi for transmission via its XML-RPC socket — the
/// same mechanism flmsg's auto-send uses. Wraps the content in the flmsg transfer
/// envelope, loads it into FLdigi's TX buffer, and keys the transmitter (the `^r`
/// macro returns FLdigi to receive once the buffer is sent).
#[tauri::command]
pub fn fldigi_send(
    content: String,
    filename: String,
    host: Option<String>,
    port: Option<u16>,
) -> CmdResult<()> {
    let host = host.unwrap_or_else(|| "127.0.0.1".to_string());
    let port = port.unwrap_or(7362);
    let wrapped = wrap_flmsg(&content, &filename);
    fldigi_rpc(&host, port, "text.clear_tx", &[])?;
    fldigi_rpc(&host, port, "text.add_tx", &[&format!("{wrapped}\n^r\n")])?;
    fldigi_rpc(&host, port, "main.tx", &[])?;
    Ok(())
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
        // flmsg .309 format: header, ics309 marker, and length-prefixed fields.
        assert!(out.starts_with("<flmsg>"));
        assert!(out.contains("<ics309>\n"));
        assert!(out.contains(":inc:13 Test Incident\n")); // len("Test Incident") == 13
        assert!(out.contains(":net:8 Test Net\n")); // len("Test Net") == 8
        // Call sign and message # are combined with a space.
        assert!(out.contains(":fm[0]:7 W1AAA 1\n")); // "W1AAA 1"
        assert!(out.contains(":to[0]:5 NET 1\n")); // "NET 1"
        // Times carry the flmsg local-time "L" suffix.
        assert!(out.contains(":tm[0]:5 1201L\n"));
        // Message newlines are preserved (length-prefixed), not flattened.
        assert!(out.contains(":msg[0]:10 multi\nline\n"));
    }

    #[test]
    fn crc16_matches_flmsg_modbus_check_value() {
        // CRC-16/MODBUS check value for "123456789" is 0x4B37.
        assert_eq!(crc16_modbus("123456789"), "4B37");
    }

    #[test]
    fn wrap_envelope_is_flmsg_compatible() {
        let w = wrap_flmsg("BODY", "test.309");
        assert!(w.starts_with("[WRAP:beg][WRAP:lf][WRAP:fn test.309]BODY[WRAP:chksum "));
        assert!(w.ends_with("][WRAP:end]"));
        // Checksum covers the fn tag plus the content.
        let crc = crc16_modbus("[WRAP:fn test.309]BODY");
        assert!(w.contains(&format!("[WRAP:chksum {crc}]")));
    }
}
