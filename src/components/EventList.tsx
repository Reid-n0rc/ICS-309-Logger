import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Event } from "../types";

interface Props {
  onSelect: (event: Event) => void;
  onBack: () => void;
}

export default function EventList({ onSelect, onBack }: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<Event[]>("get_events")
      .then(setEvents)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Open Existing Event</h2>
        <button onClick={onBack} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">
          ×
        </button>
      </div>

      {loading && <p className="text-gray-500 dark:text-gray-400">Loading...</p>}
      {!loading && events.length === 0 && (
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">No events found.</p>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {events.map((ev) => (
          <button
            key={ev.id}
            onClick={() => onSelect(ev)}
            className="w-full text-left px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded hover:bg-blue-50 dark:hover:bg-gray-700 hover:border-blue-300 dark:hover:border-gray-500 transition-colors"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium text-gray-800 dark:text-gray-100">{ev.incident_name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {ev.radio_network_name} · {ev.radio_operator}
                </div>
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 text-right ml-4 flex-shrink-0">
                <div>{ev.from_date} {ev.from_time}</div>
                {ev.closed && (
                  <div className="text-red-500 font-medium">Closed</div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={onBack}
        className="mt-6 px-6 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        Back
      </button>
    </div>
  );
}
