// Two-step, non-interactive version (so it can be run via a single command each step):
//
//   node get_refresh_token.js url        -> prints the URL to open and approve
//   node get_refresh_token.js code XXXX  -> exchanges the pasted code for tokens
//
// Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in processing/.env before running.
require('dotenv').config();
const { google } = require('googleapis');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'; // out-of-band, works for CLI/desktop flow

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in processing/.env first.');
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const mode = process.argv[2];

if (mode === 'url') {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });
  console.log(authUrl);
} else if (mode === 'code') {
  const code = process.argv[3];
  if (!code) {
    console.error('Usage: node get_refresh_token.js code <the_code_you_got>');
    process.exit(1);
  }
  oAuth2Client.getToken(code).then(({ tokens }) => {
    console.log('GOOGLE_CLIENT_ID=' + CLIENT_ID);
    console.log('GOOGLE_CLIENT_SECRET=' + CLIENT_SECRET);
    console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
  }).catch((e) => {
    console.error('Token exchange failed:', e.message);
    process.exit(1);
  });
} else {
  console.log('Usage:\n  node get_refresh_token.js url\n  node get_refresh_token.js code <the_code_you_got>');
}
