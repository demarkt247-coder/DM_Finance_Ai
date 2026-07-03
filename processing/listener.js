// Persistent local listener - replaces interval-based Task Scheduler polling.
// Runs continuously on the PC (started once at logon/boot, stays alive), checking
// the bot's cheap /pending-count endpoint every 30s. Only when something is
// actually pending does it spawn the real Claude Code Pro batch job - this keeps
// the check itself nearly free while cutting trigger latency from up to 15 minutes
// down to under 30 seconds.
//
// Deliberately does NOT poll Telegram directly - the Render-hosted bot already
// holds the one allowed long-polling connection for this bot token; a second
// poller would cause 409 conflicts. Sheets manifest state (via /pending-count) is
// the coordination point instead.
require('dotenv').config();
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = 'E:\\Claude Upgrade\\Finance';
const LOG_FILE = path.join(PROJECT_DIR, 'processing', 'last_run.log');
const CHECK_INTERVAL_MS = 30 * 1000;
const PENDING_URL = 'https://dm-finance-bot.onrender.com/pending-count';

function log(line) {
  const stamped = `${line}\n`;
  fs.appendFileSync(LOG_FILE, stamped);
  console.log(line);
}

function checkPending() {
  return new Promise((resolve) => {
    const https = require('https');
    https.get(PENDING_URL, { timeout: 20000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.count || 0);
        } catch (e) {
          resolve(0);
        }
      });
    }).on('error', () => resolve(0)).on('timeout', function () { this.destroy(); resolve(0); });
  });
}

let running = false; // never overlap two batch runs

function runBatchJob() {
  return new Promise((resolve) => {
    log(`--- Listener triggered batch job ${new Date().toISOString()} ---`);
    const psScript = path.join(PROJECT_DIR, 'processing', 'run_claude_batch.ps1');
    execFile('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', psScript], { timeout: 15 * 60 * 1000 }, (err) => {
      if (err) log(`--- Listener: batch job error: ${err.message} ---`);
      resolve();
    });
  });
}

async function tick() {
  if (running) return;
  const count = await checkPending();
  if (count > 0) {
    running = true;
    await runBatchJob();
    running = false;
  }
}

log(`--- Listener started ${new Date().toISOString()}, checking every ${CHECK_INTERVAL_MS / 1000}s ---`);
setInterval(tick, CHECK_INTERVAL_MS);
tick(); // check immediately on startup too
