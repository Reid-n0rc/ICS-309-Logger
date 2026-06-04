import * as XLSX from "xlsx";
import { Event, LogEntry } from "../types";
import { saveBytesWithDialog } from "./saveFile";

/**
 * Export the event as an .xlsx workbook laid out like the ICS-309 form:
 * incident/operator header block, then the grouped FROM/TO communications log.
 * Prompts the user for the save location. Returns the saved path, or null if cancelled.
 */
export async function exportIcs309Excel(
  event: Event,
  entries: LogEntry[]
): Promise<string | null> {
  const fromPeriod = `${event.from_date ?? ""} ${event.from_time ?? ""}`.trim();
  const toPeriod = `${event.to_date ?? ""} ${event.to_time ?? ""}`.trim();
  const now = new Date();
  const prepared = `${now.toLocaleDateString()} ${String(now.getHours()).padStart(2, "0")}${String(
    now.getMinutes()
  ).padStart(2, "0")}`;

  // Build the sheet as an array of rows (array-of-arrays).
  const rows: (string | number)[][] = [
    ["Communications Log (ICS 309)"],
    [],
    ["1. Incident Name:", event.incident_name, "", "2. Operational Period From:", fromPeriod],
    ["3. Radio Network Name:", event.radio_network_name, "", "To:", toPeriod],
    ["4. Radio Operator (Name, Call Sign):", event.radio_operator],
    [],
    ["5. Communications Log"],
    ["Time (24:00)", "FROM", "", "TO", "", "Message"],
    ["", "Call Sign/ID", "Msg #", "Call Sign/ID", "Msg #", ""],
  ];

  for (const e of entries) {
    rows.push([
      e.time_value ?? "",
      e.from_callsign ?? "",
      e.from_msg_num ?? "",
      e.to_callsign ?? "",
      e.to_msg_num ?? "",
      e.message ?? "",
    ]);
  }

  rows.push([]);
  rows.push(["6. Prepared By (Name, Position):", event.radio_operator]);
  rows.push(["7. Date & Time Prepared:", prepared]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths (chars).
  ws["!cols"] = [
    { wch: 14 },
    { wch: 16 },
    { wch: 8 },
    { wch: 16 },
    { wch: 8 },
    { wch: 60 },
  ];

  // Merge the title and the FROM / TO group-header cells (0-indexed rows/cols).
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, // title across all columns
    { s: { r: 7, c: 1 }, e: { r: 7, c: 2 } }, // "FROM" over Call Sign/ID + Msg #
    { s: { r: 7, c: 3 }, e: { r: 7, c: 4 } }, // "TO" over Call Sign/ID + Msg #
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ICS-309");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const bytes = new Uint8Array(out);
  const filename = `ICS309-${event.incident_name.replace(/\s+/g, "_")}.xlsx`;
  return saveBytesWithDialog(
    filename,
    [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    bytes
  );
}
