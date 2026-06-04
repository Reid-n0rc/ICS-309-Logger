import { useState } from "react";
import { Event } from "./types";
import StartupView from "./components/StartupView";
import LogView from "./components/LogView";

export type AppView = "startup" | "log";

export default function App() {
  const [view, setView] = useState<AppView>("startup");
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);

  const openEvent = (event: Event) => {
    setActiveEvent(event);
    setView("log");
  };

  const closeIncident = () => {
    setActiveEvent(null);
    setView("startup");
  };

  return (
    <div className="flex flex-col h-screen">
      {view === "startup" && <StartupView onOpenEvent={openEvent} />}
      {view === "log" && activeEvent && (
        <LogView event={activeEvent} onEventUpdate={setActiveEvent} onClose={closeIncident} />
      )}
    </div>
  );
}
