import { Event, LogEntry } from "../types";
import { buildIcs309Doc } from "./ics309Pdf";
import { addAcroFields } from "./acroform";
import { saveBytesWithDialog } from "./saveFile";

/**
 * Build the ICS-309 PDF (form-accurate layout, fillable blank cells, and a blank
 * signature field that can be signed in a PDF reader), then prompt for a save
 * location. Returns the saved path, or null if the user cancelled.
 */
export async function exportIcs309Pdf(
  event: Event,
  entries: LogEntry[]
): Promise<string | null> {
  const { doc, fields } = buildIcs309Doc(event, entries);
  const rendered = new Uint8Array(doc.output("arraybuffer"));
  const withFields = await addAcroFields(rendered, fields);
  const filename = `ICS309-${event.incident_name.replace(/\s+/g, "_")}.pdf`;
  return saveBytesWithDialog(filename, [{ name: "PDF Document", extensions: ["pdf"] }], withFields);
}
