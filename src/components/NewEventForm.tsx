import { useState, useRef, KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Event, CreateEventInput } from "../types";

interface Props {
  onCreated: (event: Event) => void;
  onCancel: () => void;
}

export default function NewEventForm({ onCreated, onCancel }: Props) {
  const [incidentName, setIncidentName] = useState("");
  const [radioNetwork, setRadioNetwork] = useState("");
  const [radioOperator, setRadioOperator] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const networkRef = useRef<HTMLInputElement>(null);
  const operatorRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    next: React.RefObject<HTMLInputElement | null> | null,
    isLast = false
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isLast) {
        handleSubmit();
      } else {
        next?.current?.focus();
      }
    }
  };

  const handleSubmit = async () => {
    if (!incidentName.trim() || !radioNetwork.trim() || !radioOperator.trim()) {
      setError("All fields are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const input: CreateEventInput = {
        incident_name: incidentName.trim(),
        radio_network_name: radioNetwork.trim(),
        radio_operator: radioOperator.trim(),
      };
      const event = await invoke<Event>("create_event", { input });
      onCreated(event);
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Create New Event</h2>
        <button onClick={onCancel} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">
          ×
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Incident Name <span className="text-red-500">*</span>
          </label>
          <input
            autoFocus
            type="text"
            value={incidentName}
            onChange={(e) => setIncidentName(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, networkRef)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded focus:outline-none focus:border-blue-500"
            placeholder="e.g. Operation Blackwater"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Radio Network Name <span className="text-red-500">*</span>
          </label>
          <input
            ref={networkRef}
            type="text"
            value={radioNetwork}
            onChange={(e) => setRadioNetwork(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, operatorRef)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded focus:outline-none focus:border-blue-500"
            placeholder="e.g. Command Net"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Radio Operator (Name, Call Sign) <span className="text-red-500">*</span>
          </label>
          <input
            ref={operatorRef}
            type="text"
            value={radioOperator}
            onChange={(e) => setRadioOperator(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, null, true)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded focus:outline-none focus:border-blue-500"
            placeholder="e.g. John Smith, W1ABC"
          />
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

      <div className="flex gap-3 mt-6">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Creating..." : "Create Event"}
        </button>
        <button
          onClick={onCancel}
          className="px-6 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-center">
        Press Enter to advance between fields · Enter on last field creates the event
      </p>
    </div>
  );
}
