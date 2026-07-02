const { getSheets, uploadToDrive } = require('./drive');

const TAB = '_ProcessingLog';

// Business date = the date this entry should count toward. Telegram messages sent
// late at night or the next morning still need an explicit business date rather than
// trusting message timestamp - for now defaults to "today in Asia/Dhaka" and gets
// corrected by Claude Code during batch processing if it looks like a stale reply.
function todayBusinessDate() {
  const now = new Date();
  const dhaka = new Date(now.toLocaleString('en-US', { timeZone: process.env.TIMEZONE || 'Asia/Dhaka' }));
  return dhaka.toISOString().slice(0, 10);
}

// Appends one row to the manifest for every inbound message (text or photo).
// This is the ONLY write the bot does to Sheets - it never interprets content,
// classification/reconciliation happens later when Claude Code batch-processes.
async function appendManifestRow({ telegramMessageId, replyToMessageId, fileId, fileUniqueId, driveFileId, type, rawText }) {
  const sheets = getSheets();
  const row = [
    new Date().toISOString(),           // A: logged_at
    telegramMessageId || '',            // B: telegram_message_id
    replyToMessageId || '',             // C: reply_to_message_id (set if this is a correction)
    fileUniqueId || '',                 // D: telegram_file_unique_id (dedup key for photos)
    driveFileId || '',                  // E: drive_file_id
    type,                               // F: type (text | photo)
    todayBusinessDate(),                // G: business_date (Claude may correct this)
    'received',                         // H: status (received -> picked_up -> in_progress -> committed)
    rawText || '',                      // I: raw_text (empty for photos)
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.MANIFEST_SHEET_ID,
    range: `${TAB}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}

// Reads existing fileUniqueIds already logged today to avoid re-uploading/re-logging
// the same photo twice (Telegram can redeliver on retry).
// In-process guard against the same message being handled twice within one
// bot lifetime (Telegram can redeliver on network hiccups faster than a Sheets
// round-trip completes). Does not protect across process restarts - the Sheets
// check below is the durable dedup, this just closes the tight race window.
const recentlySeen = new Set();

async function isDuplicateFileUniqueId(fileUniqueId) {
  if (!fileUniqueId) return false;
  if (recentlySeen.has(fileUniqueId)) return true;
  recentlySeen.add(fileUniqueId);
  setTimeout(() => recentlySeen.delete(fileUniqueId), 5 * 60 * 1000);

  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.MANIFEST_SHEET_ID,
    range: `${TAB}!D:D`,
  });
  const col = res.data.values || [];
  return col.some((r) => r[0] === fileUniqueId);
}

// Counts rows still stuck below 'committed' older than N days - used by the
// /health-check-backlog endpoint that Google Apps Script pings daily.
async function countStaleBacklog(days) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.MANIFEST_SHEET_ID,
    range: `${TAB}!A:H`,
  });
  const rows = (res.data.values || []).slice(1); // skip header
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return rows.filter((r) => {
    const loggedAt = new Date(r[0]).getTime();
    const status = r[7];
    return status !== 'committed' && loggedAt < cutoff;
  }).length;
}

module.exports = { appendManifestRow, isDuplicateFileUniqueId, countStaleBacklog, todayBusinessDate };

