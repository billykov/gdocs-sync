import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } from '../credentials.js';

const TOKEN_PATH = path.join(os.homedir(), '.gdocs', 'token.json');

export function createOAuthClient() {
  return new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function loadToken() {
  if (!fs.existsSync(TOKEN_PATH)) {
    console.error('Not authenticated. Run: gdocs auth');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
}

export function saveToken(tokens) {
  const dir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

export function getAuthClient() {
  const client = createOAuthClient();
  client.setCredentials(loadToken());
  // Auto-refresh: update saved token when refreshed
  client.on('tokens', (tokens) => {
    const current = loadToken();
    saveToken({ ...current, ...tokens });
  });
  return client;
}

export function getDocs(auth) {
  return google.docs({ version: 'v1', auth });
}

export function getDrive(auth) {
  return google.drive({ version: 'v3', auth });
}

const API_ENABLE_URLS = {
  'drive.googleapis.com': 'https://console.developers.google.com/apis/api/drive.googleapis.com/overview',
  'docs.googleapis.com': 'https://console.developers.google.com/apis/api/docs.googleapis.com/overview',
};

export function handleGoogleApiError(err) {
  const message = err?.message || '';
  const status = err?.status ?? err?.code;

  // No internet / DNS failure
  if (err?.code === 'ENOTFOUND' || err?.code === 'ECONNREFUSED' || err?.code === 'ETIMEDOUT') {
    console.error('\nError: No internet connection. Check your network and retry.\n');
    process.exit(1);
  }

  // Token expired or revoked
  if (status === 401 || message.includes('invalid_grant') || message.includes('Token has been expired')) {
    console.error('\nError: Your Google auth token has expired or been revoked.');
    console.error('Run: gdocs auth\n');
    process.exit(1);
  }

  // File/doc not found
  if (status === 404) {
    console.error('\nError: The linked Google Doc no longer exists in Drive.');
    console.error('To recreate it, remove the entry from .gdocs-sync.json and run: gdocs push <file>\n');
    process.exit(1);
  }

  // Rate limit
  if (status === 429 || message.includes('Quota exceeded') || message.includes('rateLimitExceeded')) {
    console.error('\nError: Google API rate limit exceeded. Wait a minute and retry.\n');
    process.exit(1);
  }

  // API not enabled
  const projectMatch = message.match(/project[= ](\d+)/);
  const projectId = projectMatch?.[1];
  for (const [api, baseUrl] of Object.entries(API_ENABLE_URLS)) {
    if (message.includes(api)) {
      const url = projectId ? `${baseUrl}?project=${projectId}` : baseUrl;
      console.error(`\nError: ${api.replace('.googleapis.com', '')} API is not enabled.`);
      console.error(`Enable it here:\n  ${url}`);
      console.error('\nThen wait a minute and retry.\n');
      process.exit(1);
    }
  }

  // Unknown error
  console.error(`\nError: ${message || err}\n`);
  process.exit(1);
}
