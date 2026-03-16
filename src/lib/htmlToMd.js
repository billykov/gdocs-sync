import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export function htmlToMarkdown(html) {
  // Strip Google Docs comment footnote paragraphs: <p>...<a href="#cmnt_ref1">...
  html = html.replace(/<p[^>]*>(?:(?!<\/p>)[\s\S])*<a[^>]+href="#cmnt_ref[^"]*"[^>]*>[\s\S]*?<\/p>/g, '');

  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    hr: '---',
  });

  td.use(gfm);

  // Google Docs wraps code in <span> with font-family:monospace — convert to inline code
  td.addRule('monospan', {
    filter: (node) =>
      node.nodeName === 'SPAN' &&
      (node.style?.fontFamily?.includes('Courier') || node.style?.fontFamily?.includes('monospace')),
    replacement: (content) => `\`${content}\``,
  });

  // Strip Google Docs comment anchors: <a href="#cmnt1">[a]</a> inline markers
  // and <a href="#cmnt_ref1">[a]</a> footnote back-references at the bottom
  td.addRule('stripCommentAnchors', {
    filter: (node) => {
      if (node.nodeName !== 'A') return false;
      const href = node.getAttribute('href') || '';
      return !href || href.startsWith('#cmnt');
    },
    replacement: () => '',
  });

  return td.turndown(html).trim() + '\n';
}
