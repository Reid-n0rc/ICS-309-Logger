use crate::models::*;
use chrono::Local;
use rusqlite::params;
use std::sync::Mutex;
use tauri::State;

pub struct DbState(pub Mutex<rusqlite::Connection>);

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

fn fetch_event(conn: &rusqlite::Connection, id: i64) -> CmdResult<Event> {
    conn.query_row(
        "SELECT id, incident_name, radio_network_name, radio_operator,
                from_date, from_time, to_date, to_time, created_at
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
                created_at: row.get(8)?,
            })
        },
    )
    .map_err(e)
}

fn fetch_entry(conn: &rusqlite::Connection, id: i64) -> CmdResult<LogEntry> {
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
    .map_err(e)
}

// ── Events ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn create_event(state: State<DbState>, input: CreateEventInput) -> CmdResult<Event> {
    let conn = state.0.lock().map_err(e)?;
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
    )
    .map_err(e)?;
    fetch_event(&conn, conn.last_insert_rowid())
}

#[tauri::command]
pub fn get_events(state: State<DbState>) -> CmdResult<Vec<Event>> {
    let conn = state.0.lock().map_err(e)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, incident_name, radio_network_name, radio_operator,
                    from_date, from_time, to_date, to_time, created_at
             FROM events ORDER BY created_at DESC",
        )
        .map_err(e)?;
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
                created_at: row.get(8)?,
            })
        })
        .map_err(e)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(e)?;
    Ok(rows)
}

#[tauri::command]
pub fn get_event(state: State<DbState>, id: i64) -> CmdResult<Event> {
    let conn = state.0.lock().map_err(e)?;
    fetch_event(&conn, id)
}

#[tauri::command]
pub fn update_event(
    state: State<DbState>,
    id: i64,
    input: UpdateEventInput,
) -> CmdResult<Event> {
    let conn = state.0.lock().map_err(e)?;
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
    )
    .map_err(e)?;
    fetch_event(&conn, id)
}

#[tauri::command]
pub fn close_event(state: State<DbState>, id: i64) -> CmdResult<Event> {
    let conn = state.0.lock().map_err(e)?;
    conn.execute(
        "UPDATE events SET to_date=?1, to_time=?2 WHERE id=?3",
        params![now_date(), now_time(), id],
    )
    .map_err(e)?;
    fetch_event(&conn, id)
}

// ── Log Entries ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn create_log_entry(
    state: State<DbState>,
    input: CreateLogEntryInput,
) -> CmdResult<LogEntry> {
    let conn = state.0.lock().map_err(e)?;

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
    )
    .map_err(e)?;

    let entry_id = conn.last_insert_rowid();

    // Update callsign counters to max(current, used_number) for auto-increment continuity
    if let (Some(cs), Some(num_str)) = (&input.from_callsign, &input.from_msg_num) {
        if let Ok(num) = num_str.parse::<i64>() {
            conn.execute(
                "INSERT INTO callsign_counters (event_id, callsign, direction, last_num)
                 VALUES (?1, ?2, 'from', ?3)
                 ON CONFLICT(event_id, callsign, direction)
                 DO UPDATE SET last_num = MAX(last_num, excluded.last_num)",
                params![input.event_id, cs, num],
            )
            .map_err(e)?;
        }
    }
    if let (Some(cs), Some(num_str)) = (&input.to_callsign, &input.to_msg_num) {
        if let Ok(num) = num_str.parse::<i64>() {
            conn.execute(
                "INSERT INTO callsign_counters (event_id, callsign, direction, last_num)
                 VALUES (?1, ?2, 'to', ?3)
                 ON CONFLICT(event_id, callsign, direction)
                 DO UPDATE SET last_num = MAX(last_num, excluded.last_num)",
                params![input.event_id, cs, num],
            )
            .map_err(e)?;
        }
    }

    fetch_entry(&conn, entry_id)
}

#[tauri::command]
pub fn get_log_entries(state: State<DbState>, event_id: i64) -> CmdResult<Vec<LogEntry>> {
    let conn = state.0.lock().map_err(e)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, event_id, time_value, from_callsign, from_msg_num,
                    to_callsign, to_msg_num, message, created_at
             FROM log_entries WHERE event_id = ?1 ORDER BY id ASC",
        )
        .map_err(e)?;
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
        })
        .map_err(e)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(e)?;
    Ok(rows)
}

#[tauri::command]
pub fn update_log_entry(
    state: State<DbState>,
    id: i64,
    input: UpdateLogEntryInput,
) -> CmdResult<LogEntry> {
    let conn = state.0.lock().map_err(e)?;
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
    )
    .map_err(e)?;
    fetch_entry(&conn, id)
}

#[tauri::command]
pub fn delete_log_entry(state: State<DbState>, id: i64) -> CmdResult<bool> {
    let conn = state.0.lock().map_err(e)?;
    let n = conn
        .execute("DELETE FROM log_entries WHERE id=?1", params![id])
        .map_err(e)?;
    Ok(n > 0)
}

#[tauri::command]
pub fn get_next_msg_num(
    state: State<DbState>,
    event_id: i64,
    callsign: String,
    direction: String,
) -> CmdResult<i64> {
    let conn = state.0.lock().map_err(e)?;
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

// ── FLdigi Export ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn generate_fldigi_export(state: State<DbState>, event_id: i64) -> CmdResult<String> {
    let conn = state.0.lock().map_err(e)?;
    let event = fetch_event(&conn, event_id)?;

    let mut stmt = conn
        .prepare(
            "SELECT time_value, from_callsign, from_msg_num, to_callsign, to_msg_num, message
             FROM log_entries WHERE event_id=?1 ORDER BY id ASC",
        )
        .map_err(e)?;

    let entries: Vec<(
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    )> = stmt
        .query_map(params![event_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })
        .map_err(e)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(e)?;

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
    out.push_str(&format!(
        "<dt>{}\n",
        Local::now().format("%Y-%m-%d")
    ));
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

// ── DB Path (for debugging) ───────────────────────────────────────────────────

#[tauri::command]
pub fn get_db_path_str() -> String {
    crate::db::get_db_path().to_string_lossy().to_string()
}
