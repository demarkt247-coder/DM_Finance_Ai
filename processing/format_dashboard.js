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
const CARD_GREY = { red: 0.95, green: 0.96, blue: 0.97 };
const CARD_BLUE = { red: 0.93, green: 0.96, blue: 1 };
const DARK_TEXT = { red: 0.13, green: 0.16, blue: 0.2 };
const MUTED_TEXT = { red: 0.45, green: 0.48, blue: 0.52 };
const RED = { red: 0.86, green: 0.24, blue: 0.24 };
const CARD_WARN = { red: 1, green: 0.97, blue: 0.92 };
const CARD_GOOD = { red: 0.93, green: 0.99, blue: 0.96 };
const BORDER_COLOR = { red: 0.85, green: 0.87, blue: 0.89 };
const THIN_BORDER = { style: 'SOLID', width: 1, color: BORDER_COLOR };

// Single-column card: label row + value row, bordered block, one clean tile.
function card(sheetId, r0, col, label, formula, bg, currency = true) {
  const requests = [];
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r0 + 2, startColumnIndex: col, endColumnIndex: col + 1 },
      cell: { userEnteredFormat: { backgroundColor: bg, padding: { left: 14, top: 8, bottom: 8 } } },
      fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.padding',
    },
  });
  requests.push({
    updateBorders: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r0 + 2, startColumnIndex: col, endColumnIndex: col + 1 },
      top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER,
    },
  });
  requests.push({
    updateCells: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r0 + 1, startColumnIndex: col, endColumnIndex: col + 1 },
      rows: [{ values: [{ userEnteredValue: { stringValue: label.toUpperCase() } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r0 + 1, startColumnIndex: col, endColumnIndex: col + 1 },
      cell: { userEnteredFormat: { textFormat: { fontSize: 9, foregroundColor: MUTED_TEXT, bold: true }, verticalAlignment: 'BOTTOM' } },
      fields: 'userEnteredFormat.textFormat,userEnteredFormat.verticalAlignment',
    },
  });
  requests.push({
    updateCells: {
      range: { sheetId, startRowIndex: r0 + 1, endRowIndex: r0 + 2, startColumnIndex: col, endColumnIndex: col + 1 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: formula } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: r0 + 1, endRowIndex: r0 + 2, startColumnIndex: col, endColumnIndex: col + 1 },
      cell: {
        userEnteredFormat: {
          textFormat: { fontSize: 22, bold: true, foregroundColor: DARK_TEXT },
          verticalAlignment: 'TOP',
          numberFormat: currency ? { type: 'CURRENCY', pattern: '"Tk "#,##0.00' } : { type: 'NUMBER', pattern: '#,##0' },
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
      properties: { sheetId: dashId, gridProperties: { rowCount: 60, columnCount: 12, frozenRowCount: 0, hideGridlines: true } },
      fields: 'gridProperties',
    },
  });

  // Clean 5-column layout: margin | LEFT card | gap | RIGHT card | margin.
  // Helper data (period start date, chart source table) lives in hidden columns G:H.
  const colWidths = [16, 340, 40, 340, 16, 20, 140, 90];
  colWidths.forEach((width, i) => {
    requests.push({ updateDimensionProperties: { range: { sheetId: dashId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: width }, fields: 'pixelSize' } });
  });
  // Hide the helper columns (G:H, indices 6-7) entirely
  requests.push({ updateDimensionProperties: { range: { sheetId: dashId, dimension: 'COLUMNS', startIndex: 6, endIndex: 8 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } });

  // Title banner, spans B:D (indices 1-3)
  requests.push({ mergeCells: { range: { sheetId: dashId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } });
  requests.push({
    repeatCell: {
      range: { sheetId: dashId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 4 },
      cell: { userEnteredFormat: { backgroundColor: NAVY, verticalAlignment: 'MIDDLE', textFormat: { foregroundColor: WHITE, fontSize: 20, bold: true }, padding: { left: 16 } } },
      fields: 'userEnteredFormat',
    },
  });
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
      rows: [{ values: [{ userEnteredValue: { stringValue: '  De Markt Finance Dashboard' } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({ updateDimensionProperties: { range: { sheetId: dashId, dimension: 'ROWS', startIndex: 0, endIndex: 2 }, properties: { pixelSize: 40 }, fields: 'pixelSize' } });

  // Subtitle row 3 (index2): last updated (col B) + pending clarifications (col D)
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 2 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: '="Last updated: "&TEXT(NOW(),"mmm d, h:mm am/pm")' } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 2 },
      cell: { userEnteredFormat: { textFormat: { foregroundColor: MUTED_TEXT, fontSize: 10, italic: true }, verticalAlignment: 'MIDDLE' } },
      fields: 'userEnteredFormat',
    },
  });
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 3, endColumnIndex: 4 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: '=IF(COUNTIF(_Flags!E:E,"open")=0,"All clear, nothing pending","⚠ "&COUNTIF(_Flags!E:E,"open")&" pending clarifications")' } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 3, endColumnIndex: 4 },
      cell: { userEnteredFormat: { textFormat: { fontSize: 11, bold: true }, verticalAlignment: 'MIDDLE', horizontalAlignment: 'RIGHT' } },
      fields: 'userEnteredFormat',
    },
  });
  requests.push({
    addConditionalFormatRule: {
      rule: { ranges: [{ sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 3, endColumnIndex: 4 }], booleanRule: { condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: '⚠' }] }, format: { textFormat: { foregroundColor: RED } } } },
      index: 0,
    },
  });
  requests.push({ updateDimensionProperties: { range: { sheetId: dashId, dimension: 'ROWS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } });

  // Period selector row 5 (index4), left-aligned under the left column
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 2 },
      rows: [{ values: [{ userEnteredValue: { stringValue: 'View period' } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId: dashId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 2 },
      cell: { userEnteredFormat: { textFormat: { fontSize: 10, bold: true, foregroundColor: MUTED_TEXT }, verticalAlignment: 'MIDDLE' } },
      fields: 'userEnteredFormat',
    },
  });
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 3, endColumnIndex: 4 },
      rows: [{ values: [{ userEnteredValue: { stringValue: 'Daily' } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    setDataValidation: {
      range: { sheetId: dashId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 3, endColumnIndex: 4 },
      rule: { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'Daily' }, { userEnteredValue: 'Weekly' }, { userEnteredValue: 'Monthly' }] }, showCustomUi: true, strict: true },
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId: dashId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 3, endColumnIndex: 4 },
      cell: { userEnteredFormat: { backgroundColor: TEAL, textFormat: { foregroundColor: WHITE, bold: true, fontSize: 11 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } },
      fields: 'userEnteredFormat',
    },
  });
  requests.push({ updateDimensionProperties: { range: { sheetId: dashId, dimension: 'ROWS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } });

  // Helper: period start date -> hidden column G, row1 (G1)
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 6, endColumnIndex: 7 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: '=SWITCH($D$5,"Daily",TODAY(),"Weekly",TODAY()-6,"Monthly",DATE(YEAR(TODAY()),MONTH(TODAY()),1))' } }] }],
      fields: 'userEnteredValue',
    },
  });

  // Section headers row 7 (index6)
  const sectionHeader = (r, col, text) => {
    requests.push({ updateCells: { range: { sheetId: dashId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: col, endColumnIndex: col + 1 }, rows: [{ values: [{ userEnteredValue: { stringValue: text } }] }], fields: 'userEnteredValue' } });
    requests.push({ repeatCell: { range: { sheetId: dashId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: col, endColumnIndex: col + 1 }, cell: { userEnteredFormat: { textFormat: { fontSize: 12, bold: true, foregroundColor: NAVY }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat' } });
  };
  sectionHeader(6, 1, 'Cash Position (current)');
  sectionHeader(6, 3, 'Sales - selected period');
  requests.push({ updateDimensionProperties: { range: { sheetId: dashId, dimension: 'ROWS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } });

  // Cards - left column B (idx1), right column D (idx3). Gap column C (idx2) stays empty white.
  const gapRow = 3; // rows between each card block
  requests = requests.concat(card(dashId, 8, 1, 'Bank Balance (BRAC + EBL)', '=INDEX(BankCash!B:B,COUNTA(BankCash!A:A))+INDEX(BankCash!C:C,COUNTA(BankCash!A:A))', CARD_GREY));
  requests = requests.concat(card(dashId, 8, 3, 'Order Count', '=COUNTIFS(Sales!A:A,">="&$G$1,Sales!A:A,"<="&TODAY())', CARD_BLUE, false));

  requests = requests.concat(card(dashId, 8 + gapRow, 1, 'bKash + Physical Cash', '=INDEX(BankCash!D:D,COUNTA(BankCash!A:A))+INDEX(BankCash!E:E,COUNTA(BankCash!A:A))', CARD_GREY));
  requests = requests.concat(card(dashId, 8 + gapRow, 3, 'Products Sold (qty)', '=SUMIFS(Sales!C:C,Sales!A:A,">="&$G$1,Sales!A:A,"<="&TODAY())', CARD_BLUE, false));

  requests = requests.concat(card(dashId, 8 + gapRow * 2, 1, 'Total Cash Position', '=B10+B13', CARD_GOOD));
  requests = requests.concat(card(dashId, 8 + gapRow * 2, 3, 'Revenue', '=SUMIFS(Sales!D:D,Sales!A:A,">="&$G$1,Sales!A:A,"<="&TODAY())', CARD_GOOD));

  requests.push({ updateDimensionProperties: { range: { sheetId: dashId, dimension: 'ROWS', startIndex: 8, endIndex: 17 }, properties: { pixelSize: 24 }, fields: 'pixelSize' } });

  // Chart section header row 19 (index18)
  sectionHeader(18, 1, 'Top Products Sold - selected period');
  requests.push({ updateDimensionProperties: { range: { sheetId: dashId, dimension: 'ROWS', startIndex: 18, endIndex: 19 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } });

  // Chart data helper table -> hidden columns G:H, starting row 3 (index2)
  requests.push({
    updateCells: {
      range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 6, endColumnIndex: 8 },
      rows: [{ values: [{ userEnteredValue: { stringValue: 'product' } }, { userEnteredValue: { stringValue: 'qty_sold' } }] }],
      fields: 'userEnteredValue',
    },
  });
  const chartRows = [];
  for (let i = 0; i < MAX_PRODUCT_ROWS; i++) {
    const productsRow = i + 2;
    const rowIdx = 3 + i;
    chartRows.push({
      updateCells: {
        range: { sheetId: dashId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 6, endColumnIndex: 8 },
        rows: [{
          values: [
            { userEnteredValue: { formulaValue: `=IF(Products!B${productsRow}="","",Products!B${productsRow})` } },
            { userEnteredValue: { formulaValue: `=IF(Products!B${productsRow}="","",SUMIFS(Sales!C:C,Sales!B:B,Products!B${productsRow},Sales!A:A,">="&$G$1,Sales!A:A,"<="&TODAY()))` } },
          ],
        }],
        fields: 'userEnteredValue',
      },
    });
  }
  requests = requests.concat(chartRows);

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });

  // Delete any existing chart(s) before adding a fresh one, so reruns don't duplicate
  const freshMeta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets(properties(sheetId,title),charts(chartId))' });
  const dashSheet = freshMeta.data.sheets.find((s) => s.properties.title === 'Dashboard');
  const deleteChartRequests = (dashSheet.charts || []).map((c) => ({ deleteEmbeddedObject: { objectId: c.chartId } }));
  if (deleteChartRequests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: deleteChartRequests } });
  }

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
                domains: [{ domain: { sourceRange: { sources: [{ sheetId: dashId, startRowIndex: 3, endRowIndex: 3 + MAX_PRODUCT_ROWS, startColumnIndex: 6, endColumnIndex: 7 }] } } }],
                series: [{ series: { sourceRange: { sources: [{ sheetId: dashId, startRowIndex: 3, endRowIndex: 3 + MAX_PRODUCT_ROWS, startColumnIndex: 7, endColumnIndex: 8 }] } }, color: TEAL }],
              },
            },
            position: { overlayPosition: { anchorCell: { sheetId: dashId, rowIndex: 19, columnIndex: 1 }, widthPixels: 700, heightPixels: 300 } },
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

  const existingBands = (liabSheet.bandedRanges || []).map((b) => ({ deleteBanding: { bandedRangeId: b.bandedRangeId } }));
  if (existingBands.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: existingBands } });
  }

  let requests = [];
  requests.push({ unmergeCells: { range: { sheetId: liabId, startRowIndex: 0, endRowIndex: 100, startColumnIndex: 0, endColumnIndex: 26 } } });
  requests.push({ updateSheetProperties: { properties: { sheetId: liabId, gridProperties: { rowCount: 40, columnCount: 6, hideGridlines: true } }, fields: 'gridProperties' } });
  const colWidths = [16, 220, 160, 300, 16];
  colWidths.forEach((width, i) => requests.push({ updateDimensionProperties: { range: { sheetId: liabId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: width }, fields: 'pixelSize' } }));

  requests.push({ mergeCells: { range: { sheetId: liabId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } });
  requests.push({ repeatCell: { range: { sheetId: liabId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 4 }, cell: { userEnteredFormat: { backgroundColor: NAVY, verticalAlignment: 'MIDDLE', textFormat: { foregroundColor: WHITE, fontSize: 18, bold: true }, padding: { left: 16 } } }, fields: 'userEnteredFormat' } });
  requests.push({ updateCells: { range: { sheetId: liabId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 }, rows: [{ values: [{ userEnteredValue: { stringValue: '  Suppliers & Loans' } }] }], fields: 'userEnteredValue' } });
  requests.push({ updateDimensionProperties: { range: { sheetId: liabId, dimension: 'ROWS', startIndex: 0, endIndex: 2 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } });

  requests = requests.concat(card(liabId, 3, 1, 'Total Supplier Dues', '=SUM(SupplierDues!C2:C100)', CARD_WARN));
  requests = requests.concat(card(liabId, 3, 3, 'Total Loans Payable', '=SUM(Loans!C2:C100)', CARD_WARN));
  requests.push({ updateDimensionProperties: { range: { sheetId: liabId, dimension: 'ROWS', startIndex: 3, endIndex: 5 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } });

  const tableHeader = (r, c0, headers, span) => {
    requests.push({ mergeCells: { range: { sheetId: liabId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: c0, endColumnIndex: c0 + span }, mergeType: 'MERGE_ALL' } });
    headers.forEach((h, i) => {
      requests.push({
        updateCells: {
          range: { sheetId: liabId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: c0 + i, endColumnIndex: c0 + i + 1 },
          rows: [{ values: [{ userEnteredValue: { stringValue: h } }] }],
          fields: 'userEnteredValue',
        },
      });
    });
  };
  // Table headers: Supplier | Due | Notes across columns 1,2,3
  requests.push({
    updateCells: {
      range: { sheetId: liabId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 1, endColumnIndex: 4 },
      rows: [{ values: [{ userEnteredValue: { stringValue: 'Supplier' } }, { userEnteredValue: { stringValue: 'Current Due' } }, { userEnteredValue: { stringValue: 'Notes' } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId: liabId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 1, endColumnIndex: 4 },
      cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { foregroundColor: WHITE, bold: true, fontSize: 10 }, verticalAlignment: 'MIDDLE', padding: { left: 6 } } },
      fields: 'userEnteredFormat',
    },
  });
  requests.push({
    updateCells: {
      range: { sheetId: liabId, startRowIndex: 7, endRowIndex: 27, startColumnIndex: 1, endColumnIndex: 4 },
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
  requests.push({ repeatCell: { range: { sheetId: liabId, startRowIndex: 7, endRowIndex: 27, startColumnIndex: 2, endColumnIndex: 3 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"Tk "#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } });
  requests.push({ addBanding: { bandedRange: { range: { sheetId: liabId, startRowIndex: 7, endRowIndex: 27, startColumnIndex: 1, endColumnIndex: 4 }, rowProperties: { headerColor: NAVY, firstBandColor: WHITE, secondBandColor: CARD_GREY } } } });

  requests.push({
    updateCells: {
      range: { sheetId: liabId, startRowIndex: 29, endRowIndex: 30, startColumnIndex: 1, endColumnIndex: 4 },
      rows: [{ values: [{ userEnteredValue: { stringValue: 'Lender' } }, { userEnteredValue: { stringValue: 'Balance' } }, { userEnteredValue: { stringValue: 'Notes' } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId: liabId, startRowIndex: 29, endRowIndex: 30, startColumnIndex: 1, endColumnIndex: 4 },
      cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { foregroundColor: WHITE, bold: true, fontSize: 10 }, verticalAlignment: 'MIDDLE', padding: { left: 6 } } },
      fields: 'userEnteredFormat',
    },
  });
  requests.push({
    updateCells: {
      range: { sheetId: liabId, startRowIndex: 30, endRowIndex: 40, startColumnIndex: 1, endColumnIndex: 4 },
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
  requests.push({ repeatCell: { range: { sheetId: liabId, startRowIndex: 30, endRowIndex: 40, startColumnIndex: 2, endColumnIndex: 3 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"Tk "#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } });
  requests.push({ addBanding: { bandedRange: { range: { sheetId: liabId, startRowIndex: 30, endRowIndex: 40, startColumnIndex: 1, endColumnIndex: 4 }, rowProperties: { headerColor: NAVY, firstBandColor: WHITE, secondBandColor: CARD_GREY } } } });

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
