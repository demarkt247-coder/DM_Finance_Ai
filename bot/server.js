require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const axios = require('axios');

const { uploadToDrive } = require('./lib/drive');
const { appendManifestRow, isDuplicateFileUniqueId, countStaleBacklog, todayBusinessDate } = require('./lib/manifest');
const { NIGHTLY_QUESTIONS } = require('./lib/questions');
const { classifyForAck } = require('./lib/classify');

const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
bot.on('polling_error', (err) => console.error('polling_error', err));

const app = express();
app.use(express.json());

// --- Health check, pinged daily by an external free scheduler (Google Apps Script
// or UptimeRobot) to detect a backlog nobody has processed in days. Render itself
// has no reliable free cron, so alerting is intentionally external. ---
app.get('/health-check-backlog', async (req, res) => {
  try {
    const staleCount = await countStaleBacklog(3);
    if (staleCount > 0) {
      await bot.sendMessage(
        CHAT_ID,
        `Backlog alert: ${staleCount} entries unprocessed for 3+ days. Open Claude Code on your PC to catch up.`
      );
    }
    res.json({ ok: true, staleCount });
  } catch (err) {
    console.error('health-check-backlog error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// --- Cheap poll target for the local 15-min PC-side checker. Just counts
// not-yet-committed manifest rows regardless of age - no LLM involved, so this
// can be polled often without burning Claude Code usage on empty checks. ---
app.get('/pending-count', async (req, res) => {
  try {
    const count = await countStaleBacklog(0);
    res.json({ ok: true, count });
  } catch (err) {
    console.error('pending-count error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.get('/', (req, res) => res.send('DM Finance bot is alive'));

// --- Nightly question push ---
// IMPORTANT: Render's free tier sleeps the whole process after ~15 min with no
// incoming HTTP traffic. node-cron only fires if the process happens to be awake
// at that exact tick - a missed fire is NOT retried later, it's just gone. This
// bit us once (8pm question silently never sent). Internal cron.schedule below is
// kept as a belt-and-suspenders backup for whenever the service happens to already
// be awake, but the real guarantee is an EXTERNAL trigger (Google Apps Script, same
// free mechanism as the backlog alert) hitting /trigger-nightly-question daily at
// 8pm Dhaka - the external HTTP request itself wakes the service (accepting the
// ~30-60s cold-start delay), so the send no longer depends on the process already
// being awake by chance.
let lastNightlySendDate = null; // in-memory guard against double-sends if both paths fire

async function sendNightlyQuestionIfNotAlreadySentToday() {
  const today = todayBusinessDate();
  if (lastNightlySendDate === today) return { sent: false, reason: 'already sent today' };
  await bot.sendMessage(CHAT_ID, NIGHTLY_QUESTIONS);
  lastNightlySendDate = today;
  return { sent: true };
}

const hour = process.env.QUESTION_HOUR || '20';
const minute = process.env.QUESTION_MINUTE || '0';
cron.schedule(`${minute} ${hour} * * *`, () => {
  sendNightlyQuestionIfNotAlreadySentToday().catch((e) => console.error('nightly send failed', e));
}, { timezone: process.env.TIMEZONE || 'Asia/Dhaka' });

app.get('/trigger-nightly-question', async (req, res) => {
  try {
    const result = await sendNightlyQuestionIfNotAlreadySentToday();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('trigger-nightly-question error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// --- Inbound text messages (answers + corrections) ---
bot.on('message', async (msg) => {
  try {
    if (String(msg.chat.id) !== String(CHAT_ID)) return; // ignore anyone else
    if (msg.photo) return; // handled in the photo handler below

    const isCorrection = !!msg.reply_to_message;
    if (msg.text) {
      await appendManifestRow({
        telegramMessageId: msg.message_id,
        replyToMessageId: isCorrection ? msg.reply_to_message.message_id : null,
        type: 'text',
        rawText: msg.text,
      });

      let ackText;
      if (isCorrection) {
        const snippet = msg.reply_to_message.text ? msg.reply_to_message.text.slice(0, 40) : '';
        ackText = `Correction noted - re: "${snippet}${snippet.length === 40 ? '...' : ''}" - will update.`;
      } else {
        const isQuestion = /\?$/.test(msg.text.trim()) || /^(why|what|when|where|how|is|did|do|can)\b/i.test(msg.text.trim());
        ackText = await classifyForAck({ text: msg.text, businessDate: todayBusinessDate(), isQuestion });
      }
      await bot.sendMessage(CHAT_ID, ackText, { reply_to_message_id: msg.message_id });
    }
  } catch (err) {
    console.error('message handler error', err);
  }
});

// --- Inbound photos (memos, ad spend screenshots) ---
bot.on('photo', async (msg) => {
  try {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;

    const largest = msg.photo[msg.photo.length - 1];
    const fileUniqueId = largest.file_unique_id;

    if (await isDuplicateFileUniqueId(fileUniqueId)) {
      await bot.sendMessage(CHAT_ID, 'Already logged - skipped.', {
        reply_to_message_id: msg.message_id,
      });
      return;
    }

    const fileLink = await bot.getFileLink(largest.file_id);
    const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    const businessDatePrefix = todayBusinessDate().replace(/-/g, '');
    const filename = `${businessDatePrefix}_${msg.message_id}_${fileUniqueId}.jpg`;

    const uploaded = await uploadToDrive({ buffer, filename, mimeType: 'image/jpeg' });

    const isCorrection = !!msg.reply_to_message;
    await appendManifestRow({
      telegramMessageId: msg.message_id,
      replyToMessageId: isCorrection ? msg.reply_to_message.message_id : null,
      fileUniqueId,
      driveFileId: uploaded.id,
      type: 'photo',
      rawText: msg.caption || '',
    });

    await bot.sendMessage(CHAT_ID, 'Photo received - queued for review.', { reply_to_message_id: msg.message_id });
  } catch (err) {
    console.error('photo handler error', err);
    try {
      await bot.sendMessage(CHAT_ID, '⚠️ Photo failed to save - please resend.');
    } catch (_) {}
  }
});

// --- Inbound documents (memos/screenshots sent as uncompressed files - Telegram
// re-encodes "photo" uploads, degrading legibility, so uncompressed "file" sends
// are the recommended way to send memos and ad-spend screenshots). ---
bot.on('document', async (msg) => {
  try {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const doc = msg.document;
    if (!doc.mime_type || !doc.mime_type.startsWith('image/')) {
      await bot.sendMessage(CHAT_ID, '⚠️ Only images supported - please resend as photo/image.', {
        reply_to_message_id: msg.message_id,
      });
      return;
    }

    const fileUniqueId = doc.file_unique_id;
    if (await isDuplicateFileUniqueId(fileUniqueId)) {
      await bot.sendMessage(CHAT_ID, 'Already logged - skipped.', {
        reply_to_message_id: msg.message_id,
      });
      return;
    }

    const fileLink = await bot.getFileLink(doc.file_id);
    const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    const businessDatePrefix = todayBusinessDate().replace(/-/g, '');
    const ext = (doc.file_name && doc.file_name.split('.').pop()) || 'jpg';
    const filename = `${businessDatePrefix}_${msg.message_id}_${fileUniqueId}.${ext}`;

    const uploaded = await uploadToDrive({ buffer, filename, mimeType: doc.mime_type });

    const isCorrection = !!msg.reply_to_message;
    await appendManifestRow({
      telegramMessageId: msg.message_id,
      replyToMessageId: isCorrection ? msg.reply_to_message.message_id : null,
      fileUniqueId,
      driveFileId: uploaded.id,
      type: 'photo',
      rawText: msg.caption || '',
    });

    await bot.sendMessage(CHAT_ID, 'Photo received - queued for review.', { reply_to_message_id: msg.message_id });
  } catch (err) {
    console.error('document handler error', err);
    try {
      await bot.sendMessage(CHAT_ID, '⚠️ File failed to save - please resend.');
    } catch (_) {}
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DM Finance bot listening on :${PORT}`));
