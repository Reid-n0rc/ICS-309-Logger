import { jsPDF } from "jspdf";
import * as autoTableNs from "jspdf-autotable";
import type { UserOptions } from "jspdf-autotable";
import { Event, LogEntry } from "../types";

// Depending on the bundler/interop, jspdf-autotable's callable is the namespace, its
// `.default`, or a nested `.default`. Unwrap until we reach the function so this works
// in both Vite (app build) and Node (verification harness).
function resolveAutoTable(mod: unknown): (doc: jsPDF, options: UserOptions) => void {
  let candidate: unknown = mod;
  for (let i = 0; i < 3 && candidate && typeof candidate !== "function"; i++) {
    candidate = (candidate as { default?: unknown }).default;
  }
  return candidate as (doc: jsPDF, options: UserOptions) => void;
}
const autoTable = resolveAutoTable(autoTableNs);

const pad2 = (n: number) => String(n).padStart(2, "0");

// A rectangle (mm, top-left origin) on a given 1-based page, for an AcroForm field.
export interface FieldRect {
  name: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Ics309Fields {
  /** Empty log cells that should become fillable text fields. */
  textCells: FieldRect[];
  /** Footer signature-box rectangle on each page (one shared signature field). */
  signatureWidgets: Omit<FieldRect, "name">[];
  /** Page size in mm, for coordinate conversion. */
  pageWidthMm: number;
  pageHeightMm: number;
}

export interface Ics309Build {
  doc: jsPDF;
  fields: Ics309Fields;
}

export function buildIcs309Doc(event: Event, entries: LogEntry[]): Ics309Build {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const margin = 8;
  const left = margin;
  const right = pageW - margin;
  const usableW = right - left;

  const titleY = 14;
  const headerTop = 17;
  const hRow = 12;
  const headerBottom = headerTop + hRow * 2;
  const sectionBarH = 6;
  const tableTop = headerBottom + sectionBarH;
  const footerH = 16;
  const footerTop = pageH - margin - footerH;

  const colSplit = left + usableW * 0.54;

  // Fixed log column widths (must match autoTable columnStyles); the message column
  // takes the remainder. These define the vertical grid lines for the blank fill.
  const colW = [16, 26, 14, 26, 14];
  const messageW = usableW - colW.reduce((a, b) => a + b, 0);
  const allW = [...colW, messageW];
  const colX: number[] = [left];
  for (const w of allW) colX.push(colX[colX.length - 1] + w);
  const bodyRowH = 6;

  const now = new Date();
  const preparedDt = `${now.toLocaleDateString()} ${pad2(now.getHours())}${pad2(now.getMinutes())}`;

  const fields: Ics309Fields = {
    textCells: [],
    signatureWidgets: [],
    pageWidthMm: pageW,
    pageHeightMm: pageH,
  };
  let fieldSeq = 0;

  const periodLine = (label: string, date?: string | null, time?: string | null) =>
    `${label}  Date ${date || "____________"}    Time ${time || "________"}`;

  const drawChrome = () => {
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Communications Log (ICS 309)", pageW / 2, titleY, { align: "center" });

    doc.rect(left, headerTop, colSplit - left, hRow);
    doc.rect(colSplit, headerTop, right - colSplit, hRow);
    doc.rect(left, headerTop + hRow, colSplit - left, hRow);
    doc.rect(colSplit, headerTop + hRow, right - colSplit, hRow);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("1. INCIDENT NAME", left + 1.5, headerTop + 3);
    doc.text("3. RADIO NETWORK NAME", left + 1.5, headerTop + hRow + 3);
    doc.text("2. OPERATIONAL PERIOD", colSplit + 1.5, headerTop + 3);
    doc.text("4. RADIO OPERATOR (Name, Call Sign)", colSplit + 1.5, headerTop + hRow + 3);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(event.incident_name, left + 3, headerTop + 8.5, { maxWidth: colSplit - left - 6 });
    doc.text(event.radio_network_name, left + 3, headerTop + hRow + 8.5, {
      maxWidth: colSplit - left - 6,
    });
    doc.text(event.radio_operator, colSplit + 3, headerTop + hRow + 8.5, {
      maxWidth: right - colSplit - 6,
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(periodLine("From:", event.from_date, event.from_time), colSplit + 2, headerTop + 7);
    doc.text(periodLine("To:", event.to_date, event.to_time), colSplit + 2, headerTop + 10.5);

    doc.rect(left, headerBottom, usableW, sectionBarH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("5.", left + 1.5, headerBottom + 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("COMMUNICATIONS LOG", pageW / 2, headerBottom + 4, { align: "center" });

    // Footer
    const f1w = usableW * 0.46;
    const f2w = usableW * 0.3;
    const f1 = left;
    const f2 = f1 + f1w;
    const f3 = f2 + f2w;
    const f3w = right - f3;
    doc.rect(f1, footerTop, f1w, footerH);
    doc.rect(f2, footerTop, f2w, footerH);
    doc.rect(f3, footerTop, f3w, footerH);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("6. PREPARED BY (Name, Position)", f1 + 1.5, footerTop + 3);
    doc.text("SIGNATURE", f2 + 1.5, footerTop + 3);
    doc.text("7. DATE & TIME PREPARED", f3 + 1.5, footerTop + 3);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(event.radio_operator, f1 + 3, footerTop + 10, { maxWidth: f1w - 6 });
    doc.setFontSize(8);
    doc.text(preparedDt, f3 + 2, footerTop + 10, { maxWidth: f3w - 4 });

    // Record the signature widget area for this page (below the label, padded).
    fields.signatureWidgets.push({
      page: doc.getNumberOfPages(),
      x: f2 + 2,
      y: footerTop + 4.5,
      w: f2w - 4,
      h: footerH - 6,
    });
  };

  const body: string[][] = entries.map((e) => [
    e.time_value || "",
    e.from_callsign || "",
    e.from_msg_num || "",
    e.to_callsign || "",
    e.to_msg_num || "",
    e.message || "",
  ]);

  autoTable(doc, {
    startY: tableTop,
    margin: { top: tableTop, bottom: pageH - footerTop + 2, left, right: margin },
    head: [
      [
        { content: "Time\n(24:00)", rowSpan: 2, styles: { valign: "middle", halign: "center" } },
        { content: "FROM", colSpan: 2, styles: { halign: "center" } },
        { content: "TO", colSpan: 2, styles: { halign: "center" } },
        { content: "Message", rowSpan: 2, styles: { valign: "middle", halign: "center" } },
      ],
      [
        { content: "Call Sign/ID", styles: { halign: "center" } },
        { content: "Msg #", styles: { halign: "center" } },
        { content: "Call Sign/ID", styles: { halign: "center" } },
        { content: "Msg #", styles: { halign: "center" } },
      ],
    ],
    body: body.length ? body : [["", "", "", "", "", ""]],
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 1,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      minCellHeight: bodyRowH,
      valign: "top",
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      valign: "middle",
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: colW[0], halign: "center", font: "courier" },
      1: { cellWidth: colW[1], font: "courier" },
      2: { cellWidth: colW[2], halign: "center", font: "courier" },
      3: { cellWidth: colW[3], font: "courier" },
      4: { cellWidth: colW[4], halign: "center", font: "courier" },
      5: { cellWidth: "auto" },
    },
    didDrawPage: drawChrome,
    // Record empty cells in real rows so they become fillable too.
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      if (data.cell.raw === "" || data.cell.raw == null) {
        fields.textCells.push({
          name: `cell_${fieldSeq++}`,
          page: data.pageNumber,
          x: data.cell.x,
          y: data.cell.y,
          w: data.cell.width,
          h: data.cell.height,
        });
      }
    },
  });

  // Fill the remainder of the LAST page with blank ruled rows, and register each blank
  // cell as a fillable text field.
  const lastPage = doc.getNumberOfPages();
  doc.setPage(lastPage);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY: number = (doc as any).lastAutoTable?.finalY ?? tableTop;
  // Fill the rest of the last page with blank fillable rows. The grid for these rows
  // is formed by the (bordered) AcroForm fields added later, so no static lines here.
  const nFill = Math.floor((footerTop - finalY) / bodyRowH);
  for (let r = 0; r < nFill; r++) {
    const y = finalY + r * bodyRowH;
    for (let c = 0; c < allW.length; c++) {
      fields.textCells.push({
        name: `cell_${fieldSeq++}`,
        page: lastPage,
        x: colX[c],
        y,
        w: allW[c],
        h: bodyRowH,
      });
    }
  }

  // Stamp "PAGE X OF Y" at the bottom of every page (page count is final now).
  const totalPages = doc.getNumberOfPages();
  for (let pageNo = 1; pageNo <= totalPages; pageNo++) {
    doc.setPage(pageNo);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0);
    doc.text(`PAGE ${pageNo} OF ${totalPages}`, right, pageH - 3, { align: "right" });
  }

  return { doc, fields };
}
