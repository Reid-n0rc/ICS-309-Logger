use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Event {
    pub id: i64,
    pub incident_name: String,
    pub radio_network_name: String,
    pub radio_operator: String,
    pub from_date: Option<String>,
    pub from_time: Option<String>,
    pub to_date: Option<String>,
    pub to_time: Option<String>,
    /// Whether the incident has been explicitly closed (independent of the operational
    /// period end, which an export may fill in without closing the incident).
    pub closed: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LogEntry {
    pub id: i64,
    pub event_id: i64,
    pub time_value: Option<String>,
    pub from_callsign: Option<String>,
    pub from_msg_num: Option<String>,
    pub to_callsign: Option<String>,
    pub to_msg_num: Option<String>,
    pub message: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateEventInput {
    pub incident_name: String,
    pub radio_network_name: String,
    pub radio_operator: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateEventInput {
    pub incident_name: String,
    pub radio_network_name: String,
    pub radio_operator: String,
    pub from_date: Option<String>,
    pub from_time: Option<String>,
    pub to_date: Option<String>,
    pub to_time: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateLogEntryInput {
    pub event_id: i64,
    pub time_value: Option<String>,
    pub from_callsign: Option<String>,
    pub from_msg_num: Option<String>,
    pub to_callsign: Option<String>,
    pub to_msg_num: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateLogEntryInput {
    pub time_value: Option<String>,
    pub from_callsign: Option<String>,
    pub from_msg_num: Option<String>,
    pub to_callsign: Option<String>,
    pub to_msg_num: Option<String>,
    pub message: Option<String>,
}
