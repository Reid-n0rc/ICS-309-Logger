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
    <div className="bg-white rounded-lg shadow-md p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">Open Existing Event</h2>
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
          ×
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {!loading && events.length === 0 && (
        <p className="text-gray-500 text-center py-8">No events found.</p>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {events.map((ev) => (
          <button
            key={ev.id}
            onClick={() => onSelect(ev)}
            className="w-full text-left px-4 py-3 bg-gray-50 border border-gray-200 rounded hover:bg-blue-50 hover:border-blue-300 transition-colors"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium text-gray-800">{ev.incident_name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {ev.radio_network_name} · {ev.radio_operator}
                </div>
              </div>
              <div className="text-xs text-gray-400 text-right ml-4 flex-shrink-0">
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
        className="mt-6 px-6 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
      >
        Back
      </button>
    </div>
  );
}
