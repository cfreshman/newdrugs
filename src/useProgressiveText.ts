import { useLayoutEffect, useRef, useState } from 'react';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const CHARACTERS_PER_SECOND = 90;

/** A short visual catch-up for provider commentary, never a queue ahead of the answer. */
export function useProgressiveText(text: string, enabled: boolean, key: string) {
  const [visible, setVisible] = useState({ key, text: enabled ? '' : text });
  const current = useRef(visible);
  useLayoutEffect(() => {
    let frame = 0;
    const replace = (value: string) => { current.current = { key, text: value }; setVisible(current.current); };
    const finish = () => { cancelAnimationFrame(frame); replace(text); };
    if (!enabled) { finish(); return; }
    const parts = Array.from(graphemes.segment(text), part => part.segment);
    const prior = current.current;
    const prefix = prior.key === key && text.startsWith(prior.text) ? prior.text : '';
    const start = Array.from(graphemes.segment(prefix)).length;
    replace(prefix);
    if (start >= parts.length) return;
    const started = performance.now();
    const tick = (now: number) => {
      const count = Math.min(parts.length, start + Math.floor(Math.max(0, now - started) * CHARACTERS_PER_SECOND / 1000));
      replace(parts.slice(0, count).join(''));
      if (count < parts.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, enabled, key]);
  // Final answers and consequential states bypass animation in this very render.
  return enabled ? visible.key === key && text.startsWith(visible.text) ? visible.text : '' : text;
}
