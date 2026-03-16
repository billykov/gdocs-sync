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

function insertText(text, index) {
  return { insertText: { location: { index }, text } };
}

function paragraphStyle(startIndex, endIndex, namedStyleType) {
  return {
    updateParagraphStyle: {
      range: { startIndex, endIndex },
      paragraphStyle: { namedStyleType },
      fields: 'namedStyleType',
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

export function tokenToRequests(token, index) {
  const requests = [];

  switch (token.type) {
    case 'heading': {
      const text = token.text + '\n';
      requests.push(insertText(text, index));
      const styleMap = {
        1: 'HEADING_1',
        2: 'HEADING_2',
        3: 'HEADING_3',
        4: 'HEADING_4',
        5: 'HEADING_5',
        6: 'HEADING_6',
      };
      requests.push(paragraphStyle(index, index + text.length, styleMap[token.depth] ?? 'HEADING_1'));
      index += text.length;
      break;
    }

    case 'paragraph': {
      const inlineRequests = [];
      let inlineIndex = index;
      for (const inline of token.tokens ?? []) {
        const r = inlineTokenToRequests(inline, inlineIndex);
        inlineRequests.push(...r.requests);
        inlineIndex = r.index;
      }
      // Add trailing newline
      inlineRequests.push(insertText('\n', inlineIndex));
      inlineIndex += 1;
      requests.push(...inlineRequests);
      index = inlineIndex;
      break;
    }

    case 'code': {
      const text = token.text + '\n';
      requests.push(insertText(text, index));
      requests.push(
        textStyle(index, index + text.length, {
          weightedFontFamily: { fontFamily: 'Courier New' },
          fontSize: { magnitude: 10, unit: 'PT' },
        })
      );
      requests.push(paragraphStyle(index, index + text.length, 'NORMAL_TEXT'));
      index += text.length;
      break;
    }

    case 'list': {
      for (const item of token.items) {
        const text = item.text + '\n';
        requests.push(insertText(text, index));
        requests.push({
          createParagraphBullets: {
            range: { startIndex: index, endIndex: index + text.length },
            bulletPreset: token.ordered ? 'NUMBERED_DECIMAL_ALPHA_ROMAN' : 'BULLET_DISC_CIRCLE_SQUARE',
          },
        });
        index += text.length;
      }
      break;
    }

    case 'space': {
      // Skip extra blank lines — Docs handles spacing via paragraph styles
      break;
    }

    case 'hr': {
      // Insert a horizontal rule as a line of dashes
      const text = '───────────────────────────────────────\n';
      requests.push(insertText(text, index));
      index += text.length;
      break;
    }

    case 'blockquote': {
      const text = (token.text ?? '') + '\n';
      requests.push(insertText(text, index));
      index += text.length;
      break;
    }

    default:
      break;
  }

  return { requests, index };
}

function inlineTokenToRequests(token, index) {
  const requests = [];

  switch (token.type) {
    case 'text':
    case 'escape': {
      const text = token.text ?? token.raw ?? '';
      requests.push(insertText(text, index));
      index += text.length;
      break;
    }

    case 'strong': {
      const text = token.text ?? '';
      requests.push(insertText(text, index));
      requests.push(textStyle(index, index + text.length, { bold: true }));
      index += text.length;
      break;
    }

    case 'em': {
      const text = token.text ?? '';
      requests.push(insertText(text, index));
      requests.push(textStyle(index, index + text.length, { italic: true }));
      index += text.length;
      break;
    }

    case 'codespan': {
      const text = token.text ?? '';
      requests.push(insertText(text, index));
      requests.push(
        textStyle(index, index + text.length, {
          weightedFontFamily: { fontFamily: 'Courier New' },
        })
      );
      index += text.length;
      break;
    }

    case 'link': {
      const text = token.text ?? token.href ?? '';
      requests.push(insertText(text, index));
      requests.push(
        textStyle(index, index + text.length, {
          link: { url: token.href },
          foregroundColor: { color: { rgbColor: { blue: 0.8, red: 0.06, green: 0.29 } } },
          underline: true,
        })
      );
      index += text.length;
      break;
    }

    default: {
      const text = token.raw ?? '';
      if (text) {
        requests.push(insertText(text, index));
        index += text.length;
      }
      break;
    }
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
