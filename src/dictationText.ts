/** Recognition chunks can include their own boundary whitespace, even mid-word gaps. */
export function dictationText(chunks: string[]) {
  return chunks.map(text => text.trim()).filter(Boolean).join(' ').replace(/\s+/gu, ' ').replace(/\s+([,.;:!?])/gu, '$1').trim();
}
