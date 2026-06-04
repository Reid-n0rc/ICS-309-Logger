import { useState, useRef, KeyboardEvent, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogEntry, CreateLogEntryInput } from "../types";

interface Props {
  eventId: number;
  onEntryAdded: (entry: LogEntry) => void;
}

function nowTime(): string {
  const now = new Date();
  return String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");
}

export default function EntryForm({ eventId, onEntryAdded }: Props) {
  const [timeVal, setTimeVal] = useState("");
  const [fromCs, setFromCs] = useState("");
  const [fromNum, setFromNum] = useState("");
  const [toCs, setToCs] = useState("");
  const [toNum, setToNum] = useState("");
  const [message, setMessage] = useState("");

  // Track which msg# fields were manually set vs auto-populated
  const fromNumManual = useRef(false);
  const toNumManual = useRef(false);

  const timeRef = useRef<HTMLInputElement>(null);
  const fromCsRef = useRef<HTMLInputElement>(null);
  const fromNumRef = useRef<HTMLInputElement>(null);
  const toCsRef = useRef<HTMLInputElement>(null);
  const toNumRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const reset = useCallback(() => {
    setTimeVal("");
    setFromCs("");
    setFromNum("");
    setToCs("");
    setToNum("");
    setMessage("");
    fromNumManual.current = false;
    toNumManual.current = false;
    fromCsRef.current?.focus();
  }, []);

  const fetchNextNum = useCallback(
    async (callsign: string, direction: "from" | "to"): Promise<string> => {
      if (!callsign.trim()) return "";
      try {
        const num = await invoke<number>("get_next_msg_num", {
          eventId,
          callsign: callsign.trim(),
          direction,
        });
        return String(num);
      } catch {
        return "1";
      }
    },
    [eventId]
  );

  // Auto-populate the From/To Msg# from the call sign. Runs on blur so it fires no
  // matter how focus leaves the field — desktop Enter, Tab, a tap, or the Android
  // soft-keyboard "Next" action all trigger it.
  const populateFromNum = useCallback(async () => {
    if (fromCs.trim() && !fromNumManual.current) {
      const next = await fetchNextNum(fromCs, "from");
      setFromNum(next);
      fromNumManual.current = false;
    }
  }, [fromCs, fetchNextNum]);

  const populateToNum = useCallback(async () => {
    if (toCs.trim() && !toNumManual.current) {
      const next = await fetchNextNum(toCs, "to");
      setToNum(next);
      toNumManual.current = false;
    }
  }, [toCs, fetchNextNum]);

  // From Callsign: Enter → move to To Callsign (blur auto-populates From Msg#)
  const handleFromCsKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      toCsRef.current?.focus();
    }
  };

  // From Msg#: any keystroke marks it as manually set
  const handleFromNumChange = (val: string) => {
    setFromNum(val);
    fromNumManual.current = true;
  };

  const handleFromNumKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      toCsRef.current?.focus();
    }
  };

  // To Callsign: Enter → move to Message (blur auto-populates To Msg#)
  const handleToCsKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      messageRef.current?.focus();
    }
  };

  const handleToNumChange = (val: string) => {
    setToNum(val);
    toNumManual.current = true;
  };

  const handleToNumKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      messageRef.current?.focus();
    }
  };

  // Message: Enter submits, Shift+Enter inserts newline
  const handleMessageKeyDown = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await submitEntry();
    }
  };

  const submitEntry = async () => {
    const finalTime = timeVal.trim() || nowTime();

    const input: CreateLogEntryInput = {
      event_id: eventId,
      time_value: finalTime || null,
      from_callsign: fromCs.trim() || null,
      from_msg_num: fromNum.trim() || null,
      to_callsign: toCs.trim() || null,
      to_msg_num: toNum.trim() || null,
      message: message.trim() || null,
    };

    try {
      const entry = await invoke<LogEntry>("create_log_entry", { input });
      onEntryAdded(entry);
      reset();
    } catch (err) {
      console.error("Failed to save entry:", err);
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        New Log Entry
      </div>
      <div className="flex flex-wrap gap-2 items-start">
        {/* Time */}
        <div className="flex-shrink-0" style={{ width: 72 }}>
          <label className="block text-xs text-gray-500 mb-1">Time (24h)</label>
          <input
            ref={timeRef}
            type="text"
            value={timeVal}
            onChange={(e) => setTimeVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                fromCsRef.current?.focus();
              }
            }}
            enterKeyHint="next"
            inputMode="numeric"
            placeholder="HHMM"
            maxLength={4}
            className="entry-field w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* FROM */}
        <div className="flex gap-1 flex-shrink-0">
          <div style={{ width: 120 }}>
            <label className="block text-xs text-gray-500 mb-1">From Callsign/ID</label>
            <input
              ref={fromCsRef}
              autoFocus
              type="text"
              value={fromCs}
              onChange={(e) => {
                setFromCs(e.target.value);
                // If callsign changes, reset auto-flag so it re-fetches
                fromNumManual.current = false;
                setFromNum("");
              }}
              onKeyDown={handleFromCsKeyDown}
              onBlur={populateFromNum}
              enterKeyHint="next"
              className="entry-field w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono uppercase focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div style={{ width: 64 }}>
            <label className="block text-xs text-gray-500 mb-1">Msg #</label>
            <input
              ref={fromNumRef}
              type="text"
              value={fromNum}
              onChange={(e) => handleFromNumChange(e.target.value)}
              onKeyDown={handleFromNumKeyDown}
              tabIndex={-1}
              inputMode="numeric"
              className="entry-field w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono text-center focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* TO */}
        <div className="flex gap-1 flex-shrink-0">
          <div style={{ width: 120 }}>
            <label className="block text-xs text-gray-500 mb-1">To Callsign/ID</label>
            <input
              ref={toCsRef}
              type="text"
              value={toCs}
              onChange={(e) => {
                setToCs(e.target.value);
                toNumManual.current = false;
                setToNum("");
              }}
              onKeyDown={handleToCsKeyDown}
              onBlur={populateToNum}
              enterKeyHint="next"
              className="entry-field w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono uppercase focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div style={{ width: 64 }}>
            <label className="block text-xs text-gray-500 mb-1">Msg #</label>
            <input
              ref={toNumRef}
              type="text"
              value={toNum}
              onChange={(e) => handleToNumChange(e.target.value)}
              onKeyDown={handleToNumKeyDown}
              tabIndex={-1}
              inputMode="numeric"
              className="entry-field w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono text-center focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Message */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1">
            Message <span className="font-normal text-gray-400">(Enter to submit · Shift+Enter for new line)</span>
          </label>
          <textarea
            ref={messageRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleMessageKeyDown}
            enterKeyHint="send"
            rows={2}
            spellCheck
            className="entry-field w-full px-2 py-1.5 border border-gray-300 rounded text-sm resize-none focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Submit button */}
        <div className="flex-shrink-0 mt-1 sm:mt-5">
          <button
            onClick={submitEntry}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            Log Entry
          </button>
        </div>
      </div>
    </div>
  );
}
