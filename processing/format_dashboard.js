// One-time (rerunnable) visual redesign of the Dashboard tab: KPI cards, colors,
// currency formatting, conditional highlighting. Run: node format_dashboard.js
require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.MASTER_SHEET_ID;

function getAuth() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oAuth2Client;
}

// Brand palette - dark navy header, teal accent, soft neutral backgrounds
const NAVY = { red: 0.09, green: 0.13, blue: 0.24 };
const TEAL = { red: 0.11, green: 0.55, blue: 0.5 };
const WHITE = { red: 1, green: 1, blue: 1 };
const LIGHT_GREY = { red: 0.96, green: 0.97, blue: 0.98 };
const CARD_GREY = { red: 0.93, green: 0.95, blue: 0.96 };
const DARK_TEXT = { red: 0.13, green: 0.16, blue: 0.2 };
const MUTED_TEXT = { red: 0.45, green: 0.48, blue: 0.52 };
const RED = { red: 0.86, green: 0.24, blue: 0.24 };
const GREEN = { red: 0.06, green: 0.6, blue: 0.4 };

async function main() {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetId = (title) => meta.data.sheets.find((s) => s.properties.title === title).properties.sheetId;
  const dashId = sheetId('Dashboard');

  // Clear all old content first so nothing stray leaks through the new layout
  await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: 'Dashboard!A1:Z100' });

  const requests = [];

  // --- Clear and resize the grid ---
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: dashId, gridProperties: { rowCount: 40, columnCount: 12, frozenRowCount: 0 } },
      fields: 'gridProperties',
    },
  });

  // Column widths: A-B narrow labels, wider KPI columns
  const colWidths = [40, 220, 40, 200, 40, 200, 40, 200, 40, 200];
  colWidths.forEach((width, i) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: dashId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: width },
        fields: 'pixelSize',
      },
    });
  });

  // --- Title banner row 1-2, full width, navy background ---
  requests.push({
    mergeCells: { range: { sheetId: dashId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 10 }, mergeType: 'MERGE_ALL' },
  });
  requests.push({
    repeatCell: {
      range: { sheetId: dashId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 10 },
      cell: {
        userEnteredFormat: {
          backgroundColor: NAVY,
          horizontalAlignment: 'LEFT',
          verticalAlignment: 'MIDDLE',
          textFormat: { foregroundColor: WHITE, fontSize: 20, bold: true, fontFamily: 'Poppins' },
          padding: { left: 16 },
        },
      },
      fields: 'userEnteredFormat',
    },
  });
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
      rows: [{ values: [{ userEnteredValue: { stringValue: '  De Markt Finance Dashboard' } }] }],
      fields: 'userEnteredValue',
    },
  });

  // Row height for banner
  requests.push({
    updateDimensionProperties: {
      range: { sheetId: dashId, dimension: 'ROWS', startIndex: 0, endIndex: 2 },
      properties: { pixelSize: 40 },
      fields: 'pixelSize',
    },
  });

  // --- Subtitle row 3: last updated + pending clarifications banner ---
  requests.push({
    mergeCells: { range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 5 }, mergeType: 'MERGE_ALL' },
  });
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 1 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: '="  Last updated: "&TEXT(NOW(),"mmm d, h:mm am/pm")' } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 5 },
      cell: { userEnteredFormat: { textFormat: { foregroundColor: MUTED_TEXT, fontSize: 10, italic: true }, verticalAlignment: 'MIDDLE' } },
      fields: 'userEnteredFormat',
    },
  });

  requests.push({
    mergeCells: { range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 5, endColumnIndex: 10 }, mergeType: 'MERGE_ALL' },
  });
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 5, endColumnIndex: 6 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: '="  ⚠ "&COUNTIF(_Flags!E:E,"open")&" pending clarifications"' } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 5, endColumnIndex: 10 },
      cell: { userEnteredFormat: { textFormat: { fontSize: 11, bold: true }, verticalAlignment: 'MIDDLE', horizontalAlignment: 'LEFT' } },
      fields: 'userEnteredFormat',
    },
  });
  // Conditional format: red if >0 pending, green if 0
  requests.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 5, endColumnIndex: 6 }],
        booleanRule: {
          condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: '⚠' }] },
          format: { textFormat: { foregroundColor: RED } },
        },
      },
      index: 0,
    },
  });

  requests.push({
    updateDimensionProperties: {
      range: { sheetId: dashId, dimension: 'ROWS', startIndex: 2, endIndex: 3 },
      properties: { pixelSize: 30 },
      fields: 'pixelSize',
    },
  });

  // --- KPI cards, row 5-9, 2 columns x 3 rows of cards ---
  // Each card: label row (small muted text) + value row (large bold text), grey background
  const cards = [
    { row: 4, col: 1, label: 'Bank Balance (BRAC + EBL)', formula: '=INDEX(BankCash!B:B,MATCH(MAX(BankCash!A:A),BankCash!A:A,0))+INDEX(BankCash!C:C,MATCH(MAX(BankCash!A:A),BankCash!A:A,0))', color: 'default' },
    { row: 4, col: 5, label: 'bKash + Physical Cash', formula: '=INDEX(BankCash!D:D,MATCH(MAX(BankCash!A:A),BankCash!A:A,0))+INDEX(BankCash!E:E,MATCH(MAX(BankCash!A:A),BankCash!A:A,0))', color: 'default' },
    { row: 7, col: 1, label: 'Supplier Dues Outstanding', formula: '=SUM(SupplierDues!C2:C100)', color: 'warn' },
    { row: 7, col: 5, label: 'Business Loans Payable', formula: '=SUM(Loans!C2:C100)', color: 'warn' },
    { row: 10, col: 1, label: 'Total Cash Position', formula: '=A6+E6', color: 'good' },
    { row: 10, col: 5, label: 'Total Liabilities', formula: '=A9+E9', color: 'warn' },
  ];

  for (const card of cards) {
    const r0 = card.row, r1 = card.row + 2, c0 = card.col - 1, c1 = card.col + 2;
    const bg = card.color === 'warn' ? { red: 0.99, green: 0.96, blue: 0.9 } : card.color === 'good' ? { red: 0.92, green: 0.98, blue: 0.95 } : CARD_GREY;
    requests.push({ mergeCells: { range: { sheetId: dashId, startRowIndex: r0, endRowIndex: r0 + 1, startColumnIndex: c0, endColumnIndex: c1 }, mergeType: 'MERGE_ALL' } });
    requests.push({ mergeCells: { range: { sheetId: dashId, startRowIndex: r0 + 1, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }, mergeType: 'MERGE_ALL' } });
    requests.push({
      repeatCell: {
        range: { sheetId: dashId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
        cell: { userEnteredFormat: { backgroundColor: bg } },
        fields: 'userEnteredFormat.backgroundColor',
      },
    });
    requests.push({
      updateCells: {
        range: { sheetId: dashId, startRowIndex: r0, endRowIndex: r0 + 1, startColumnIndex: c0, endColumnIndex: c0 + 1 },
        rows: [{ values: [{ userEnteredValue: { stringValue: '  ' + card.label.toUpperCase() } }] }],
        fields: 'userEnteredValue',
      },
    });
    requests.push({
      repeatCell: {
        range: { sheetId: dashId, startRowIndex: r0, endRowIndex: r0 + 1, startColumnIndex: c0, endColumnIndex: c1 },
        cell: { userEnteredFormat: { textFormat: { fontSize: 9, foregroundColor: MUTED_TEXT, bold: true }, verticalAlignment: 'MIDDLE' } },
        fields: 'userEnteredFormat.textFormat,userEnteredFormat.verticalAlignment',
      },
    });
    requests.push({
      updateCells: {
        range: { sheetId: dashId, startRowIndex: r0 + 1, endRowIndex: r0 + 2, startColumnIndex: c0, endColumnIndex: c0 + 1 },
        rows: [{ values: [{ userEnteredValue: { formulaValue: card.formula } }] }],
        fields: 'userEnteredValue',
      },
    });
    requests.push({
      repeatCell: {
        range: { sheetId: dashId, startRowIndex: r0 + 1, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
        cell: {
          userEnteredFormat: {
            textFormat: { fontSize: 22, bold: true, foregroundColor: DARK_TEXT },
            verticalAlignment: 'MIDDLE',
            numberFormat: { type: 'CURRENCY', pattern: '"Tk "#,##0.00' },
            padding: { left: 8 },
          },
        },
        fields: 'userEnteredFormat.textFormat,userEnteredFormat.verticalAlignment,userEnteredFormat.numberFormat',
      },
    });
  }

  requests.push({
    updateDimensionProperties: {
      range: { sheetId: dashId, dimension: 'ROWS', startIndex: 4, endIndex: 13 },
      properties: { pixelSize: 28 },
      fields: 'pixelSize',
    },
  });

  // Whole-sheet default background + font
  requests.push({
    repeatCell: {
      range: { sheetId: dashId, startRowIndex: 13, endRowIndex: 40, startColumnIndex: 0, endColumnIndex: 12 },
      cell: { userEnteredFormat: { backgroundColor: WHITE } },
      fields: 'userEnteredFormat.backgroundColor',
    },
  });
  requests.push({
    updateSheetProperties: { properties: { sheetId: dashId, gridProperties: { hideGridlines: true } }, fields: 'gridProperties.hideGridlines' },
  });

  // --- Tab colors for the rest of the workbook, tidy look ---
  const tabColors = {
    Dashboard: NAVY,
    BankCash: TEAL,
    SupplierDues: { red: 0.85, green: 0.55, blue: 0.13 },
    Loans: { red: 0.7, green: 0.25, blue: 0.25 },
    Products: { red: 0.2, green: 0.45, blue: 0.75 },
    SKUAlias: { red: 0.5, green: 0.5, blue: 0.5 },
    _ProcessingLog: { red: 0.6, green: 0.6, blue: 0.6 },
    _Flags: { red: 0.9, green: 0.3, blue: 0.3 },
  };
  for (const [title, color] of Object.entries(tabColors)) {
    const id = meta.data.sheets.find((s) => s.properties.title === title);
    if (!id) continue;
    requests.push({
      updateSheetProperties: { properties: { sheetId: id.properties.sheetId, tabColor: color }, fields: 'tabColor' },
    });
  }

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });
  console.log('Dashboard redesigned.');
}

main().catch((e) => { console.error(e); process.exit(1); });
