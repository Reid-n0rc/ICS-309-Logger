import { useState } from "react";
import SettingsModal from "./SettingsModal";

interface Props {
  /** Positioning/layout classes for the wrapper (e.g. fixed corner placement). */
  className?: string;
  /** Styling classes for the "File" button so it matches light/dark chrome. */
  buttonClassName?: string;
}

/** A "File" menu with a Settings… item (opens the Settings dialog). */
export default function FileMenu({ className = "", buttonClassName = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <div className={`relative inline-block ${className}`}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={buttonClassName}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          File
        </button>
        {open && (
          <>
            {/* click-away backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              role="menu"
              className="absolute left-0 mt-1 z-50 min-w-[160px] rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1 text-sm text-gray-800 dark:text-gray-100"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setShowSettings(true);
                }}
                className="block w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Settings…
              </button>
            </div>
          </>
        )}
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
