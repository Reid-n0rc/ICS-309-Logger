import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Event, LogEntry } from "../types";
import { saveBytesWithDialog } from "./saveFile";

export async function exportIcs309Pdf(event: Event, entries: LogEntry[]): Promise<string | null> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;
  const usableW = pageW - margin * 2;

  // ── Title ──────────────────────────────────────────────────────────────────
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Communications Log (ICS 309)", pageW / 2, 18, { align: "center" });

  // ── Header boxes ──────────────────────────────────────────────────────────
  let y = 24;
  const boxH = 16;
  const halfW = usableW / 2;

  // Row 1: Incident Name | Operational Period
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.rect(margin, y, halfW, boxH);
  doc.text("1. INCIDENT NAME", margin + 1, y + 3);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(event.incident_name, margin + 2, y + 10);

  doc.rect(margin + halfW, y, halfW, boxH);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("2. OPERATIONAL PERIOD", margin + halfW + 1, y + 3);
  doc.setFontSize(9);
  doc.text(
    `From: ${event.from_date || ""} ${event.from_time || ""}`,
    margin + halfW + 2,
    y + 8
  );
  doc.text(
    `To:   ${event.to_date || ""} ${event.to_time || ""}`,
    margin + halfW + 2,
    y + 13
  );

  y += boxH;

  // Row 2: Radio Network Name | Radio Operator
  doc.rect(margin, y, halfW, boxH);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("3. RADIO NETWORK NAME", margin + 1, y + 3);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(event.radio_network_name, margin + 2, y + 10);

  doc.rect(margin + halfW, y, halfW, boxH);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("4. RADIO OPERATOR (Name, Call Sign)", margin + halfW + 1, y + 3);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(event.radio_operator, margin + halfW + 2, y + 10);

  y += boxH + 2;

  // ── Section 5 label ────────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("5. COMMUNICATIONS LOG", pageW / 2, y + 4, { align: "center" });
  y += 7;

  // ── Log table ──────────────────────────────────────────────────────────────
  const tableData = entries.map((e) => [
    e.time_value || "",
    e.from_callsign || "",
    e.from_msg_num || "",
    e.to_callsign || "",
    e.to_msg_num || "",
    e.message || "",
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      [
        { content: "Time\n(24:00)", rowSpan: 1 },
        { content: "FROM", colSpan: 2, styles: { halign: "center" } },
        { content: "TO", colSpan: 2, styles: { halign: "center" } },
        { content: "Message", rowSpan: 1 },
      ],
      ["", "Call Sign/ID", "Msg #", "Call Sign/ID", "Msg #", ""],
    ],
    body: tableData.length > 0 ? tableData : [["", "", "", "", "", ""]],
    columnStyles: {
      0: { cellWidth: 18, font: "courier", fontSize: 8 },
      1: { cellWidth: 30, font: "courier", fontSize: 8 },
      2: { cellWidth: 16, halign: "center", font: "courier", fontSize: 8 },
      3: { cellWidth: 30, font: "courier", fontSize: 8 },
      4: { cellWidth: 16, halign: "center", font: "courier", fontSize: 8 },
      5: { cellWidth: "auto", fontSize: 8 },
    },
    headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: "bold", fontSize: 7 },
    bodyStyles: { fontSize: 8, minCellHeight: 7 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    theme: "grid",
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? 240;
  const footerY = Math.max(finalY + 4, doc.internal.pageSize.getHeight() - 20);

  const thirdW = usableW / 3;
  doc.rect(margin, footerY, thirdW * 2, 14);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("6. PREPARED BY (Name, Position)", margin + 1, footerY + 3);
  doc.setFontSize(9);
  doc.text(event.radio_operator, margin + 2, footerY + 10);

  doc.rect(margin + thirdW * 2, footerY, thirdW, 14);
  doc.setFontSize(7);
  doc.text("7. DATE & TIME PREPARED", margin + thirdW * 2 + 1, footerY + 3);
  const now = new Date();
  const dtStr = `${now.toLocaleDateString()} ${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  doc.setFontSize(9);
  doc.text(dtStr, margin + thirdW * 2 + 2, footerY + 10);

  const filename = `ICS309-${event.incident_name.replace(/\s+/g, "_")}.pdf`;
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  return saveBytesWithDialog(filename, [{ name: "PDF Document", extensions: ["pdf"] }], bytes);
}
