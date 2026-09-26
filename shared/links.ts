export interface TextLink { url: string; start: number; end: number }
export interface LinkPreview { url: string; hostname: string; title: string; description: string; imageUrl?: string }

/** Keep balanced parentheses in URLs, but leave surrounding punctuation in text. */
export function textLinks(text: string): TextLink[] {
  const links: TextLink[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'\u0000-\u001f]+/gi)) {
    let url = match[0].replace(/[.,!?;:]+$/, '');
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      while (url.endsWith(close) && url.split(close).length > url.split(open).length) url = url.slice(0, -1);
    }
    try { const parsed = new URL(url); if (parsed.username || parsed.password) continue; } catch { continue; }
    links.push({ url, start: match.index, end: match.index + url.length });
  }
  return links;
}
