import fs from 'fs';
import path from 'path';
import { getAuthClient, getDocs, getDrive, handleGoogleApiError } from '../lib/google.js';
import { getFileEntry, setFileEntry, readUserConfig, writeUserConfig } from '../lib/config.js';
import { markdownToRequests } from '../lib/mdToDocs.js';
import { buildDiffRequests } from '../lib/docDiff.js';
import { resolveMarkedComments } from '../lib/comments.js';

const GDOCS_FOLDER_NAME = 'gdocs-sync';

export async function push(file) {
  const filename = path.basename(file);
  const filepath = path.resolve(process.cwd(), file);

  if (!fs.existsSync(filepath)) {
    console.error(`File not found: ${filepath}`);
    process.exit(1);
  }

  const markdown = fs.readFileSync(filepath, 'utf8');
  const auth = getAuthClient();
  const docs = getDocs(auth);
  const drive = getDrive(auth);

  let entry = getFileEntry(filename);

  try {
  if (!entry?.docId) {
    // First push — create a new doc
    const folderId = await ensureFolder(drive);
    const docId = await createDoc(drive, docs, filename, folderId);
    const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

    setFileEntry(filename, {
      docId,
      docUrl,
      lastPushed: new Date().toISOString(),
    });

    await writeContent(docs, docId, markdown);

    console.log(`Created: ${docUrl}`);
  } else {
    // Resolve any comments marked [RESOLVED] in the comments file
    const commentsPath = filepath.replace(/\.md$/, '') + '.comments.md';
    const resolvedCount = await resolveMarkedComments(auth, entry.docId, commentsPath);
    if (resolvedCount > 0) console.log(`✔ Resolved ${resolvedCount} comment(s)`);

    // Subsequent push — diff-based update (only changed paragraphs are touched)
    await writeContent(docs, entry.docId, markdown, true);
    setFileEntry(filename, { lastPushed: new Date().toISOString() });
    console.log(`Updated: ${entry.docUrl}`);
  }
  } catch (err) {
    handleGoogleApiError(err);
  }
}

export async function ensureFolder(drive) {
  const userConfig = readUserConfig();
  if (userConfig.folderId) return userConfig.folderId;

  // Check if folder already exists in Drive
  // GDOCS_FOLDER_NAME is a module-level constant — safe from injection
  const res = await drive.files.list({
    q: `name='${GDOCS_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  if (res.data.files.length > 0) {
    const folderId = res.data.files[0].id;
    writeUserConfig({ ...userConfig, folderId });
    return folderId;
  }

  // Create the folder
  const folder = await drive.files.create({
    requestBody: {
      name: GDOCS_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  const folderId = folder.data.id;
  writeUserConfig({ ...userConfig, folderId });
  console.log(`Created Google Drive folder: ${GDOCS_FOLDER_NAME}`);
  return folderId;
}

export async function createDoc(drive, docs, name, folderId) {
  // Create an empty Google Doc in the folder
  const res = await drive.files.create({
    requestBody: {
      name: name.replace(/\.md$/, ''),
      mimeType: 'application/vnd.google-apps.document',
      parents: [folderId],
    },
    fields: 'id',
  });
  return res.data.id;
}

export async function writeContent(docs, docId, markdown, diff = false) {
  const doc = await docs.documents.get({ documentId: docId });

  let requests;
  if (diff) {
    requests = buildDiffRequests(doc.data, markdown);
  } else {
    // First push: clear and rewrite
    const endIndex = doc.data.body.content.at(-1).endIndex - 1;
    requests = [];
    if (endIndex > 1) {
      requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex } } });
    }
    requests.push(...markdownToRequests(markdown));
  }

  if (requests.length > 0) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests },
    });
  }
}
