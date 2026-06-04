import { PDFDocument } from "pdf-lib";
import { Event, LogEntry } from "../types";
import { buildIcs309Doc } from "./ics309Pdf";
import {
  addFillableCells,
  addEmptySignatureField,
  embedSignatureImage,
  addAcroFields,
} from "./acroform";
import { signWithCertificate, type Certificate } from "./sign";
import { saveBytesWithDialog } from "./saveFile";

export interface SignOptions {
  /** PNG bytes of a drawn/typed visible signature, placed in the signature box. */
  signatureImagePng?: Uint8Array;
  /** Certificate for a cryptographic PKCS#7 signature. */
  certificate?: Certificate;
}

/** Produce the final ICS-309 PDF bytes for the given signing options. */
export async function buildIcs309Bytes(
  event: Event,
  entries: LogEntry[],
  opts: SignOptions = {}
): Promise<Uint8Array> {
  const { doc, fields } = buildIcs309Doc(event, entries);
  const rendered = new Uint8Array(doc.output("arraybuffer"));

  // Fast path: nothing extra → reuse the plain AcroForm export (cells + empty sig field).
  if (!opts.signatureImagePng && !opts.certificate) {
    return addAcroFields(rendered, fields);
  }

  const pdfDoc = await PDFDocument.load(rendered);
  addFillableCells(pdfDoc, fields);

  if (opts.signatureImagePng) {
    await embedSignatureImage(pdfDoc, fields, opts.signatureImagePng);
  }

  if (opts.certificate) {
    // If a visible signature image was drawn, keep the crypto widget invisible.
    const visibleWidget = !opts.signatureImagePng;
    return signWithCertificate(pdfDoc, fields, opts.certificate, event.radio_operator, visibleWidget);
  }

  // Visible signature only (no certificate) — no empty field needed.
  return pdfDoc.save();
}

function defaultName(event: Event): string {
  return `ICS309-${event.incident_name.replace(/\s+/g, "_")}.pdf`;
}

/** Unsigned export (fillable cells + empty signature field). */
export async function exportIcs309Pdf(
  event: Event,
  entries: LogEntry[]
): Promise<string | null> {
  const bytes = await buildIcs309Bytes(event, entries);
  return saveBytesWithDialog(defaultName(event), [{ name: "PDF Document", extensions: ["pdf"] }], bytes);
}

/** Signed export — visible signature image and/or certificate signature. */
export async function exportSignedIcs309Pdf(
  event: Event,
  entries: LogEntry[],
  opts: SignOptions
): Promise<string | null> {
  const bytes = await buildIcs309Bytes(event, entries, opts);
  return saveBytesWithDialog(defaultName(event), [{ name: "PDF Document", extensions: ["pdf"] }], bytes);
}
