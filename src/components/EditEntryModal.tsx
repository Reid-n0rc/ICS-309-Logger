import { useState, KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogEntry, UpdateLogEntryInput } from "../types";

interface Props {
  entry: LogEntry;
  onSaved: (entry: LogEntry) => void;
  onDeleted: (id: number) => void;
  onClose: () => void;
}

export default function EditEntryModal({ entry, onSaved, onDeleted, onClose }: Props) {
  const [timeVal, setTimeVal] = useState(entry.time_value || "");
  const [fromCs, setFromCs] = useState(entry.from_callsign || "");
  const [fromNum, setFromNum] = useState(entry.from_msg_num || "");
  const [toCs, setToCs] = useState(entry.to_callsign || "");
  const [toNum, setToNum] = useState(entry.to_msg_num || "");
  const [message, setMessage] = useState(entry.message || "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const input: UpdateLogEntryInput = {
        time_value: timeVal.trim() || null,
        from_callsign: fromCs.trim() || null,
        from_msg_num: fromNum.trim() || null,
        to_callsign: toCs.trim() || null,
        to_msg_num: toNum.trim() || null,
        message: message.trim() || null,
      };
      const updated = await invoke<LogEntry>("update_log_entry", { id: entry.id, input });
      onSaved(updated);
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await invoke("delete_log_entry", { id: entry.id });
      onDeleted(entry.id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">Edit Log Entry</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Time (24h)</label>
              <input
                type="text"
                value={timeVal}
                onChange={(e) => setTimeVal(e.target.value)}
                maxLength={4}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">From Callsign/ID</label>
                <input
                  autoFocus
                  type="text"
                  value={fromCs}
                  onChange={(e) => setFromCs(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono uppercase focus:outline-none focus:border-blue-500"
                />
              </div>
              <div style={{ width: 72 }}>
                <label className="block text-xs font-medium text-gray-600 mb-1">Msg #</label>
                <input
                  type="text"
                  value={fromNum}
                  onChange={(e) => setFromNum(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono text-center focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">To Callsign/ID</label>
                <input
                  type="text"
                  value={toCs}
                  onChange={(e) => setToCs(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono uppercase focus:outline-none focus:border-blue-500"
                />
              </div>
              <div style={{ width: 72 }}>
                <label className="block text-xs font-medium text-gray-600 mb-1">Msg #</label>
                <input
                  type="text"
                  value={toNum}
                  onChange={(e) => setToNum(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono text-center focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              spellCheck
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
          <div>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2 text-red-600 border border-red-300 rounded text-sm hover:bg-red-50 transition-colors"
              >
                Delete Entry
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">Confirm delete?</span>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                >
                  Yes, Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
