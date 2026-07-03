// Pure keyword/regex classifier for the INSTANT Telegram acknowledgment only.
// Zero AI, zero cost, zero added latency - the real reasoning still happens later
// in the Claude Code batch job. This just makes the instant reply feel competent
// instead of a bare checkmark, per founder feedback (wants "chartered accountant"
// tone: terse, precise, warnings marked with ⚠️, no fake enthusiasm).
//
// Deliberately conservative: anything genuinely ambiguous (especially Bangla
// money-in/out directionality, which can flip on a single verb) downgrades to
// "Unclear" rather than guessing - a wrong instant ack that the founder trusts
// is worse than an honest "will confirm."

const { getSheets } = require('./drive');

// --- Known supplier cache, refreshed every 10 min so we don't hit Sheets per-message ---
let supplierCache = { names: [], fetchedAt: 0 };
const SUPPLIER_CACHE_TTL_MS = 10 * 60 * 1000;

async function getKnownSuppliers() {
  const now = Date.now();
  if (now - supplierCache.fetchedAt < SUPPLIER_CACHE_TTL_MS) return supplierCache.names;
  try {
    const sheets = getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.MANIFEST_SHEET_ID,
      range: 'SupplierDues!A2:A100',
    });
    const names = (res.data.values || []).map((r) => (r[0] || '').toLowerCase()).filter(Boolean);
    supplierCache = { names, fetchedAt: now };
    return names;
  } catch (err) {
    console.error('getKnownSuppliers failed, using stale/empty cache', err);
    return supplierCache.names;
  }
}

// --- Daily session counter, per business day (Asia/Dhaka), in-memory ---
let sessionState = { businessDate: null, count: 0 };

function bumpSessionCount(businessDate) {
  if (sessionState.businessDate !== businessDate) {
    sessionState = { businessDate, count: 0 };
  }
  sessionState.count += 1;
  return { count: sessionState.count, isFirstOfSession: sessionState.count === 1 };
}

// --- Amount extraction: requires a currency marker nearby, formatted with commas ---
function extractAmount(text) {
  const match = text.match(/(?:tk|taka|৳)\s*([0-9][0-9,]*(?:\.[0-9]+)?)|([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:tk|taka|৳)/i);
  if (!match) return null;
  const raw = (match[1] || match[2] || '').replace(/,/g, '');
  const num = parseFloat(raw);
  if (isNaN(num)) return null;
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// --- Bangla/Banglish directionality guard ---
const GIVE_VERBS = ['দিলাম', 'দিছি', 'দিলো', 'dilam', 'dilm', 'dilaam', 'dilm', 'dilo'];
const RECEIVE_VERBS = ['পেলাম', 'পাইছি', 'পাইলাম', 'pelam', 'pailam', 'pelm', 'peyechi'];
const DISAMBIGUATING_KEYWORDS = ['sale', 'sold', 'bikri', 'বিক্রি', 'purchase', 'bought', 'kinlam', 'কিনলাম', 'expense', 'salary', 'draw', 'ad spend', 'transfer', 'refund'];

function hasAmbiguousDirection(lower) {
  const hasGive = GIVE_VERBS.some((v) => lower.includes(v));
  const hasReceive = RECEIVE_VERBS.some((v) => lower.includes(v));
  const hasDisambiguator = DISAMBIGUATING_KEYWORDS.some((k) => lower.includes(k));
  return (hasGive || hasReceive) && !hasDisambiguator;
}

// --- Category keyword sets (English + common Banglish phone-typed spellings) ---
const CATEGORY_KEYWORDS = {
  refund: ['refund', 'return', 'ferot'],
  receivable_collection: ['collected', 'বাকি পেলাম', 'baki pelam', 'due collected'],
  cash_injection: ['injected', 'own money', 'personal cash added', 'nijer taka dilam business e'],
  discount: ['discount', 'chad dilam', 'ছাড়'],
  draw: ['my salary', 'my draw', 'personal draw', 'amar salary', 'amar taka'],
  supplier_payment: ['paid due', 'supplier payment', 'due porishod'],
  purchase: ['bought', 'purchase', 'kinlam', 'কিনলাম', 'কিনেছি'],
  ad_spend: ['ad spend', 'facebook ad', 'fb ad', 'google ad', 'tiktok ad'],
  transfer: ['transfer', 'moved', 'to brac', 'to bkash', 'bkash to bank'],
  expense_staff: ['staff salary', 'salary', 'বেতন'],
  expense_rent: ['rent', 'ভাড়া'],
  expense_utility: ['electricity', 'internet bill', 'utility', 'bill'],
  expense: ['expense', 'spent', 'opex', 'kharoch', 'খরচ'],
  sale: ['sold', 'sale', 'bikri', 'বিক্রি', 'cod'],
};

function detectCategory(lower) {
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return null;
}

// --- Name extraction against known suppliers (very light - looks for capitalized
// words or known supplier substrings; not a full NER, just enough to flag unknowns) ---
// Returns { name, confirmed } - name is always the best guess, confirmed says
// whether it matched a known supplier from SupplierDues.
function extractPartyName(text, knownSuppliers) {
  const lower = text.toLowerCase();
  const matchedKnown = knownSuppliers.find((s) => lower.includes(s));
  if (matchedKnown) {
    // Title-case it back for display since the sheet lookup is lowercased
    const display = matchedKnown.replace(/\b\w/g, (c) => c.toUpperCase());
    return { name: display, confirmed: true };
  }
  // crude: grab a capitalized word sequence as a candidate name, or a word after "of"
  const nameMatch = text.match(/(?:from|to|of)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
  return { name: nameMatch ? nameMatch[1] : 'supplier', confirmed: false };
}

const TEMPLATES = {
  sale: (amount) => `Sale logged - Tk${amount}.`,
  expense: (amount) => `Expense logged - Tk${amount}.`,
  expense_staff: (amount) => `Expense logged (staff) - Tk${amount}.`,
  expense_rent: (amount) => `Expense logged (rent) - Tk${amount}.`,
  expense_utility: (amount) => `Expense logged (utility) - Tk${amount}.`,
  draw: (amount) => `Draw logged - Tk${amount}.`,
  supplier_payment: (amount, name) => `Payment logged - ${name || 'supplier'} Tk${amount}.`,
  purchase: (amount) => `Purchase logged - Tk${amount}.`,
  ad_spend: (amount) => `Ad spend logged - Tk${amount}.`,
  transfer: (amount) => `Transfer logged - Tk${amount}.`,
  refund: (amount) => `Refund logged - Tk${amount}.`,
  receivable_collection: (amount) => `Collection logged - Tk${amount}.`,
  cash_injection: (amount) => `Cash injection logged - Tk${amount}.`,
  discount: (amount) => `Discount logged - Tk${amount}.`,
};

// Main entry point. Returns the exact string to send as the instant ack.
async function classifyForAck({ text, businessDate, isQuestion }) {
  const { count, isFirstOfSession } = bumpSessionCount(businessDate);
  const prefix = isFirstOfSession ? 'Session started.\n' : '';

  if (isQuestion) {
    return prefix + 'Noted - answer coming in next update.';
  }

  const lower = text.toLowerCase();

  if (hasAmbiguousDirection(lower)) {
    return prefix + '⚠️ Unclear - will confirm with you.';
  }

  const amount = extractAmount(text);
  const category = detectCategory(lower);

  if (!amount) {
    return prefix + '⚠️ No amount found - resend with Tk figure.';
  }
  if (!category) {
    return prefix + `⚠️ Category unclear - will confirm with you. (${count} today)`;
  }

  if (category === 'supplier_payment') {
    const knownSuppliers = await getKnownSuppliers();
    const { name, confirmed } = extractPartyName(text, knownSuppliers);
    const line = TEMPLATES.supplier_payment(amount, confirmed ? name : `${name} (unconfirmed)`);
    return prefix + `${line} (${count} today)`;
  }

  const line = TEMPLATES[category](amount);
  return prefix + `${line} (${count} today)`;
}

module.exports = { classifyForAck };
