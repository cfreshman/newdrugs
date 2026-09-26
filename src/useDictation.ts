import { dictationText } from './dictationText';
import { useCallback, useEffect, useRef, useState } from 'react';

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface Recognition {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function useDictation(draft: string, setDraft: (value: string) => void, onError: (error: string) => void) {
  const [active, setActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const latestText = useRef(draft);
  latestText.current = draft;
  const finalize = useRef<(() => void) | null>(null);
  const finalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const constructor = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
  const stop = useCallback(() => { recognition.current?.stop(); setListening(false); }, []);
  const detach = () => {
    const instance = recognition.current;
    if (instance) { instance.onresult = null; instance.onend = null; instance.onerror = null; instance.abort(); }
    recognition.current = null;
    if (finalTimer.current) clearTimeout(finalTimer.current);
    finalTimer.current = null;
  };
  const cancel = () => {
    detach(); finalize.current = null;
    latestText.current = ''; setDraft(''); setActive(false); setListening(false); setFinishing(false); onError('');
  };
  const start = () => {
    if (active) return;
    if (!constructor) { onError('This browser doesn’t support dictation. You can still type above.'); return; }
    const instance = new constructor();
    recognition.current = instance;
    const prefix = draft.trimEnd();
    instance.continuous = true; instance.interimResults = true; instance.lang = navigator.language || 'en-US';
    instance.onresult = event => {
      const speech = dictationText(Array.from(event.results).map(result => result[0].transcript));
      const text = `${prefix}${prefix && speech ? ' ' : ''}${speech}`.slice(0, 6000);
      latestText.current = text; setDraft(text);
    };
    instance.onerror = event => {
      setListening(false);
      if (event.error === 'aborted') return;
      if (event.error === 'not-allowed') { setActive(false); onError('Microphone access is off. Allow it in your browser to dictate.'); }
      else onError(event.error === 'no-speech' ? 'No speech detected.' : 'Dictation stopped. You can still send or cancel.');
    };
    // Keep both actions visible even if the speech service stops; only cancel or send ends this draft.
    instance.onend = () => { setListening(false); finalize.current?.(); };
    try { instance.start(); setActive(true); setListening(true); onError(''); }
    catch { setActive(false); onError('Couldn’t start the microphone. Please try again.'); }
  };
  const finish = (): Promise<string> => {
    setFinishing(true);
    return new Promise(resolve => {
      const done = () => {
        const text = latestText.current;
        finalize.current = null; detach(); setActive(false); setListening(false); setFinishing(false);
        resolve(text);
      };
      if (!listening || !recognition.current) { done(); return; }
      finalize.current = done;
      finalTimer.current = setTimeout(done, 1200);
      recognition.current.stop();
    });
  };
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      if (finalTimer.current) clearTimeout(finalTimer.current);
      const instance = recognition.current;
      if (instance) { instance.onresult = null; instance.onend = null; instance.onerror = null; instance.abort(); }
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [stop]);
  return { active, listening, finishing, start, stop, cancel, finish };
}
