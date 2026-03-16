import fs from 'fs';
import { getDrive } from './google.js';

export async function resolveMarkedComments(auth, docId, commentsFilePath) {
  if (!fs.existsSync(commentsFilePath)) return 0;

  const content = fs.readFileSync(commentsFilePath, 'utf8');
  const blocks = content.split(/\n---\n/);
  const drive = getDrive(auth);
  let resolved = 0;

  for (const block of blocks) {
    if (!block.match(/(?<!`)\[RESOLVED\](?!`)/)) continue;
    const match = block.match(/\*\*ID:\*\*\s*`([^`]+)`/);
    if (!match) continue;

    const commentId = match[1];
    await drive.replies.create({
      fileId: docId,
      commentId,
      fields: 'id',
      requestBody: { action: 'resolve', content: '.' },
    });
    resolved++;
  }

  return resolved;
}

export async function fetchComments(auth, docId) {
  const drive = getDrive(auth);
  const res = await drive.comments.list({
    fileId: docId,
    fields: 'comments(id,content,author,createdTime,quotedFileContent,resolved,replies)',
    includeDeleted: false,
  });

  return (res.data.comments ?? []).filter((c) => !c.resolved);
}

export function formatCommentsToMd(comments, docUrl) {
  const lines = ['# Comments', ''];
  lines.push(`_Source: ${docUrl}_`);
  lines.push('');

  if (comments.length === 0) {
    lines.push('_No open comments._');
    return lines.join('\n') + '\n';
  }

  for (const c of comments) {
    lines.push('---');
    lines.push('');
    lines.push(`**ID:** \`${c.id}\``);
    lines.push(`**Author:** ${c.author?.displayName ?? 'Unknown'}`);
    lines.push(`**Date:** ${new Date(c.createdTime).toLocaleString()}`);

    if (c.quotedFileContent?.value) {
      lines.push(`**Quote:**`);
      lines.push(`> ${c.quotedFileContent.value}`);
    }

    lines.push('');
    lines.push(c.content);

    if (c.replies?.length > 0) {
      lines.push('');
      lines.push('**Replies:**');
      for (const r of c.replies) {
        lines.push(`- **${r.author?.displayName ?? 'Unknown'}:** ${r.content}`);
      }
    }

    lines.push('');
    lines.push('_To resolve: add `[RESOLVED]` anywhere in this block, then run `gdocs push`._');
    lines.push('');
  }

  return lines.join('\n');
}
