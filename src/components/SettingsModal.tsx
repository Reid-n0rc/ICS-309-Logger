import { useState, KeyboardEvent } from "react";
import { getFldigiSettings, setFldigiSettings } from "../lib/settings";

interface Props {
  onClose: () => void;
}

/** Settings dialog (File → Settings). FLdigi section: XML-RPC host/port. */
export default function SettingsModal({ onClose }: Props) {
  const initial = getFldigiSettings();
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(String(initial.port));

  const save = () => {
    const p = parseInt(port, 10);
    setFldigiSettings({
      host: host.trim() || "127.0.0.1",
      port: Number.isFinite(p) && p > 0 ? p : 7362,
    });
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter") save();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
      onKeyDown={onKeyDown}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            FLdigi
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Where to reach FLdigi's XML-RPC socket when transmitting (Export FLdigi → send).
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                IP address / host
              </label>
              <input
                autoFocus
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="127.0.0.1"
                className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded text-sm font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Port
              </label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="7362"
                inputMode="numeric"
                maxLength={5}
                className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded text-sm font-mono text-center focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
