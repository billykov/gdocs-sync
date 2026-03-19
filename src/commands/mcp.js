import fs from 'fs';
import path from 'path';
import os from 'os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createOAuthClient, getDocs, getDrive } from '../lib/google.js';
import { getFileEntry, setFileEntry } from '../lib/config.js';
import { fetchComments, formatCommentsToMd, resolveMarkedComments } from '../lib/comments.js';
import { htmlToMarkdown } from '../lib/htmlToMd.js';
import { ensureFolder, createDoc, writeContent } from './push.js';

const TOKEN_PATH = path.join(os.homedir(), '.gdocs', 'token.json');

function getAuthClient() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error('Not authenticated. Run: gdocs auth from your terminal first.');
  }
  const client = createOAuthClient();
  client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
  client.on('tokens', (tokens) => {
    const current = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...current, ...tokens }, null, 2));
  });
  return client;
}

function ok(text) {
  return { content: [{ type: 'text', text }] };
}

function err(text) {
  return { content: [{ type: 'text', text: `Error: ${text}` }], isError: true };
}

const fileParams = {
  file: z.string().describe('Path to the .md file (relative to cwd, or absolute)'),
  cwd: z.string().optional().describe('Project directory containing .gdocs-sync.json (defaults to current working directory)'),
};

export function startMcpServer() {
  const server = new McpServer({ name: 'gdocs-sync', version: '0.2.0' });

  server.tool(
    'gdocs_push',
    'Push a local Markdown file to Google Docs. Creates the doc on first push, updates it on subsequent pushes using a diff-based algorithm that preserves comment anchors on unchanged paragraphs. Also resolves any comments marked [RESOLVED] in the .comments.md file.',
    fileParams,
    async ({ file, cwd: projectDir }) => {
      try {
        const dir = path.resolve(projectDir ?? process.cwd());
        process.chdir(dir);
        const filepath = path.resolve(dir, file);
        if (!filepath.startsWith(dir + path.sep) && filepath !== dir) {
          return err(`Path traversal denied: ${file} is outside the project directory`);
        }
        const filename = path.basename(filepath);

        if (!fs.existsSync(filepath)) return err(`File not found: ${filepath}`);

        const markdown = fs.readFileSync(filepath, 'utf8');
        const auth = getAuthClient();
        const docs = getDocs(auth);
        const drive = getDrive(auth);
        const entry = getFileEntry(filename);

        if (!entry?.docId) {
          const folderId = await ensureFolder(drive);
          const docId = await createDoc(drive, docs, filename, folderId);
          const docUrl = `https://docs.google.com/document/d/${docId}/edit`;
          setFileEntry(filename, { docId, docUrl, lastPushed: new Date().toISOString() });
          await writeContent(docs, docId, markdown, false);
          return ok(`Created: ${docUrl}`);
        } else {
          const commentsPath = filepath.replace(/\.md$/, '') + '.comments.md';
          const resolved = await resolveMarkedComments(auth, entry.docId, commentsPath);
          await writeContent(docs, entry.docId, markdown, true);
          setFileEntry(filename, { lastPushed: new Date().toISOString() });
          const lines = [`Updated: ${entry.docUrl}`];
          if (resolved > 0) lines.push(`Resolved ${resolved} comment(s)`);
          return ok(lines.join('\n'));
        }
      } catch (e) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'gdocs_pull',
    'Pull content and comments from Google Docs to the local Markdown file. Updates the .md file with the latest content and writes a .comments.md file with all open comments.',
    fileParams,
    async ({ file, cwd: projectDir }) => {
      try {
        const dir = path.resolve(projectDir ?? process.cwd());
        process.chdir(dir);
        const filepath = path.resolve(dir, file);
        if (!filepath.startsWith(dir + path.sep) && filepath !== dir) {
          return err(`Path traversal denied: ${file} is outside the project directory`);
        }
        const filename = path.basename(filepath);
        const entry = getFileEntry(filename);

        if (!entry?.docId) {
          return err(`No Google Doc linked to ${filename}. Run gdocs_push first.`);
        }

        const auth = getAuthClient();
        const drive = getDrive(auth);

        const res = await drive.files.export(
          { fileId: entry.docId, mimeType: 'text/html' },
          { responseType: 'text' }
        );

        const markdown = htmlToMarkdown(res.data);
        fs.writeFileSync(filepath, markdown);

        const comments = await fetchComments(auth, entry.docId);
        const commentsPath = filepath.replace(/\.md$/, '') + '.comments.md';
        fs.writeFileSync(commentsPath, formatCommentsToMd(comments, entry.docUrl));

        setFileEntry(filename, { lastPulled: new Date().toISOString() });
        return ok(`Pulled content → ${filename}\nPulled comments → ${path.basename(commentsPath)} (${comments.length} open)`);
      } catch (e) {
        return err(e.message);
      }
    }
  );

  const transport = new StdioServerTransport();
  server.connect(transport);
  console.error('gdocs-sync MCP server running (stdio)');
}
