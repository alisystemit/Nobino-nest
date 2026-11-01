/**
 * خروجی Excel/SpreadsheetML ساده و بدون وابستگی (فایل xls با ساختار XML).
 * این فرمت توسط Excel و LibreOffice باز می‌شود.
 */

function esc(value: unknown): string {
  const s = value == null ? "" : String(value);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type Sheet = { name: string; columns: string[]; rows: (string | number | null)[][] };

export function buildExcel(sheets: Sheet[]): string {
  const body = sheets
    .map((sheet) => {
      const rows = [
        `<Row>${sheet.columns.map((c) => `<Cell><Data ss:Type="String">${esc(c)}</Data></Cell>`).join("")}</Row>`,
        ...sheet.rows.map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="${typeof cell === "number" ? "Number" : "String"}">${esc(cell)}</Data></Cell>`).join("")}</Row>`),
      ].join("");
      return `<Worksheet ss:Name="${esc(sheet.name)}"><Table>${rows}</Table></Worksheet>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${body}
</Workbook>`;
}

export function excelResponse(sheets: Sheet[], filename: string): Response {
  const xml = buildExcel(sheets);
  return new Response("\uFEFF" + xml, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}