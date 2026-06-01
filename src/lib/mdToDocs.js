import { marked } from 'marked';

// Converts a markdown string into a Google Docs batchUpdate requests array.
// Assumes the document body is empty (call after clearing the doc).
// Returns { requests, endIndex } where endIndex is the final character position.

export function markdownToRequests(markdown) {
  const tokens = marked.lexer(markdown);
  const requests = [];
  let index = 1; // Docs body starts at index 1

  for (const token of tokens) {
    const result = tokenToRequests(token, index);
    requests.push(...result.requests);
    index = result.index;
  }

  return requests;
}

// marked v12 HTML-encodes token.text (e.g. " → &quot;). Decode before inserting into Docs.
function decodeHtmlEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function insertText(text, index) {
  return { insertText: { location: { index }, text } };
}

function paragraphStyle(startIndex, endIndex, style) {
  return {
    updateParagraphStyle: {
      range: { startIndex, endIndex },
      paragraphStyle: style,
      fields: Object.keys(style).join(','),
    },
  };
}

function textStyle(startIndex, endIndex, style) {
  return {
    updateTextStyle: {
      range: { startIndex, endIndex },
      textStyle: style,
      fields: Object.keys(style).join(','),
    },
  };
}

// Base character style applied to the full range of every normal paragraph and list item.
// This prevents bold/font inheritance from preceding headings.
const BASE_TEXT_STYLE = {
  bold: false,
  italic: false,
  weightedFontFamily: { fontFamily: 'Arial' },
  fontSize: { magnitude: 11, unit: 'PT' },
};

// Processes inline tokens into separate insertion and style requests.
// Keeps them separate so callers can apply a base style reset between them.
function processInlineTokens(inlineTokens, startIndex) {
  const insertRequests = [];
  const styleRequests = [];
  let index = startIndex;

  for (const token of inlineTokens) {
    switch (token.type) {
      case 'text':
      case 'escape': {
        const text = decodeHtmlEntities(token.text ?? token.raw ?? '');
        if (text) {
          insertRequests.push(insertText(text, index));
          index += text.length;
        }
        break;
      }

      case 'strong': {
        const text = decodeHtmlEntities(token.text ?? '');
        if (text) {
          insertRequests.push(insertText(text, index));
          styleRequests.push(textStyle(index, index + text.length, { bold: true }));
          index += text.length;
        }
        break;
      }

      case 'em': {
        const text = decodeHtmlEntities(token.text ?? '');
        if (text) {
          insertRequests.push(insertText(text, index));
          styleRequests.push(textStyle(index, index + text.length, { italic: true }));
          index += text.length;
        }
        break;
      }

      case 'codespan': {
        const text = decodeHtmlEntities(token.text ?? '');
        if (text) {
          insertRequests.push(insertText(text, index));
          styleRequests.push(
            textStyle(index, index + text.length, {
              weightedFontFamily: { fontFamily: 'Courier New' },
            })
          );
          index += text.length;
        }
        break;
      }

      case 'link': {
        const text = decodeHtmlEntities(token.text ?? token.href ?? '');
        if (text) {
          insertRequests.push(insertText(text, index));
          styleRequests.push(
            textStyle(index, index + text.length, {
              link: { url: token.href },
              foregroundColor: { color: { rgbColor: { blue: 0.8, red: 0.06, green: 0.29 } } },
              underline: true,
            })
          );
          index += text.length;
        }
        break;
      }

      default: {
        const text = decodeHtmlEntities(token.raw ?? '');
        if (text) {
          insertRequests.push(insertText(text, index));
          index += text.length;
        }
        break;
      }
    }
  }

  return { insertRequests, styleRequests, endIndex: index };
}

const HEADING_STYLE_MAP = {
  1: 'HEADING_1',
  2: 'HEADING_2',
  3: 'HEADING_3',
  4: 'HEADING_4',
  5: 'HEADING_5',
  6: 'HEADING_6',
};

// Space above each heading level (PT). Gives visual separation from preceding content.
const HEADING_SPACE_ABOVE = { 1: 20, 2: 16, 3: 12, 4: 10, 5: 8, 6: 6 };

export function tokenToRequests(token, index) {
  const requests = [];

  switch (token.type) {
    case 'heading': {
      const headingStart = index;
      const { insertRequests, styleRequests, endIndex } = processInlineTokens(token.tokens ?? [], index);
      requests.push(...insertRequests);
      requests.push(insertText('\n', endIndex));
      const headingEnd = endIndex + 1;

      requests.push(
        paragraphStyle(headingStart, headingEnd, {
          namedStyleType: HEADING_STYLE_MAP[token.depth] ?? 'HEADING_1',
          spaceAbove: { magnitude: HEADING_SPACE_ABOVE[token.depth] ?? 20, unit: 'PT' },
          spaceBelow: { magnitude: 4, unit: 'PT' },
        })
      );
      requests.push(...styleRequests);

      index = headingEnd;
      break;
    }

    case 'paragraph': {
      const paraStart = index;
      const { insertRequests, styleRequests, endIndex } = processInlineTokens(token.tokens ?? [], index);

      // 1. Insert all text
      requests.push(...insertRequests);
      requests.push(insertText('\n', endIndex));
      const paraEnd = endIndex + 1;

      // 2. Reset base character style for full paragraph (prevents bold/font inheritance from headings)
      requests.push(textStyle(paraStart, paraEnd, BASE_TEXT_STYLE));

      // 3. Apply per-token inline styles on top of the reset
      requests.push(...styleRequests);

      // 4. Paragraph style with breathing room
      requests.push(
        paragraphStyle(paraStart, paraEnd, {
          namedStyleType: 'NORMAL_TEXT',
          spaceBelow: { magnitude: 8, unit: 'PT' },
        })
      );

      index = paraEnd;
      break;
    }

    case 'code': {
      const text = token.text + '\n';
      requests.push(insertText(text, index));
      requests.push(
        textStyle(index, index + text.length, {
          bold: false,
          italic: false,
          weightedFontFamily: { fontFamily: 'Courier New' },
          fontSize: { magnitude: 10, unit: 'PT' },
        })
      );
      requests.push(
        paragraphStyle(index, index + text.length, {
          namedStyleType: 'NORMAL_TEXT',
          spaceAbove: { magnitude: 4, unit: 'PT' },
          spaceBelow: { magnitude: 4, unit: 'PT' },
        })
      );
      index += text.length;
      break;
    }

    case 'list': {
      for (const item of token.items) {
        const itemStart = index;
        // item.tokens is [{type:'text', tokens:[...inline...]}] for simple items
        const inlineTokens = item.tokens?.[0]?.tokens ?? [];
        const { insertRequests, styleRequests, endIndex } = processInlineTokens(inlineTokens, index);

        requests.push(...insertRequests);
        requests.push(insertText('\n', endIndex));
        const itemEnd = endIndex + 1;

        requests.push({
          createParagraphBullets: {
            range: { startIndex: itemStart, endIndex: itemEnd },
            bulletPreset: token.ordered ? 'NUMBERED_DECIMAL_ALPHA_ROMAN' : 'BULLET_DISC_CIRCLE_SQUARE',
          },
        });

        requests.push(textStyle(itemStart, itemEnd, BASE_TEXT_STYLE));
        requests.push(...styleRequests);

        index = itemEnd;
      }
      break;
    }

    case 'table': {
      const numCols = token.header.length;
      const numRows = 1 + token.rows.length; // header row + data rows
      // Index stride per row: 1 row marker + C × (1 cell marker + 1 content char)
      const rowStride = 1 + 2 * numCols;

      requests.push({
        insertTable: {
          rows: numRows,
          columns: numCols,
          location: { index },
        },
      });

      let textOffset = 0;

      const fillCell = (r, c, cellTokens, isHeader) => {
        // insertTable at I places the table at I+1; cell (r,c) content = I + 4 + r*rowStride + 2*c
        const actualPos = index + 4 + r * rowStride + 2 * c + textOffset;
        const { insertRequests, styleRequests, endIndex: cellEnd } = processInlineTokens(cellTokens, actualPos);
        requests.push(...insertRequests);
        const cellLen = cellEnd - actualPos;
        if (cellLen > 0) {
          const baseStyle = isHeader ? { ...BASE_TEXT_STYLE, bold: true } : BASE_TEXT_STYLE;
          requests.push(textStyle(actualPos, cellEnd, baseStyle));
          requests.push(...styleRequests);
        }
        textOffset += cellLen;
      };

      for (let c = 0; c < numCols; c++) {
        fillCell(0, c, token.header[c].tokens, true);
      }
      for (let r = 0; r < token.rows.length; r++) {
        for (let c = 0; c < numCols; c++) {
          fillCell(r + 1, c, token.rows[r][c].tokens, false);
        }
      }

      // +3: table_start_marker + table_end_marker + preceding_paragraph created by insertTable
      index = index + 3 + numRows * rowStride + textOffset;
      break;
    }

    case 'space': {
      // Skip extra blank lines — Docs handles spacing via paragraph styles
      break;
    }

    case 'hr': {
      const text = '───────────────────────────────────────\n';
      requests.push(insertText(text, index));
      index += text.length;
      break;
    }

    case 'blockquote': {
      const text = decodeHtmlEntities(token.text ?? '') + '\n';
      requests.push(insertText(text, index));
      index += text.length;
      break;
    }

    default:
      break;
  }

  return { requests, index };
}

// Strip markdown syntax to plain text (used for diffing in M3)
export function markdownToPlainText(markdown) {
  const tokens = marked.lexer(markdown);
  return tokens
    .map((t) => {
      if (t.type === 'code') return t.text + '\n';
      if (t.type === 'heading') return t.text + '\n';
      if (t.type === 'paragraph') return t.text + '\n';
      if (t.type === 'list') return t.items.map((i) => i.text).join('\n') + '\n';
      return '';
    })
    .join('\n');
}
