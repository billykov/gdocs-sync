import fs from 'fs';
import path from 'path';
import { getAuthClient, getDrive, handleGoogleApiError } from '../lib/google.js';
import { getFileEntry, setFileEntry } from '../lib/config.js';
import { htmlToMarkdown } from '../lib/htmlToMd.js';
import { fetchComments, formatCommentsToMd } from '../lib/comments.js';

export async function pull(file) {
  const filename = path.basename(file);
  const filepath = path.resolve(process.cwd(), file);

  const entry = getFileEntry(filename);
  if (!entry?.docId) {
    console.error(`No Google Doc linked to ${filename}. Run: gdocs push ${filename} first.`);
    process.exit(1);
  }

  const auth = getAuthClient();
  const drive = getDrive(auth);

  try {
    // Export the Google Doc as HTML
    const res = await drive.files.export(
      { fileId: entry.docId, mimeType: 'text/html' },
      { responseType: 'text' }
    );

    const markdown = htmlToMarkdown(res.data);
    fs.writeFileSync(filepath, markdown);
    console.log(`✔ Pulled content  → ${filename}`);

    // Fetch and write comments
    const comments = await fetchComments(auth, entry.docId);
    const commentsPath = filepath.replace(/\.md$/, '') + '.comments.md';
    const commentsFilename = path.basename(commentsPath);

    fs.writeFileSync(commentsPath, formatCommentsToMd(comments, entry.docUrl));
    console.log(`✔ Pulled comments → ${commentsFilename} (${comments.length} open)`);

    setFileEntry(filename, { lastPulled: new Date().toISOString() });
  } catch (err) {
    handleGoogleApiError(err);
  }
}
