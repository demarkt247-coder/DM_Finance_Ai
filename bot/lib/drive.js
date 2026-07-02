const { google } = require('googleapis');

// Uses OAuth2 with a long-lived refresh token tied to the founder's own Google account.
// NOT a service account - personal Gmail service accounts have 0 Drive storage quota,
// which silently breaks uploads. A refresh token makes files count against the normal
// free 15GB quota on the founder's own account instead.
function getAuth() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oAuth2Client;
}

function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

// Uploads raw bytes to the Drive inbox folder. Filename embeds fileUniqueId for dedup.
async function uploadToDrive({ buffer, filename, mimeType }) {
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [process.env.DRIVE_FOLDER_ID],
    },
    media: {
      mimeType,
      body: require('stream').Readable.from(buffer),
    },
    fields: 'id, name',
  });
  return res.data;
}

module.exports = { getDrive, getSheets, uploadToDrive };
