import PDFDocument from "pdfkit";
import { Response } from "express";

export interface ReportRow {
  room_number: string;
  task_type: string;
  status: string;
  assigned_to_name: string | null;
  completed_at: Date | null;
  signed_off_by_name: string | null;
}

export interface ReportData {
  station_name: string;
  report_date: string;
  date_from: string;
  date_to: string;
  total: number;
  completed: number;
  pending: number;
  rows: ReportRow[];
}

export function streamReportPdf(res: Response, data: ReportData) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const dateLabel = data.date_from === data.date_to
    ? `Datum: ${data.report_date}`
    : `Zeitraum: ${data.date_from} – ${data.date_to}`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="Reinigungsbericht_${data.station_name}_${data.report_date}.pdf"`
  );
  doc.pipe(res);

  // Header
  doc.fontSize(18).font("Helvetica-Bold").text("Reinigungs- & Desinfektionsbericht", { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").fillColor("#555")
    .text(`Station:  ${data.station_name}`)
    .text(dateLabel)
    .text(`Aufträge: ${data.completed} von ${data.total} abgeschlossen · ${data.pending} noch offen`);

  doc.moveDown(0.8);

  // Tabellenkopf
  const colX = [50, 220, 310, 410];
  const colW = [170, 90, 100, 130];
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
  ["Zimmer / Bett", "Typ", "Status", "Reiniger"].forEach((h, i) => {
    doc.text(h, colX[i], doc.y, { width: colW[i], continued: i < 3 });
  });
  doc.moveDown(0.2);

  // Trennlinie
  const lineY = doc.y;
  doc.moveTo(50, lineY).lineTo(545, lineY).strokeColor("#ccc").stroke();
  doc.moveDown(0.3);

  const typeLabels: Record<string, string> = {
    "bed_cleaning:normal":                    "Bett normal",
    "bed_cleaning:infektioes":                "Bett infekt.",
    "room_cleaning:standard":                 "Zimmer std.",
    "room_cleaning:schlussdesinfektion":      "Schlussdes.",
    "bed_cleaning_zentral:aufbereitung_zentral": "Bett Zentral",
  };
  const statusColors: Record<string, string> = {
    abgeschlossen: "#16a34a",
    laufend: "#7c3aed",
    angekommen: "#854d0e",
    unterwegs: "#3730a3",
    offen: "#1e40af",
  };

  data.rows.forEach((r, idx) => {
    const rowY = doc.y;
    if (idx % 2 === 0) {
      doc.rect(50, rowY - 2, 495, 16).fillColor("#f8fafc").fill();
    }
    const color = statusColors[r.status] ?? "#000";
    doc.font("Helvetica").fontSize(8).fillColor("#000");
    doc.text(r.room_number,                          colX[0], rowY, { width: colW[0] });
    doc.text(typeLabels[r.task_type] ?? r.task_type, colX[1], rowY, { width: colW[1] });
    doc.fillColor(color)
       .text(r.status,                               colX[2], rowY, { width: colW[2] });
    doc.fillColor("#333")
       .text(r.assigned_to_name ?? "–",              colX[3], rowY, { width: colW[3] });
    doc.moveDown(0.55);
  });

  doc.moveDown();
  doc.fontSize(7).fillColor("#888").font("Helvetica")
    .text(`Erzeugt: ${new Date().toLocaleString("de-DE")}`, { align: "right" });

  doc.end();
}

export interface BarcodeHistoryEntry {
  station_name: string;
  area_name: string;
  house_name: string;
  room_number: string;
  cleaning_type: string;
  status: string;
  assigned_to_name: string | null;
  created_at: string;
  completed_at: string | null;
  pathogens: string[];
}

export interface BarcodeReportData {
  barcode: string;
  date_from: string;
  date_to: string;
  total_tasks: number;
  unique_stations: number;
  history: BarcodeHistoryEntry[];
  station_stats: { station_name: string; area_name: string; house_name: string; count: number }[];
}

export function streamBarcodeReportPdf(res: Response, data: BarcodeReportData) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const dateLabel = data.date_from === data.date_to
    ? `Datum: ${data.date_from}`
    : `Zeitraum: ${data.date_from} – ${data.date_to}`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition",
    `attachment; filename="Reisehistorie_${data.barcode}_${data.date_from}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).font("Helvetica-Bold").text("Bett-Reisehistorie", { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").fillColor("#555")
    .text(`Strichcode: ${data.barcode}`)
    .text(dateLabel)
    .text(`Aufträge: ${data.total_tasks}  ·  Stationen besucht: ${data.unique_stations}`);

  doc.moveDown(0.8);

  // Stationsübersicht
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000").text("Stationsübersicht");
  doc.moveDown(0.3);
  data.station_stats.forEach((s, i) => {
    const y = doc.y;
    if (i % 2 === 0) doc.rect(50, y - 2, 495, 14).fillColor("#f8fafc").fill();
    doc.font("Helvetica").fontSize(9).fillColor("#000")
      .text(`${s.station_name}  (${s.area_name})`, 55, y, { width: 380 });
    doc.text(`${s.count}x`, 440, y, { width: 100 });
    doc.moveDown(0.45);
  });

  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000").text("Zeitverlauf");
  doc.moveDown(0.3);

  const cleanLabel: Record<string, string> = {
    normal: "Normale Aufbereitung", infektioes: "Infektiöse Aufbereitung",
    standard: "Standardreinigung", schlussdesinfektion: "Schlussdesinfektion",
    aufbereitung_zentral: "Zentrale Aufbereitung",
  };
  const statusColor: Record<string, string> = {
    abgeschlossen: "#16a34a", laufend: "#7c3aed", offen: "#1e40af",
  };

  data.history.forEach((t, i) => {
    if (doc.y > 720) { doc.addPage(); }
    const y = doc.y;
    if (i % 2 === 0) doc.rect(50, y - 2, 495, 30).fillColor("#f8fafc").fill();
    const num = data.history.length - i;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(statusColor[t.status] ?? "#000")
      .text(`${num}. ${t.station_name}  ·  Zi. ${t.room_number}`, 55, y, { width: 340 });
    doc.font("Helvetica").fontSize(8).fillColor("#666")
      .text(new Date(t.created_at.replace(" ", "T") + "Z").toLocaleDateString("de-DE"), 400, y, { width: 145 });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(8).fillColor("#444")
      .text(`    ${cleanLabel[t.cleaning_type] ?? t.cleaning_type}  ·  ${t.assigned_to_name ?? "–"}${t.pathogens?.length ? "  ·  ⚠️ " + t.pathogens.join(", ") : ""}`,
        55, doc.y, { width: 490 });
    doc.moveDown(0.5);
  });

  doc.moveDown();
  doc.fontSize(7).fillColor("#888").font("Helvetica")
    .text(`Erzeugt: ${new Date().toLocaleString("de-DE")}`, { align: "right" });
  doc.end();
}

export interface ZentralReportData {
  date_from: string;
  date_to: string;
  total: number;
  abgeschlossen: number;
  iso_count: number;
  by_type: Record<string, number>;
  by_art: Record<string, number>;
  days: {
    date: string;
    total: number;
    abgeschlossen: number;
    iso_count: number;
    tasks: {
      scanned_barcode: string | null;
      bed_type_name: string | null;
      is_iso: boolean;
      aufbereitungsart_name: string | null;
      pathogens: string[];
      status: string;
      assigned_to_name: string | null;
    }[];
  }[];
}

export function streamZentralReportPdf(res: Response, data: ZentralReportData) {
  const doc = new PDFDocument({ size: "A4", margin: 45 });
  const dateLabel = data.date_from === data.date_to
    ? data.date_from
    : `${data.date_from} – ${data.date_to}`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition",
    `attachment; filename="Zentral-Bericht_${data.date_from}.pdf"`);
  doc.pipe(res);

  // Titel
  doc.fontSize(18).font("Helvetica-Bold").fillColor("#000")
    .text("Bett-Zentral Tagesbericht");
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").fillColor("#555")
    .text(`Zeitraum: ${dateLabel}`)
    .text(`Gesamt: ${data.total}  ·  Abgeschlossen: ${data.abgeschlossen}  ·  ISO-Betten: ${data.iso_count}`);

  // Zusammenfassung Bett-Typen
  doc.moveDown(0.8);
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#000").text("Nach Bett-Typ");
  doc.moveDown(0.3);
  Object.entries(data.by_type)
    .sort(([, a], [, b]) => b - a)
    .forEach(([name, count], i) => {
      const y = doc.y;
      if (i % 2 === 0) doc.rect(45, y - 2, 505, 14).fillColor("#f8fafc").fill();
      doc.font("Helvetica").fontSize(9).fillColor("#000")
        .text(name, 50, y, { width: 380 });
      doc.text(String(count), 430, y, { width: 120 });
      doc.moveDown(0.45);
    });

  // Zusammenfassung Aufbereitungsarten
  doc.moveDown(0.5);
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#000").text("Nach Aufbereitungsart");
  doc.moveDown(0.3);
  Object.entries(data.by_art)
    .sort(([, a], [, b]) => b - a)
    .forEach(([name, count], i) => {
      const y = doc.y;
      if (i % 2 === 0) doc.rect(45, y - 2, 505, 14).fillColor("#f8fafc").fill();
      doc.font("Helvetica").fontSize(9).fillColor("#000")
        .text(name, 50, y, { width: 380 });
      doc.text(String(count), 430, y, { width: 120 });
      doc.moveDown(0.45);
    });

  // Tagesdetails
  const colX = [50, 145, 210, 310, 400, 475];
  const colW = [90,  60,  95,  85,  70,  70];
  const statusColor: Record<string, string> = {
    abgeschlossen: "#16a34a", laufend: "#7c3aed", offen: "#b45309",
  };

  data.days.forEach((day) => {
    doc.addPage();

    const dayDate = new Date(day.date + "T12:00:00")
      .toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });

    doc.fontSize(13).font("Helvetica-Bold").fillColor("#000")
      .text(dayDate);
    doc.fontSize(9).font("Helvetica").fillColor("#555")
      .text(`${day.total} Aufträge  ·  ${day.abgeschlossen} erledigt  ·  ${day.iso_count} ISO`);
    doc.moveDown(0.5);

    // Tabellenkopf
    const hY = doc.y;
    doc.rect(45, hY - 2, 505, 14).fillColor("#e2e8f0").fill();
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#000");
    ["Barcode", "ISO", "Bett-Typ", "Aufbereitung", "Erreger", "Status"].forEach((h, i) => {
      doc.text(h, colX[i], hY, { width: colW[i] });
    });
    doc.moveDown(0.5);

    day.tasks.forEach((t, idx) => {
      if (doc.y > 760) { doc.addPage(); }
      const y = doc.y;
      if (idx % 2 === 0) doc.rect(45, y - 2, 505, 14).fillColor("#f8fafc").fill();
      const sColor = statusColor[t.status] ?? "#000";

      doc.font("Helvetica").fontSize(8).fillColor("#666")
        .text(t.scanned_barcode ?? "–", colX[0], y, { width: colW[0] });
      doc.fillColor(t.is_iso ? "#dc2626" : "#94a3b8")
        .text(t.is_iso ? "⚠ JA" : "–", colX[1], y, { width: colW[1] });
      doc.fillColor("#000")
        .text(t.bed_type_name ?? "–", colX[2], y, { width: colW[2] });
      doc.fillColor("#334155")
        .text(t.aufbereitungsart_name ?? "–", colX[3], y, { width: colW[3] });
      doc.fillColor(t.pathogens?.length ? "#c2410c" : "#94a3b8")
        .text(t.pathogens?.length ? t.pathogens.join(", ") : "–", colX[4], y, { width: colW[4] });
      doc.fillColor(sColor)
        .text(t.status === "abgeschlossen" ? "Fertig" : t.status === "laufend" ? "Laufend" : "Offen",
          colX[5], y, { width: colW[5] });
      doc.moveDown(0.5);
    });
  });

  doc.moveDown();
  doc.fontSize(7).fillColor("#888").font("Helvetica")
    .text(`Erzeugt: ${new Date().toLocaleString("de-DE")}`, { align: "right" });
  doc.end();
}
