import { PDFDocument, PDFName, PDFNumber, PDFString, PDFArray, rgb } from "pdf-lib";
import type { Ics309Fields } from "./ics309Pdf";

const MM_TO_PT = 72 / 25.4;

/**
 * Take a rendered ICS-309 PDF (bytes) plus the field rectangles collected during
 * rendering, and add an AcroForm layer:
 *   • a fillable text field over every blank communications-log cell, and
 *   • a single signature field whose widget appears on every page (sign once → all
 *     pages show signed).
 * Coordinates arrive in mm with a top-left origin and are converted to PDF points
 * with a bottom-left origin.
 */
export async function addAcroFields(
  pdfBytes: Uint8Array,
  fields: Ics309Fields
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const pages = pdfDoc.getPages();
  const context = pdfDoc.context;

  const toRect = (pageIdx: number, x: number, y: number, w: number, h: number) => {
    const pageHpt = pages[pageIdx].getHeight();
    return {
      x: x * MM_TO_PT,
      y: pageHpt - (y + h) * MM_TO_PT,
      width: w * MM_TO_PT,
      height: h * MM_TO_PT,
    };
  };

  // 1. Fillable text fields over blank log cells.
  for (const f of fields.textCells) {
    const pageIdx = f.page - 1;
    if (pageIdx < 0 || pageIdx >= pages.length) continue;
    const r = toRect(pageIdx, f.x, f.y, f.w, f.h);
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

  // 2. One signature field with a widget on each page.
  if (fields.signatureWidgets.length > 0) {
    const acro = form.acroForm;
    const sigRef = context.nextRef();
    const kids = PDFArray.withContext(context);

    for (const sw of fields.signatureWidgets) {
      const pageIdx = sw.page - 1;
      if (pageIdx < 0 || pageIdx >= pages.length) continue;
      const page = pages[pageIdx];
      const r = toRect(pageIdx, sw.x, sw.y, sw.w, sw.h);
      const widget = context.obj({
        Type: PDFName.of("Annot"),
        Subtype: PDFName.of("Widget"),
        FT: PDFName.of("Sig"),
        Rect: context.obj([r.x, r.y, r.x + r.width, r.y + r.height]),
        P: page.ref,
        Parent: sigRef,
        F: PDFNumber.of(4), // Print
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
    // SigFlags: SignaturesExist (1) | AppendOnly (2) = 3
    acro.dict.set(PDFName.of("SigFlags"), PDFNumber.of(3));
  }

  return pdfDoc.save();
}
