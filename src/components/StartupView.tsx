import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Event } from "../types";
import NewEventForm from "./NewEventForm";
import EventList from "./EventList";
import ThemeToggle from "./ThemeToggle";
import FileMenu from "./FileMenu";

interface Props {
  onOpenEvent: (event: Event) => void;
}

type SubView = "home" | "new" | "open";

export default function StartupView({ onOpenEvent }: Props) {
  const [subView, setSubView] = useState<SubView>("home");
  const [recentEvents, setRecentEvents] = useState<Event[]>([]);

  useEffect(() => {
    invoke<Event[]>("get_events").then(setRecentEvents).catch(console.error);
  }, []);

  const handleNewEvent = (event: Event) => {
    onOpenEvent(event);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full overflow-y-auto bg-gray-100 dark:bg-gray-900 px-4 py-8">
      <div className="fixed top-3 left-3 z-50">
        <FileMenu buttonClassName="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-50 dark:hover:bg-gray-700" />
      </div>
      <ThemeToggle className="fixed top-3 right-3 z-50 w-9 h-9 border border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700" />
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">
            ICS-309 Communications Logger
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Incident Command System — Communications Log
          </p>
        </div>

        {subView === "home" && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <button
                onClick={() => setSubView("new")}
                className="px-8 py-3 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 transition-colors"
              >
                New Event
              </button>
              <button
                onClick={() => setSubView("open")}
                className="px-8 py-3 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700 transition-colors"
              >
                Open Existing Event
              </button>
            </div>

            {recentEvents.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Recent Events
                </h2>
                <div className="space-y-2">
                  {recentEvents.slice(0, 5).map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => onOpenEvent(ev)}
                      className="w-full text-left px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded hover:bg-blue-50 dark:hover:bg-gray-700 hover:border-blue-300 dark:hover:border-gray-500 transition-colors"
                    >
                      <div className="font-medium text-gray-800 dark:text-gray-100">{ev.incident_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {ev.radio_network_name} · {ev.radio_operator}
                        {ev.closed && (
                          <span className="ml-2 text-red-500 font-medium">[Closed]</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {subView === "new" && (
          <NewEventForm
            onCreated={handleNewEvent}
            onCancel={() => setSubView("home")}
          />
        )}

        {subView === "open" && (
          <EventList
            onSelect={onOpenEvent}
            onBack={() => setSubView("home")}
          />
        )}
      </div>
    </div>
  );
}
