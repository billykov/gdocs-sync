// OAuth2 client credentials for the gdocs-sync app.
// These identify the *application* to Google — not the user.
// For installed apps, client_secret is not truly secret (per Google's own guidance).
// See: https://developers.google.com/identity/protocols/oauth2/native-app
//
// To get your own credentials:
// 1. Go to https://console.cloud.google.com/
// 2. Create a project → APIs & Services → Credentials
// 3. Create OAuth 2.0 Client ID (type: Desktop app)
// 4. Replace the values below

if (!process.env.GDOCS_CLIENT_ID || !process.env.GDOCS_CLIENT_SECRET) {
  console.error('\nError: Missing Google OAuth credentials.');
  console.error('Set the following environment variables:');
  console.error('  GDOCS_CLIENT_ID=<your-client-id>');
  console.error('  GDOCS_CLIENT_SECRET=<your-client-secret>');
  console.error('\nGet credentials at: https://console.cloud.google.com/ → APIs & Services → Credentials\n');
  process.exit(1);
}

export const CLIENT_ID = process.env.GDOCS_CLIENT_ID;
export const CLIENT_SECRET = process.env.GDOCS_CLIENT_SECRET;
export const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

export const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive',
];
