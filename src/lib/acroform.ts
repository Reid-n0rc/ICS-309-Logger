import { PDFDocument, PDFName, PDFNumber, PDFString, PDFArray, rgb } from "pdf-lib";
import type { Ics309Fields } from "./ics309Pdf";

const MM_TO_PT = 72 / 25.4;

/** Convert a mm/top-left rect to a pdf-lib pt/bottom-left rect on the given page. */
function toRect(
  pages: ReturnType<PDFDocument["getPages"]>,
  pageIdx: number,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const pageHpt = pages[pageIdx].getHeight();
  return {
    x: x * MM_TO_PT,
    y: pageHpt - (y + h) * MM_TO_PT,
    width: w * MM_TO_PT,
    height: h * MM_TO_PT,
  };
}

/** Add a bordered, fillable text field over every blank communications-log cell. */
export function addFillableCells(pdfDoc: PDFDocument, fields: Ics309Fields): void {
  const form = pdfDoc.getForm();
  const pages = pdfDoc.getPages();
  for (const f of fields.textCells) {
    const pageIdx = f.page - 1;
    if (pageIdx < 0 || pageIdx >= pages.length) continue;
    const r = toRect(pages, pageIdx, f.x, f.y, f.w, f.h);
    const tf = form.createTextField(f.name);
    tf.addToPage(pages[pageIdx], {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      borderWidth: 0.5,
      borderColor: rgb(0, 0, 0),
    });
    tf.setFontSize(8);
  }
}

/**
 * Add one signature field whose widget appears on every page (sign once → all pages
 * show signed). Used for the unsigned export so a viewer can apply a signature.
 */
export function addEmptySignatureField(pdfDoc: PDFDocument, fields: Ics309Fields): void {
  if (fields.signatureWidgets.length === 0) return;
  const form = pdfDoc.getForm();
  const pages = pdfDoc.getPages();
  const context = pdfDoc.context;
  const acro = form.acroForm;
  const sigRef = context.nextRef();
  const kids = PDFArray.withContext(context);

  for (const sw of fields.signatureWidgets) {
    const pageIdx = sw.page - 1;
    if (pageIdx < 0 || pageIdx >= pages.length) continue;
    const page = pages[pageIdx];
    const r = toRect(pages, pageIdx, sw.x, sw.y, sw.w, sw.h);
    const widget = context.obj({
      Type: PDFName.of("Annot"),
      Subtype: PDFName.of("Widget"),
      FT: PDFName.of("Sig"),
      Rect: context.obj([r.x, r.y, r.x + r.width, r.y + r.height]),
      P: page.ref,
      Parent: sigRef,
      F: PDFNumber.of(4),
    });
    const widgetRef = context.register(widget);
    kids.push(widgetRef);

    let annots = page.node.Annots();
    if (!annots) {
      annots = context.obj([]) as PDFArray;
      page.node.set(PDFName.of("Annots"), annots);
    }
    annots.push(widgetRef);
  }

  const sigField = context.obj({
    FT: PDFName.of("Sig"),
    T: PDFString.of("Signature"),
    Ff: PDFNumber.of(0),
    Kids: kids,
  });
  context.assign(sigRef, sigField);
  acro.addField(sigRef);
  acro.dict.set(PDFName.of("SigFlags"), PDFNumber.of(3));
}

/** Draw a PNG signature image inside the signature box on every page. */
export async function embedSignatureImage(
  pdfDoc: PDFDocument,
  fields: Ics309Fields,
  pngBytes: Uint8Array
): Promise<void> {
  const png = await pdfDoc.embedPng(pngBytes);
  const pages = pdfDoc.getPages();
  for (const sw of fields.signatureWidgets) {
    const pageIdx = sw.page - 1;
    if (pageIdx < 0 || pageIdx >= pages.length) continue;
    const box = toRect(pages, pageIdx, sw.x, sw.y, sw.w, sw.h);
    // Fit the image within the box, preserving aspect ratio.
    const scale = Math.min(box.width / png.width, box.height / png.height);
    const w = png.width * scale;
    const h = png.height * scale;
    pages[pageIdx].drawImage(png, {
      x: box.x + (box.width - w) / 2,
      y: box.y + (box.height - h) / 2,
      width: w,
      height: h,
    });
  }
}

/** Unsigned export: fillable cells + an empty signature field. */
export async function addAcroFields(
  pdfBytes: Uint8Array,
  fields: Ics309Fields
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  addFillableCells(pdfDoc, fields);
  addEmptySignatureField(pdfDoc, fields);
  return pdfDoc.save();
}
