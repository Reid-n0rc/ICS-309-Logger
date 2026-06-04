import { Event, LogEntry } from "../types";
import { buildIcs309Doc } from "./ics309Pdf";
import { saveBytesWithDialog } from "./saveFile";

/**
 * Build the ICS-309 PDF and prompt the user for a save location.
 * Returns the saved path, or null if the user cancelled.
 */
export async function exportIcs309Pdf(
  event: Event,
  entries: LogEntry[]
): Promise<string | null> {
  const doc = buildIcs309Doc(event, entries);
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  const filename = `ICS309-${event.incident_name.replace(/\s+/g, "_")}.pdf`;
  return saveBytesWithDialog(filename, [{ name: "PDF Document", extensions: ["pdf"] }], bytes);
}
