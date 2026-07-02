# De Markt Finance AI - Setup Checklist

Do these in order. Everything is free-tier.

## 1. Google OAuth (one-time, ~5 min)

Needed so the bot and Claude Code can write to your Drive/Sheets as your own
account (not a service account - those have zero storage quota on personal Gmail).

1. Go to console.cloud.google.com -> create a new project (free, no billing).
2. Enable "Google Drive API" and "Google Sheets API" (APIs & Services -> Library).
3. OAuth consent screen -> External -> add your own email as a test user.
4. Credentials -> Create Credentials -> OAuth client ID -> Application type: Desktop app.
5. Create `processing/.env` with `GOOGLE_CLIENT_ID=...` and `GOOGLE_CLIENT_SECRET=...` (from step 4).
6. Run: `cd processing && npm install googleapis dotenv && node get_refresh_token.js`
7. Open the printed URL, approve, paste the code back into the terminal.
8. Copy the 3 printed values (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_REFRESH_TOKEN`) into both `bot/.env` and a new `processing/.env`.

## 2. Create the master dashboard spreadsheet

Create one blank Google Sheet in the "DM Finance AI" Drive folder, name it
"DM Finance Dashboard". Copy its ID from the URL
(`docs.google.com/spreadsheets/d/THIS_PART/edit`) into:
- `bot/.env` as `MANIFEST_SHEET_ID`
- `processing/.env` as `MASTER_SHEET_ID`

## 3. Initialize the sheet structure

```
cd processing
npm install
node init_sheets.js
```

This creates every tab (manifest, dashboard, bank/cash, supplier dues, loans,
products) and seeds July 1 2026 opening balances already confirmed.

## 4. Fill in bot/.env

Copy `bot/.env.example` to `bot/.env` and fill in:
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` - already have these
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` - from step 1
- `MANIFEST_SHEET_ID` - from step 2
- `DRIVE_FOLDER_ID` - already have this (13LL2vD4NeXKrwtsMMewu474e6PBTZgBD)

## 5. Push to GitHub

```
cd "E:\Claude Upgrade\Finance"
git init
git add bot/ processing/ SETUP.md
git commit -m "Initial De Markt finance bot"
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

(`.env` files are gitignored - never get committed, tokens stay local/Render-only.)

## 6. Deploy to Render

1. render.com -> New -> Web Service -> connect your GitHub repo.
2. Root directory: `bot`
3. Build command: `npm install`
4. Start command: `npm start`
5. Add every variable from `bot/.env` under Environment.
6. Deploy. Note the live URL (`https://xxxx.onrender.com`) - put it in
   `RENDER_EXTERNAL_URL` in the env vars too.

## 7. Backlog alert trigger (Google Apps Script, free)

1. script.google.com -> New project.
2. Paste:
```js
function checkBacklog() {
  UrlFetchApp.fetch('https://xxxx.onrender.com/health-check-backlog');
}
```
3. Triggers (clock icon) -> Add Trigger -> time-driven -> day timer -> pick a time.

## 8. Windows Task Scheduler (auto-launch Claude Code)

Open Task Scheduler -> Create Task:
- General: Run whether user is logged on or not = OFF (needs your session),
  "Run with highest privileges" not required.
- Triggers: add three - "At log on", "At startup", and "Daily" at a fixed time
  (e.g. 9:00 PM, after the bot's 8 PM question).
- Actions: Start a program ->
  `powershell.exe -ExecutionPolicy Bypass -File "E:\Claude Upgrade\Finance\processing\run_claude_batch.ps1"`

Note: verify the exact Claude Code CLI non-interactive launch flag on your
installed version (`claude --help`) - the script has a placeholder for this.

## 9. Test today (July 2)

Once steps 1-6 are done, the bot is live - send it tonight's answers at 8 PM
(or right now to test). Then manually run
`powershell -File processing\run_claude_batch.ps1` once to confirm the full
loop works before relying on Task Scheduler.
