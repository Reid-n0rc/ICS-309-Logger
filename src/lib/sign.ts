import { Buffer } from "buffer";
import type { PDFDocument } from "pdf-lib";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import * as signpdfNs from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import type { Ics309Fields } from "./ics309Pdf";

const MM_TO_PT = 72 / 25.4;

// The default export's `.sign` may be nested under `.default` depending on interop.
interface Signer {
  sign(pdf: Buffer, signer: P12Signer): Promise<Buffer>;
}
function resolveSignpdf(mod: unknown): Signer {
  let c: unknown = (mod as { default?: unknown })?.default ?? mod;
  for (let i = 0; i < 3 && c && typeof (c as Signer).sign !== "function"; i++) {
    c = (c as { default?: unknown }).default;
  }
  return c as Signer;
}

export interface Certificate {
  p12: Uint8Array;
  passphrase: string;
}

/**
 * Add a signature placeholder over the last page's signature box and produce a
 * cryptographically signed PDF (PKCS#7 detached) using the given .p12 certificate.
 */
export async function signWithCertificate(
  pdfDoc: PDFDocument,
  fields: Ics309Fields,
  cert: Certificate,
  signerName: string,
  visibleWidget: boolean
): Promise<Uint8Array> {
  const pages = pdfDoc.getPages();
  // Place the signature widget in the last page's signature box, unless a visible
  // signature image is already drawn there — then keep the crypto widget invisible
  // so the viewer doesn't render the signer name on top of the image.
  const widgets = fields.signatureWidgets;
  const sw = widgets[widgets.length - 1] ?? { page: pages.length, x: 0, y: 0, w: 0, h: 0 };
  const pageIdx = Math.min(sw.page - 1, pages.length - 1);
  const page = pages[pageIdx];
  const pageHpt = page.getHeight();
  const widgetRect: [number, number, number, number] = visibleWidget
    ? [sw.x * MM_TO_PT, pageHpt - (sw.y + sw.h) * MM_TO_PT, (sw.x + sw.w) * MM_TO_PT, pageHpt - sw.y * MM_TO_PT]
    : [0, 0, 0, 0];

  pdflibAddPlaceholder({
    pdfDoc,
    pdfPage: page,
    reason: "ICS-309 Communications Log",
    contactInfo: "",
    name: signerName,
    location: "",
    widgetRect,
  });

  // Signing requires the cross-reference table (no object streams).
  const withPlaceholder = await pdfDoc.save({ useObjectStreams: false });
  const signpdf = resolveSignpdf(signpdfNs);
  const signer = new P12Signer(cert.p12, { passphrase: cert.passphrase });
  const signed = await signpdf.sign(Buffer.from(withPlaceholder), signer);
  return new Uint8Array(signed);
}
