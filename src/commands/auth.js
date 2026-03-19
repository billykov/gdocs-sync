import http from 'http';
import crypto from 'crypto';
import { createOAuthClient, saveToken } from '../lib/google.js';
import { SCOPES, REDIRECT_URI } from '../credentials.js';
import open from 'open';

export async function auth() {
  const client = createOAuthClient();
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // force refresh_token on every auth
    state,
  });

  console.log('Opening browser for Google authentication...');
  console.log('If the browser does not open, visit this URL manually:\n');
  console.log(authUrl + '\n');

  await open(authUrl);

  const code = await waitForCode(state);
  const { tokens } = await client.getToken(code);
  saveToken(tokens);

  console.log('\nAuthenticated successfully. Token saved to ~/.gdocs/token.json');
}

const AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function waitForCode(expectedState) {
  return new Promise((resolve, reject) => {
    const url = new URL(REDIRECT_URI);
    const port = parseInt(url.port, 10) || 3000;

    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url, `http://localhost:${port}`);
      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');
      const returnedState = reqUrl.searchParams.get('state');

      res.writeHead(200, { 'Content-Type': 'text/html' });

      if (error) {
        res.end('<h2>Authentication cancelled.</h2><p>You can close this tab.</p>');
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (returnedState !== expectedState) {
        res.end('<h2>Authentication failed.</h2><p>Invalid state parameter. You can close this tab.</p>');
        server.close();
        reject(new Error('OAuth state mismatch — possible CSRF attack'));
        return;
      }

      if (code) {
        res.end('<h2>Authenticated!</h2><p>You can close this tab and return to the terminal.</p>');
        server.close();
        resolve(code);
      }
    });

    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out after 5 minutes'));
    }, AUTH_TIMEOUT_MS);

    server.listen(port, () => {
      console.log(`Waiting for Google to redirect to localhost:${port}...`);
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    server.on('close', () => clearTimeout(timeout));
  });
}
