// Full dashboard system: main Dashboard (period-selectable KPIs + product chart)
// and a separate Liabilities tab (suppliers + loans, same visual system).
// Rerunnable - clears and rebuilds layout each time. Run: node format_dashboard.js
require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.MASTER_SHEET_ID;
const MAX_PRODUCT_ROWS = 30; // chart data helper table cap

function getAuth() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oAuth2Client;
}

const NAVY = { red: 0.09, green: 0.13, blue: 0.24 };
const TEAL = { red: 0.11, green: 0.55, blue: 0.5 };
const WHITE = { red: 1, green: 1, blue: 1 };
const CARD_GREY = { red: 0.93, green: 0.95, blue: 0.96 };
const CARD_BLUE = { red: 0.91, green: 0.95, blue: 0.99 };
const DARK_TEXT = { red: 0.13, green: 0.16, blue: 0.2 };
const MUTED_TEXT = { red: 0.45, green: 0.48, blue: 0.52 };
const RED = { red: 0.86, green: 0.24, blue: 0.24 };
const CARD_WARN = { red: 0.99, green: 0.96, blue: 0.9 };
const CARD_GOOD = { red: 0.92, green: 0.98, blue: 0.95 };

function card(sheetId, r0, c0, width, label, formula, bg, currency = true) {
  const c1 = c0 + width;
  const requests = [];
  requests.push({ mergeCells: { range: { sheetId, startRowIndex: r0, endRowIndex: r0 + 1, startColumnIndex: c0, endColumnIndex: c1 }, mergeType: 'MERGE_ALL' } });
  requests.push({ mergeCells: { range: { sheetId, startRowIndex: r0 + 1, endRowIndex: r0 + 2, startColumnIndex: c0, endColumnIndex: c1 }, mergeType: 'MERGE_ALL' } });
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r0 + 2, startColumnIndex: c0, endColumnIndex: c1 },
      cell: { userEnteredFormat: { backgroundColor: bg } },
      fields: 'userEnteredFormat.backgroundColor',
    },
  });
  requests.push({
    updateCells: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r0 + 1, startColumnIndex: c0, endColumnIndex: c0 + 1 },
      rows: [{ values: [{ userEnteredValue: { stringValue: '  ' + label.toUpperCase() } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r0 + 1, startColumnIndex: c0, endColumnIndex: c1 },
      cell: { userEnteredFormat: { textFormat: { fontSize: 9, foregroundColor: MUTED_TEXT, bold: true }, verticalAlignment: 'MIDDLE' } },
      fields: 'userEnteredFormat.textFormat,userEnteredFormat.verticalAlignment',
    },
  });
  requests.push({
    updateCells: {
      range: { sheetId, startRowIndex: r0 + 1, endRowIndex: r0 + 2, startColumnIndex: c0, endColumnIndex: c0 + 1 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: formula } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: r0 + 1, endRowIndex: r0 + 2, startColumnIndex: c0, endColumnIndex: c1 },
      cell: {
        userEnteredFormat: {
          textFormat: { fontSize: 20, bold: true, foregroundColor: DARK_TEXT },
          verticalAlignment: 'MIDDLE',
          numberFormat: currency ? { type: 'CURRENCY', pattern: '"Tk "#,##0.00' } : { type: 'NUMBER', pattern: '#,##0' },
          padding: { left: 8 },
        },
      },
      fields: 'userEnteredFormat.textFormat,userEnteredFormat.verticalAlignment,userEnteredFormat.numberFormat',
    },
  });
  return requests;
}

async function buildDashboard(sheets, meta) {
  const dashId = meta.data.sheets.find((s) => s.properties.title === 'Dashboard').properties.sheetId;
  await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: 'Dashboard!A1:Z100' });

  let requests = [];

  requests.push({ unmergeCells: { range: { sheetId: dashId, startRowIndex: 0, endRowIndex: 100, startColumnIndex: 0, endColumnIndex: 26 } } });
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: dashId, gridProperties: { rowCount: 60, columnCount: 20, frozenRowCount: 0, hideGridlines: true } },
      fields: 'gridProperties',
    },
  });

  const colWidths = [40, 210, 40, 190, 40, 210, 40, 190];
  colWidths.forEach((width, i) => {
    requests.push({ updateDimensionProperties: { range: { sheetId: dashId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: width }, fields: 'pixelSize' } });
  });

  // Title banner
  requests.push({ mergeCells: { range: { sheetId: dashId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } });
  requests.push({
    repeatCell: {
      range: { sheetId: dashId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 8 },
      cell: { userEnteredFormat: { backgroundColor: NAVY, verticalAlignment: 'MIDDLE', textFormat: { foregroundColor: WHITE, fontSize: 20, bold: true }, padding: { left: 16 } } },
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
  requests.push({ updateDimensionProperties: { range: { sheetId: dashId, dimension: 'ROWS', startIndex: 0, endIndex: 2 }, properties: { pixelSize: 40 }, fields: 'pixelSize' } });

  // Subtitle: last updated + pending clarifications
  requests.push({ mergeCells: { range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } });
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 1 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: '="  Last updated: "&TEXT(NOW(),"mmm d, h:mm am/pm")' } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 4 },
      cell: { userEnteredFormat: { textFormat: { foregroundColor: MUTED_TEXT, fontSize: 10, italic: true }, verticalAlignment: 'MIDDLE' } },
      fields: 'userEnteredFormat',
    },
  });
  requests.push({ mergeCells: { range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 4, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } });
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 4, endColumnIndex: 5 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: '=IF(COUNTIF(_Flags!E:E,"open")=0,"  All clear, nothing pending","  ⚠ "&COUNTIF(_Flags!E:E,"open")&" pending clarifications")' } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 4, endColumnIndex: 8 },
      cell: { userEnteredFormat: { textFormat: { fontSize: 11, bold: true }, verticalAlignment: 'MIDDLE' } },
      fields: 'userEnteredFormat',
    },
  });
  requests.push({
    addConditionalFormatRule: {
      rule: { ranges: [{ sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 4, endColumnIndex: 5 }], booleanRule: { condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: '⚠' }] }, format: { textFormat: { foregroundColor: RED } } } },
      index: 0,
    },
  });
  requests.push({ updateDimensionProperties: { range: { sheetId: dashId, dimension: 'ROWS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } });

  // Period selector row 5 (index 4)
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 1 },
      rows: [{ values: [{ userEnteredValue: { stringValue: '  View period:' } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId: dashId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 1 },
      cell: { userEnteredFormat: { textFormat: { fontSize: 10, bold: true, foregroundColor: MUTED_TEXT }, verticalAlignment: 'MIDDLE' } },
      fields: 'userEnteredFormat',
    },
  });
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 2 },
      rows: [{ values: [{ userEnteredValue: { stringValue: 'Daily' } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    setDataValidation: {
      range: { sheetId: dashId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 2 },
      rule: { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'Daily' }, { userEnteredValue: 'Weekly' }, { userEnteredValue: 'Monthly' }] }, showCustomUi: true, strict: true },
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId: dashId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 2 },
      cell: { userEnteredFormat: { backgroundColor: TEAL, textFormat: { foregroundColor: WHITE, bold: true, fontSize: 11 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } },
      fields: 'userEnteredFormat',
    },
  });
  requests.push({ updateDimensionProperties: { range: { sheetId: dashId, dimension: 'ROWS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } });

  // Helper cell: period start date, referenced by all period-based formulas (col K, hidden off to the side)
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 10, endColumnIndex: 11 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: '=SWITCH($B$5,"Daily",TODAY(),"Weekly",TODAY()-6,"Monthly",DATE(YEAR(TODAY()),MONTH(TODAY()),1))' } }] }],
      fields: 'userEnteredValue',
    },
  });

  // Section headers row 7 (index 6)
  const sectionHeader = (r, c0, c1, text) => {
    requests.push({ mergeCells: { range: { sheetId: dashId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: c0, endColumnIndex: c1 }, mergeType: 'MERGE_ALL' } });
    requests.push({ updateCells: { range: { sheetId: dashId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: c0, endColumnIndex: c0 + 1 }, rows: [{ values: [{ userEnteredValue: { stringValue: text } }] }], fields: 'userEnteredValue' } });
    requests.push({ repeatCell: { range: { sheetId: dashId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: c0, endColumnIndex: c1 }, cell: { userEnteredFormat: { textFormat: { fontSize: 12, bold: true, foregroundColor: NAVY }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat' } });
  };
  sectionHeader(6, 0, 4, 'CASH POSITION (current)');
  sectionHeader(6, 4, 8, 'SALES - selected period');

  // Left column cards: Bank Balance, bKash+Cash, Total Cash Position (current, not period-based)
  requests = requests.concat(card(dashId, 7, 0, 4, 'Bank Balance (BRAC + EBL)', '=INDEX(BankCash!B:B,COUNTA(BankCash!A:A))+INDEX(BankCash!C:C,COUNTA(BankCash!A:A))', CARD_GREY));
  requests = requests.concat(card(dashId, 10, 0, 4, 'bKash + Physical Cash', '=INDEX(BankCash!D:D,COUNTA(BankCash!A:A))+INDEX(BankCash!E:E,COUNTA(BankCash!A:A))', CARD_GREY));
  requests = requests.concat(card(dashId, 13, 0, 4, 'Total Cash Position', '=A9+A12', CARD_GOOD));

  // Right column cards: Order Count, Products Sold (qty), Revenue - all period-based via Sales tab
  requests = requests.concat(card(dashId, 7, 4, 4, 'Order Count', '=COUNTIFS(Sales!A:A,">="&$K$5,Sales!A:A,"<="&TODAY())', CARD_BLUE, false));
  requests = requests.concat(card(dashId, 10, 4, 4, 'Products Sold (qty)', '=SUMIFS(Sales!C:C,Sales!A:A,">="&$K$5,Sales!A:A,"<="&TODAY())', CARD_BLUE, false));
  requests = requests.concat(card(dashId, 13, 4, 4, 'Revenue', '=SUMIFS(Sales!D:D,Sales!A:A,">="&$K$5,Sales!A:A,"<="&TODAY())', CARD_GOOD));

  requests.push({ updateDimensionProperties: { range: { sheetId: dashId, dimension: 'ROWS', startIndex: 6, endIndex: 16 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } });

  // Chart section header row 17 (index 16)
  sectionHeader(17, 0, 8, 'TOP PRODUCTS SOLD - selected period');

  // Chart data helper table, columns K:L starting row 5 (index 4), header at row 4
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 10, endColumnIndex: 12 },
      rows: [{ values: [{ userEnteredValue: { stringValue: 'product' } }, { userEnteredValue: { stringValue: 'qty_sold' } }] }],
      fields: 'userEnteredValue',
    },
  });
  const chartRows = [];
  for (let i = 0; i < MAX_PRODUCT_ROWS; i++) {
    const productsRow = i + 2; // Products!B2 onward
    const rowIdx = 4 + i; // starting row 5 (index4)
    chartRows.push({
      updateCells: {
        range: { sheetId: dashId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 10, endColumnIndex: 12 },
        rows: [{
          values: [
            { userEnteredValue: { formulaValue: `=IF(Products!B${productsRow}="","",Products!B${productsRow})` } },
            { userEnteredValue: { formulaValue: `=IF(Products!B${productsRow}="","",SUMIFS(Sales!C:C,Sales!B:B,Products!B${productsRow},Sales!A:A,">="&$K$5,Sales!A:A,"<="&TODAY()))` } },
          ],
        }],
        fields: 'userEnteredValue',
      },
    });
  }
  requests = requests.concat(chartRows);

  // Hide helper columns K:L visually by narrowing (keep functional, just unobtrusive)
  requests.push({ updateDimensionProperties: { range: { sheetId: dashId, dimension: 'COLUMNS', startIndex: 10, endIndex: 12 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } });
  requests.push({
    repeatCell: {
      range: { sheetId: dashId, startRowIndex: 3, endRowIndex: 4 + MAX_PRODUCT_ROWS, startColumnIndex: 10, endColumnIndex: 12 },
      cell: { userEnteredFormat: { textFormat: { fontSize: 8, foregroundColor: MUTED_TEXT } } },
      fields: 'userEnteredFormat.textFormat',
    },
  });

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });

  // Delete any existing chart(s) on this sheet before adding a fresh one, so reruns don't duplicate
  const freshMeta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets(properties(sheetId,title),charts(chartId))' });
  const dashSheet = freshMeta.data.sheets.find((s) => s.properties.title === 'Dashboard');
  const deleteChartRequests = (dashSheet.charts || []).map((c) => ({ deleteEmbeddedObject: { objectId: c.chartId } }));
  if (deleteChartRequests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: deleteChartRequests } });
  }

  // Chart itself, added separately since it needs the sheet to exist with data ranges valid
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        addChart: {
          chart: {
            spec: {
              title: 'Top Products Sold',
              basicChart: {
                chartType: 'BAR',
                legendPosition: 'NO_LEGEND',
                axis: [{ position: 'BOTTOM_AXIS', title: 'Qty sold' }],
                domains: [{ domain: { sourceRange: { sources: [{ sheetId: dashId, startRowIndex: 4, endRowIndex: 4 + MAX_PRODUCT_ROWS, startColumnIndex: 10, endColumnIndex: 11 }] } } }],
                series: [{ series: { sourceRange: { sources: [{ sheetId: dashId, startRowIndex: 4, endRowIndex: 4 + MAX_PRODUCT_ROWS, startColumnIndex: 11, endColumnIndex: 12 }] } }, color: TEAL }],
              },
            },
            position: { overlayPosition: { anchorCell: { sheetId: dashId, rowIndex: 17, columnIndex: 0 }, widthPixels: 760, heightPixels: 320 } },
          },
        },
      }],
    },
  });

  console.log('Dashboard rebuilt.');
}

async function buildLiabilities(sheets, meta) {
  const liabSheet = meta.data.sheets.find((s) => s.properties.title === 'Liabilities');
  const liabId = liabSheet.properties.sheetId;
  await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: 'Liabilities!A1:Z100' });

  // Remove existing banded ranges from a prior run before re-adding (Sheets rejects overlapping banding)
  const existingBands = (liabSheet.bandedRanges || []).map((b) => ({ deleteBanding: { bandedRangeId: b.bandedRangeId } }));
  if (existingBands.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: existingBands } });
  }

  let requests = [];
  requests.push({ unmergeCells: { range: { sheetId: liabId, startRowIndex: 0, endRowIndex: 100, startColumnIndex: 0, endColumnIndex: 26 } } });
  requests.push({ updateSheetProperties: { properties: { sheetId: liabId, gridProperties: { rowCount: 40, columnCount: 8, hideGridlines: true } }, fields: 'gridProperties' } });
  const colWidths = [40, 220, 160, 300];
  colWidths.forEach((width, i) => requests.push({ updateDimensionProperties: { range: { sheetId: liabId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: width }, fields: 'pixelSize' } }));

  requests.push({ mergeCells: { range: { sheetId: liabId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } });
  requests.push({ repeatCell: { range: { sheetId: liabId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 4 }, cell: { userEnteredFormat: { backgroundColor: NAVY, verticalAlignment: 'MIDDLE', textFormat: { foregroundColor: WHITE, fontSize: 18, bold: true }, padding: { left: 16 } } }, fields: 'userEnteredFormat' } });
  requests.push({ updateCells: { range: { sheetId: liabId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 }, rows: [{ values: [{ userEnteredValue: { stringValue: '  Suppliers & Loans' } }] }], fields: 'userEnteredValue' } });
  requests.push({ updateDimensionProperties: { range: { sheetId: liabId, dimension: 'ROWS', startIndex: 0, endIndex: 2 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } });

  // Totals cards row 4-5 (index 3)
  requests = requests.concat(card(liabId, 3, 0, 2, 'Total Supplier Dues', '=SUM(SupplierDues!C2:C100)', CARD_WARN));
  requests = requests.concat(card(liabId, 3, 2, 2, 'Total Loans Payable', '=SUM(Loans!C2:C100)', CARD_WARN));
  requests.push({ updateDimensionProperties: { range: { sheetId: liabId, dimension: 'ROWS', startIndex: 3, endIndex: 5 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } });

  // Supplier table header row 7 (index 6)
  const tableHeader = (r, c0, headers) => {
    headers.forEach((h, i) => {
      requests.push({
        updateCells: {
          range: { sheetId: liabId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: c0 + i, endColumnIndex: c0 + i + 1 },
          rows: [{ values: [{ userEnteredValue: { stringValue: h } }] }],
          fields: 'userEnteredValue',
        },
      });
    });
    requests.push({
      repeatCell: {
        range: { sheetId: liabId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: c0, endColumnIndex: c0 + headers.length },
        cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { foregroundColor: WHITE, bold: true, fontSize: 10 }, verticalAlignment: 'MIDDLE', padding: { left: 6 } } },
        fields: 'userEnteredFormat',
      },
    });
  };
  tableHeader(6, 0, ['Supplier', 'Current Due', 'Notes']);
  requests.push({
    updateCells: {
      range: { sheetId: liabId, startRowIndex: 7, endRowIndex: 27, startColumnIndex: 0, endColumnIndex: 3 },
      rows: Array.from({ length: 20 }, (_, i) => ({
        values: [
          { userEnteredValue: { formulaValue: `=IF(SupplierDues!A${i + 2}="","",SupplierDues!A${i + 2})` } },
          { userEnteredValue: { formulaValue: `=IF(SupplierDues!A${i + 2}="","",SupplierDues!C${i + 2})` } },
          { userEnteredValue: { formulaValue: `=IF(SupplierDues!A${i + 2}="","",SupplierDues!D${i + 2})` } },
        ],
      })),
      fields: 'userEnteredValue',
    },
  });
  requests.push({ repeatCell: { range: { sheetId: liabId, startRowIndex: 7, endRowIndex: 27, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"Tk "#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } });
  requests.push({ addBanding: { bandedRange: { range: { sheetId: liabId, startRowIndex: 7, endRowIndex: 27, startColumnIndex: 0, endColumnIndex: 3 }, rowProperties: { headerColor: NAVY, firstBandColor: WHITE, secondBandColor: CARD_GREY } } } });

  // Loans table
  tableHeader(29, 0, ['Lender', 'Balance', 'Notes']);
  requests.push({
    updateCells: {
      range: { sheetId: liabId, startRowIndex: 30, endRowIndex: 40, startColumnIndex: 0, endColumnIndex: 3 },
      rows: Array.from({ length: 10 }, (_, i) => ({
        values: [
          { userEnteredValue: { formulaValue: `=IF(Loans!A${i + 2}="","",Loans!A${i + 2})` } },
          { userEnteredValue: { formulaValue: `=IF(Loans!A${i + 2}="","",Loans!C${i + 2})` } },
          { userEnteredValue: { formulaValue: `=IF(Loans!A${i + 2}="","",Loans!E${i + 2})` } },
        ],
      })),
      fields: 'userEnteredValue',
    },
  });
  requests.push({ repeatCell: { range: { sheetId: liabId, startRowIndex: 30, endRowIndex: 40, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"Tk "#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } });
  requests.push({ addBanding: { bandedRange: { range: { sheetId: liabId, startRowIndex: 30, endRowIndex: 40, startColumnIndex: 0, endColumnIndex: 3 }, rowProperties: { headerColor: NAVY, firstBandColor: WHITE, secondBandColor: CARD_GREY } } } });

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });
  console.log('Liabilities tab rebuilt.');
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  await buildLiabilities(sheets, meta);
  await buildDashboard(sheets, meta);
}

main().catch((e) => { console.error(e); process.exit(1); });
