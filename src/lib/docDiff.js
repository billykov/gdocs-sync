import { diffArrays } from 'diff';
import { marked } from 'marked';
import { tokenToRequests } from './mdToDocs.js';

// Group Google Docs body elements into blocks matching markdown token granularity.
// Consecutive list items (paragraphs with .bullet) are merged into one block.
function groupDocParagraphs(doc) {
  const blocks = [];
  let listBlock = null;

  for (const el of doc.body.content) {
    if (!el.paragraph) continue;

    if (el.paragraph.bullet) {
      if (listBlock) {
        listBlock.els.push(el);
        listBlock.endIndex = el.endIndex;
        listBlock.text += '\n' + paraText(el);
      } else {
        listBlock = {
          els: [el],
          startIndex: el.startIndex,
          endIndex: el.endIndex,
          text: paraText(el),
        };
        blocks.push(listBlock);
      }
    } else {
      listBlock = null;
      blocks.push({
        els: [el],
        startIndex: el.startIndex,
        endIndex: el.endIndex,
        text: paraText(el),
      });
    }
  }

  return blocks;
}

function paraText(el) {
  return el.paragraph.elements
    .map(e => e.textRun?.content ?? '')
    .join('')
    .replace(/\n$/, '');
}

function tokenText(token) {
  switch (token.type) {
    case 'heading':
    case 'paragraph':
      return token.text
        .replace(/\*\*(.+?)\*\*/gs, '$1')
        .replace(/\*(.+?)\*/gs, '$1')
        .replace(/_(.+?)_/gs, '$1')
        .replace(/`(.+?)`/gs, '$1')
        .replace(/\[(.+?)\]\(.+?\)/gs, '$1');
    case 'code':
      return token.text;
    case 'list':
      return token.items.map(i => i.text).join('\n');
    default:
      return (token.raw ?? '').trim();
  }
}

// Remove the trailing \n from the last insertText in a request list.
// Used for "replace" ops where we reuse the existing paragraph break.
function stripTrailingNewline(reqs) {
  const result = [...reqs];
  for (let i = result.length - 1; i >= 0; i--) {
    const it = result[i].insertText;
    if (it) {
      if (it.text === '\n') {
        result.splice(i, 1);
      } else if (it.text.endsWith('\n')) {
        result[i] = { insertText: { location: it.location, text: it.text.slice(0, -1) } };
      }
      break;
    }
  }
  return result;
}

// Build batchUpdate requests that only touch changed paragraphs,
// leaving unchanged paragraphs (and their comment anchors) untouched.
export function buildDiffRequests(doc, newMarkdown) {
  const blocks = groupDocParagraphs(doc);
  const tokens = marked.lexer(newMarkdown).filter(t => t.type !== 'space');
  const blockTexts = blocks.map(b => b.text);
  const tokenTexts = tokens.map(tokenText);

  const chunks = diffArrays(blockTexts, tokenTexts);

  let bi = 0;
  let ti = 0;
  const ops = [];

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const next = chunks[ci + 1];

    if (!chunk.added && !chunk.removed) {
      bi += chunk.count;
      ti += chunk.count;
      continue;
    }

    if (chunk.removed) {
      if (next?.added) {
        // Replacement: pair removed and added items
        const maxLen = Math.max(chunk.count, next.count);
        for (let i = 0; i < maxLen; i++) {
          if (i < chunk.count && i < next.count) {
            ops.push({ type: 'replace', block: blocks[bi++], token: tokens[ti++] });
          } else if (i < chunk.count) {
            ops.push({ type: 'delete', block: blocks[bi++] });
          } else {
            const prevBlock = ops.at(-1)?.block ?? blocks[bi - 1];
            ops.push({ type: 'insert', token: tokens[ti++], at: prevBlock.endIndex });
          }
        }
        ci++; // consumed the added chunk
      } else {
        for (let i = 0; i < chunk.count; i++) {
          ops.push({ type: 'delete', block: blocks[bi++] });
        }
      }
    } else if (chunk.added) {
      const insertAt = bi > 0 ? blocks[bi - 1].endIndex : 1;
      for (let i = 0; i < chunk.count; i++) {
        ops.push({ type: 'insert', token: tokens[ti++], at: insertAt });
      }
    }
  }

  if (!ops.length) return [];

  // Sort bottom-to-top so earlier indices aren't shifted by later operations
  ops.sort((a, b) => {
    const posA = a.block?.startIndex ?? a.at;
    const posB = b.block?.startIndex ?? b.at;
    return posB - posA;
  });

  const requests = [];

  for (const op of ops) {
    if (op.type === 'replace') {
      const { block, token } = op;
      // Delete block content but keep the trailing \n (paragraph break stays, preserving comment anchor)
      if (block.endIndex - 1 > block.startIndex) {
        requests.push({
          deleteContentRange: {
            range: { startIndex: block.startIndex, endIndex: block.endIndex - 1 },
          },
        });
      }
      // Insert new content without its trailing \n (reuse the preserved paragraph break)
      const { requests: tr } = tokenToRequests(token, block.startIndex);
      requests.push(...stripTrailingNewline(tr));
    } else if (op.type === 'delete') {
      const { block } = op;
      // Don't try to delete the trailing \n (segment boundary) — only clear the content
      if (block.endIndex - 1 > block.startIndex) {
        requests.push({
          deleteContentRange: {
            range: { startIndex: block.startIndex, endIndex: block.endIndex - 1 },
          },
        });
      }
    } else if (op.type === 'insert') {
      const { token, at } = op;
      const { requests: tr } = tokenToRequests(token, at);
      requests.push(...tr);
    }
  }

  return requests;
}
