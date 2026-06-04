export interface Event {
  id: number;
  incident_name: string;
  radio_network_name: string;
  radio_operator: string;
  from_date: string | null;
  from_time: string | null;
  to_date: string | null;
  to_time: string | null;
  closed: boolean;
  created_at: string;
}

export interface LogEntry {
  id: number;
  event_id: number;
  time_value: string | null;
  from_callsign: string | null;
  from_msg_num: string | null;
  to_callsign: string | null;
  to_msg_num: string | null;
  message: string | null;
  created_at: string;
}

export interface CreateEventInput {
  incident_name: string;
  radio_network_name: string;
  radio_operator: string;
}

export interface UpdateEventInput {
  incident_name: string;
  radio_network_name: string;
  radio_operator: string;
  from_date: string | null;
  from_time: string | null;
  to_date: string | null;
  to_time: string | null;
}

export interface CreateLogEntryInput {
  event_id: number;
  time_value: string | null;
  from_callsign: string | null;
  from_msg_num: string | null;
  to_callsign: string | null;
  to_msg_num: string | null;
  message: string | null;
}

export interface UpdateLogEntryInput {
  time_value: string | null;
  from_callsign: string | null;
  from_msg_num: string | null;
  to_callsign: string | null;
  to_msg_num: string | null;
  message: string | null;
}
