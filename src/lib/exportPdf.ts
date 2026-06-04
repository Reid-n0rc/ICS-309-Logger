import { Event, LogEntry } from "../types";
import { buildIcs309Doc } from "./ics309Pdf";
import { addAcroFields } from "./acroform";
import { saveBytesWithDialog } from "./saveFile";

/**
 * Build the ICS-309 PDF (form-accurate layout, last page filled with blank rows),
 * add the AcroForm layer (fillable blank cells + a shared signature field), then
 * prompt the user for a save location. Returns the saved path, or null if cancelled.
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
