// One-time setup script. Run manually once: `node init_sheets.js`
// Creates every tab the system needs inside the existing blank "DM Finance Dashboard"
// spreadsheet, writes headers + starting formulas, and seeds July 1 2026 opening
// balances confirmed with the founder (see conversation record for reconciliation).
//
// Uses the same OAuth refresh-token auth as the bot (see ../bot/lib/drive.js) so it
// writes as the founder's own account, not a quota-less service account.
require('dotenv').config({ path: '../bot/.env' });
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.MASTER_SHEET_ID; // the blank sheet created for the dashboard

function getAuth() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oAuth2Client;
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });

  // 1. Create all tabs (skip _ProcessingLog if the bot's first run already made it)
  const tabNames = [
    '_ProcessingLog',
    '_Flags',
    'Dashboard',
    'BankCash',
    'SupplierDues',
    'Loans',
    'Products',
    'SKUAlias',
  ];

  const existing = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existingTitles = existing.data.sheets.map((s) => s.properties.title);

  const addSheetRequests = tabNames
    .filter((t) => !existingTitles.includes(t))
    .map((title) => ({ addSheet: { properties: { title } } }));

  if (addSheetRequests.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: addSheetRequests },
    });
  }

  // 2. _ProcessingLog headers - the manifest, source of truth for everything else
  await writeRange(sheets, '_ProcessingLog!A1:I1', [[
    'logged_at', 'telegram_message_id', 'reply_to_message_id', 'telegram_file_unique_id',
    'drive_file_id', 'type', 'business_date', 'status', 'raw_text',
  ]]);

  // 3. _Flags - ambiguous items sent to Telegram, resolved async
  await writeRange(sheets, '_Flags!A1:F1', [[
    'raised_at', 'manifest_row_ref', 'question', 'telegram_message_id', 'status', 'resolved_answer',
  ]]);

  // 4. BankCash - opening balances confirmed July 1 2026, one row per day going forward.
  // Claude Code appends a new row each processed day; never edits prior rows (audit trail).
  await writeRange(sheets, 'BankCash!A1:F2', [
    ['date', 'brac_balance', 'ebl_balance', 'bkash_balance', 'physical_cash', 'notes'],
    ['2026-07-01', 227.37, 3.55, 20000.62, 0, 'Opening balance = June 30 close, per founder confirmation'],
  ]);

  // 5. SupplierDues - opening dues confirmed with founder
  await writeRange(sheets, 'SupplierDues!A1:D5', [
    ['supplier', 'opening_due_2026_07_01', 'current_due', 'notes'],
    ['Akhi Telecom', 105980, 105980, 'Reconciled from memos, high confidence'],
    ['Gadget World', 11930, 11930, 'Reconciled within Tk100 of stated closing due'],
    ['BM Telecom', 0, 0, 'Added 2026-07-01, paid in full same day'],
  ]);
  await writeRange(sheets, 'SupplierDues!A6:D6', [
    ['Mollah Jmary', 0, 0, 'Added 2026-07-01, paid in full same day (bank transfer)'],
  ]);

  // 6. Loans - business loans payable, confirmed business (not personal)
  await writeRange(sheets, 'Loans!A1:E3', [
    ['lender', 'opening_balance_2026_07_01', 'current_balance', 'interest', 'notes'],
    ['Mahabub', 122000, 122000, 'none - interest-free', 'Confirmed business loan by founder'],
    ['Keya Apu', 20000, 20000, 'none - interest-free', 'Confirmed business loan by founder'],
  ]);

  // 7. Products - empty shell, founder + bot fill in over time
  await writeRange(sheets, 'Products!A1:F1', [[
    'sku', 'product_name', 'buying_price_blended', 'stock_qty', 'latest_selling_price', 'notes',
  ]]);

  // 8. SKUAlias - fuzzy-match support table
  await writeRange(sheets, 'SKUAlias!A1:C1', [['raw_alias', 'canonical_sku', 'canonical_name']]);

  // 9. Dashboard - pending-clarification banner + placeholders; Claude Code rebuilds
  // this tab in full from the manifest/ledger tabs on every batch run.
  await writeRange(sheets, 'Dashboard!A1:B6', [
    ['DE MARKT FINANCE DASHBOARD', ''],
    ['Last updated', 'not yet run'],
    ['Pending clarifications', '=COUNTIF(_Flags!E:E,"open")'],
    ['', ''],
    ['Bank total (BRAC+EBL)', '=INDEX(BankCash!B:B,MATCH(MAX(BankCash!A:A),BankCash!A:A,0))+INDEX(BankCash!C:C,MATCH(MAX(BankCash!A:A),BankCash!A:A,0))'],
    ['bKash + Cash', '=INDEX(BankCash!D:D,MATCH(MAX(BankCash!A:A),BankCash!A:A,0))+INDEX(BankCash!E:E,MATCH(MAX(BankCash!A:A),BankCash!A:A,0))'],
  ]);

  console.log('Sheets initialized. Opening balances seeded for 2026-07-01.');
}

async function writeRange(sheets, range, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
