import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Event, LogEntry, UpdateEventInput } from "../types";
import EntryForm from "./EntryForm";
import LogTable from "./LogTable";
import EditEntryModal from "./EditEntryModal";
import SignatureModal from "./SignatureModal";
import { exportIcs309Pdf } from "../lib/exportPdf";
import { exportIcs309Excel } from "../lib/exportExcel";
import { saveBytesWithDialog } from "../lib/saveFile";

interface Props {
  event: Event;
  onEventUpdate: (event: Event) => void;
  onClose: () => void;
}

function nowDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nowTime() {
  const now = new Date();
  return String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");
}

export default function LogView({ event, onEventUpdate, onClose }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
  const [showEventEdit, setShowEventEdit] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<LogEntry[]>("get_log_entries", { eventId: event.id })
      .then(setEntries)
      .catch(console.error);
  }, [event.id]);

  // Auto-scroll log table to bottom when new entries arrive
  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = tableContainerRef.current.scrollHeight;
    }
  }, [entries]);

  const handleEntryAdded = (entry: LogEntry) => {
    setEntries((prev) => [...prev, entry]);
  };

  const handleEntrySaved = (updated: LogEntry) => {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setEditingEntry(null);
  };

  const handleEntryDeleted = (id: number) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setEditingEntry(null);
  };

  const handleCloseIncident = async () => {
    try {
      const updated = await invoke<Event>("close_event", { id: event.id });
      onEventUpdate(updated);
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReopenIncident = async () => {
    try {
      const updated = await invoke<Event>("reopen_event", { id: event.id });
      onEventUpdate(updated);
    } catch (err) {
      console.error(err);
    }
  };

  // On any export, if the ending operational period isn't set yet, stamp it to the
  // current date/time (persisted) so the output always has an end time. Returns the
  // event to use for the export.
  const ensureEndPeriod = async (): Promise<Event> => {
    if (event.to_date && event.to_time) return event;
    try {
      const input: UpdateEventInput = {
        incident_name: event.incident_name,
        radio_network_name: event.radio_network_name,
        radio_operator: event.radio_operator,
        from_date: event.from_date,
        from_time: event.from_time,
        to_date: event.to_date || nowDate(),
        to_time: event.to_time || nowTime(),
      };
      const updated = await invoke<Event>("update_event", { id: event.id, input });
      onEventUpdate(updated);
      return updated;
    } catch (err) {
      console.error("Failed to set operational period end:", err);
      return event;
    }
  };

  const handleExportPdf = async () => {
    try {
      const ev = await ensureEndPeriod();
      await exportIcs309Pdf(ev, entries);
    } catch (err) {
      console.error("PDF export failed:", err);
    }
  };

  const handlePrint = async () => {
    const ev = await ensureEndPeriod();
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const html = buildPrintHtml(ev, entries);
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleExportExcel = async () => {
    try {
      const ev = await ensureEndPeriod();
      await exportIcs309Excel(ev, entries);
    } catch (err) {
      console.error("Excel export failed:", err);
    }
  };

  const handleExportFldigi = async () => {
    try {
      const ev = await ensureEndPeriod();
      const content = await invoke<string>("generate_fldigi_export", { eventId: ev.id });
      const filename = `ICS309-${ev.incident_name.replace(/\s+/g, "_")}.flmsg`;
      const bytes = new TextEncoder().encode(content);
      await saveBytesWithDialog(filename, [{ name: "FLdigi Message", extensions: ["flmsg"] }], bytes);
    } catch (err) {
      console.error("FLdigi export failed:", err);
    }
  };

  const handleOpenSignature = async () => {
    await ensureEndPeriod();
    setShowSignature(true);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header bar */}
      <div className="bg-gray-800 text-white px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <div className="min-w-0">
            <span className="font-bold text-sm">{event.incident_name}</span>
            <span className="text-gray-400 text-xs ml-3 hidden sm:inline">{event.radio_network_name}</span>
            <span className="text-gray-400 text-xs ml-2 hidden md:inline">· {event.radio_operator}</span>
          </div>
          {event.to_date && (
            <span className="px-2 py-0.5 bg-red-600 text-white text-xs rounded font-semibold">
              CLOSED
            </span>
          )}
        </div>

        {/* Menu */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={handleExportPdf}
            className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            Export PDF
          </button>
          <button
            onClick={handleOpenSignature}
            className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            Sign &amp; Export
          </button>
          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            Export Excel
          </button>
          <button
            onClick={handleExportFldigi}
            className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            Export FLdigi
          </button>
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            Print
          </button>
          <button
            onClick={() => setShowEventEdit(true)}
            className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            Edit Event
          </button>
          <div className="w-px h-5 bg-gray-600 mx-1" />
          {!confirmClose ? (
            <button
              onClick={() => setConfirmClose(true)}
              className="px-3 py-1.5 text-xs bg-red-700 hover:bg-red-600 rounded transition-colors"
            >
              Close Incident
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-xs text-red-300">Confirm?</span>
              <button
                onClick={handleCloseIncident}
                className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 rounded"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmClose(false)}
                className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 rounded"
              >
                No
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Op period bar */}
      <div className="bg-gray-700 text-gray-300 text-xs px-4 py-1 flex flex-wrap gap-x-6 gap-y-1 flex-shrink-0">
        <span>
          Op Period From:{" "}
          <span className="text-white font-mono">
            {event.from_date || "—"} {event.from_time || ""}
          </span>
        </span>
        <span>
          To:{" "}
          <span className="text-white font-mono">
            {event.to_date || "—"} {event.to_time || ""}
          </span>
        </span>
        <span className="ml-auto text-gray-500">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Entry form (fixed top) */}
      {!event.to_date && <EntryForm eventId={event.id} onEntryAdded={handleEntryAdded} />}
      {event.to_date && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800 flex items-center justify-between flex-shrink-0">
          <span>This incident is closed. Log entries are read-only.</span>
          <button
            onClick={handleReopenIncident}
            className="px-3 py-1 text-xs bg-yellow-600 text-white rounded font-semibold hover:bg-yellow-700 transition-colors"
          >
            Reopen Incident
          </button>
        </div>
      )}

      {/* Log table — fills the remaining window height and scrolls */}
      <div
        ref={tableContainerRef}
        className="log-table-container flex-1 min-h-0 bg-white border-t border-gray-200"
      >
        <LogTable
          entries={entries}
          onDoubleClick={(entry) => setEditingEntry(entry)}
        />
      </div>

      {/* Edit modal */}
      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          onSaved={handleEntrySaved}
          onDeleted={handleEntryDeleted}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {/* Event edit modal */}
      {showEventEdit && (
        <EventEditModal
          event={event}
          onSaved={(updated) => {
            onEventUpdate(updated);
            setShowEventEdit(false);
          }}
          onClose={() => setShowEventEdit(false)}
        />
      )}

      {/* Sign & export modal */}
      {showSignature && (
        <SignatureModal event={event} entries={entries} onClose={() => setShowSignature(false)} />
      )}
    </div>
  );
}

// ── Inline EventEditModal ─────────────────────────────────────────────────────

interface EventEditProps {
  event: Event;
  onSaved: (event: Event) => void;
  onClose: () => void;
}

function EventEditModal({ event, onSaved, onClose }: EventEditProps) {
  const [incidentName, setIncidentName] = useState(event.incident_name);
  const [radioNetwork, setRadioNetwork] = useState(event.radio_network_name);
  const [radioOperator, setRadioOperator] = useState(event.radio_operator);
  const [fromDate, setFromDate] = useState(event.from_date || "");
  const [fromTime, setFromTime] = useState(event.from_time || "");
  const [toDate, setToDate] = useState(event.to_date || "");
  const [toTime, setToTime] = useState(event.to_time || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const input: UpdateEventInput = {
        incident_name: incidentName.trim(),
        radio_network_name: radioNetwork.trim(),
        radio_operator: radioOperator.trim(),
        from_date: fromDate.trim() || null,
        from_time: fromTime.trim() || null,
        to_date: toDate.trim() || null,
        to_time: toTime.trim() || null,
      };
      const updated = await invoke<Event>("update_event", { id: event.id, input });
      onSaved(updated);
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">Edit Event Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          <Field label="Incident Name" value={incidentName} onChange={setIncidentName} />
          <Field label="Radio Network Name" value={radioNetwork} onChange={setRadioNetwork} />
          <Field label="Radio Operator" value={radioOperator} onChange={setRadioOperator} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
              <input type="text" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                placeholder="YYYY-MM-DD"
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From Time</label>
              <input type="text" value={fromTime} onChange={(e) => setFromTime(e.target.value)}
                placeholder="HHMM" maxLength={4}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
              <input type="text" value={toDate} onChange={(e) => setToDate(e.target.value)}
                placeholder="YYYY-MM-DD"
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To Time</label>
              <input type="text" value={toTime} onChange={(e) => setToTime(e.target.value)}
                placeholder="HHMM" maxLength={4}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:border-blue-500" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" />
    </div>
  );
}

// ── Print HTML template ────────────────────────────────────────────────────────

function buildPrintHtml(event: Event, entries: LogEntry[]): string {
  const rows = entries.map((e) => `
    <tr>
      <td>${e.time_value || ""}</td>
      <td>${e.from_callsign || ""}</td>
      <td>${e.from_msg_num || ""}</td>
      <td>${e.to_callsign || ""}</td>
      <td>${e.to_msg_num || ""}</td>
      <td>${(e.message || "").replace(/\n/g, "<br>")}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>ICS-309 - ${event.incident_name}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 10pt; margin: 0.5in; }
  h1 { text-align: center; font-size: 14pt; margin-bottom: 8px; }
  .header-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #000; margin-bottom: 0; }
  .header-cell { padding: 4px 6px; border: 1px solid #000; }
  .header-cell .label { font-size: 7pt; font-weight: normal; }
  .header-cell .value { font-size: 11pt; font-weight: bold; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #000; padding: 2px 4px; font-size: 8pt; vertical-align: top; }
  th { background: #e0e0e0; font-weight: bold; text-align: center; }
  td:nth-child(1) { font-family: monospace; white-space: nowrap; }
  td:nth-child(2), td:nth-child(4) { font-family: monospace; text-transform: uppercase; }
  td:nth-child(3), td:nth-child(5) { text-align: center; }
  .footer { display: grid; grid-template-columns: 2fr 1fr; border: 1px solid #000; margin-top: 4px; }
  .footer-cell { padding: 4px 6px; border: 1px solid #000; }
  @media print { body { margin: 0.4in; } }
</style>
</head>
<body>
<h1>Communications Log (ICS 309)</h1>
<div class="header-grid">
  <div class="header-cell">
    <div class="label">1. INCIDENT NAME</div>
    <div class="value">${event.incident_name}</div>
  </div>
  <div class="header-cell">
    <div class="label">2. OPERATIONAL PERIOD</div>
    <div>From: ${event.from_date || ""} ${event.from_time || ""}</div>
    <div>To: ${event.to_date || ""} ${event.to_time || ""}</div>
  </div>
  <div class="header-cell">
    <div class="label">3. RADIO NETWORK NAME</div>
    <div class="value">${event.radio_network_name}</div>
  </div>
  <div class="header-cell">
    <div class="label">4. RADIO OPERATOR (Name, Call Sign)</div>
    <div class="value">${event.radio_operator}</div>
  </div>
</div>
<table>
  <thead>
    <tr>
      <th rowspan="2">Time<br>(24:00)</th>
      <th colspan="2">FROM</th>
      <th colspan="2">TO</th>
      <th rowspan="2">Message</th>
    </tr>
    <tr>
      <th>Call Sign/ID</th><th>Msg #</th>
      <th>Call Sign/ID</th><th>Msg #</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">
  <div class="footer-cell">
    <div class="label">6. PREPARED BY (Name, Position)</div>
    <div>${event.radio_operator}</div>
  </div>
  <div class="footer-cell">
    <div class="label">7. DATE &amp; TIME PREPARED</div>
    <div>${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
  </div>
</div>
</body>
</html>`;
}
