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

// Builds a jsPDF document laid out to match the official ICS-309 (ICS 309-CAN)
// Communications Log form. Kept free of any Tauri imports so it can be rendered
// and verified outside the app.

const pad2 = (n: number) => String(n).padStart(2, "0");

function periodLine(label: string, date?: string | null, time?: string | null): string {
  return `${label}  Date ${date || "____________"}    Time ${time || "________"}`;
}

export function buildIcs309Doc(event: Event, entries: LogEntry[]): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const margin = 8;
  const left = margin;
  const right = pageW - margin;
  const usableW = right - left;

  // Vertical layout anchors (mm).
  const titleY = 14;
  const headerTop = 17;
  const hRow = 12; // height of each header row
  const headerBottom = headerTop + hRow * 2;
  const sectionBarH = 6;
  const tableTop = headerBottom + sectionBarH;
  const footerH = 16;
  const footerTop = pageH - margin - footerH;

  const colSplit = left + usableW * 0.54; // boundary between left/right header columns

  const now = new Date();
  const preparedDt = `${now.toLocaleDateString()} ${pad2(now.getHours())}${pad2(now.getMinutes())}`;

  // Form chrome (title, header block, section bar, footer) — drawn on every page.
  const drawChrome = () => {
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Communications Log (ICS 309)", pageW / 2, titleY, { align: "center" });

    // Header block: 2 rows x 2 columns
    doc.rect(left, headerTop, colSplit - left, hRow); // 1. Incident Name
    doc.rect(colSplit, headerTop, right - colSplit, hRow); // 2. Operational Period
    doc.rect(left, headerTop + hRow, colSplit - left, hRow); // 3. Radio Network Name
    doc.rect(colSplit, headerTop + hRow, right - colSplit, hRow); // 4. Radio Operator

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("1. INCIDENT NAME", left + 1.5, headerTop + 3);
    doc.text("3. RADIO NETWORK NAME", left + 1.5, headerTop + hRow + 3);
    doc.text("2. OPERATIONAL PERIOD", colSplit + 1.5, headerTop + 3);
    doc.text("4. RADIO OPERATOR (Name, Call Sign)", colSplit + 1.5, headerTop + hRow + 3);

    // Field values
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(event.incident_name, left + 3, headerTop + 8.5, { maxWidth: colSplit - left - 6 });
    doc.text(event.radio_network_name, left + 3, headerTop + hRow + 8.5, {
      maxWidth: colSplit - left - 6,
    });
    doc.text(event.radio_operator, colSplit + 3, headerTop + hRow + 8.5, {
      maxWidth: right - colSplit - 6,
    });

    // Operational period From/To lines
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(periodLine("From:", event.from_date, event.from_time), colSplit + 2, headerTop + 7);
    doc.text(periodLine("To:", event.to_date, event.to_time), colSplit + 2, headerTop + 10.5);

    // Section 5 bar
    doc.rect(left, headerBottom, usableW, sectionBarH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("5.", left + 1.5, headerBottom + 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("COMMUNICATIONS LOG", pageW / 2, headerBottom + 4, { align: "center" });

    // Footer: 6. Prepared By | Signature | 7. Date & Time Prepared
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
  };

  // Body rows; pad with blank ruled rows so a short log still fills the page like the form.
  const bodyRowH = 6;
  const body: string[][] = entries.map((e) => [
    e.time_value || "",
    e.from_callsign || "",
    e.from_msg_num || "",
    e.to_callsign || "",
    e.to_msg_num || "",
    e.message || "",
  ]);
  const headApprox = 11;
  const rowsToFill = Math.floor((footerTop - tableTop - headApprox) / bodyRowH);
  while (body.length < rowsToFill) body.push(["", "", "", "", "", ""]);

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
    body,
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
      0: { cellWidth: 16, halign: "center", font: "courier" },
      1: { cellWidth: 26, font: "courier" },
      2: { cellWidth: 14, halign: "center", font: "courier" },
      3: { cellWidth: 26, font: "courier" },
      4: { cellWidth: 14, halign: "center", font: "courier" },
      5: { cellWidth: "auto" },
    },
    didDrawPage: drawChrome,
  });

  return doc;
}
