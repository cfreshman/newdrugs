import { expect, it } from 'vitest';
import { dictationText } from '../src/dictationText';
import { cleanDestinationContext } from '../shared/navigation';
it('keeps interim and final speech spacing identical across chunk boundaries', () => {
  expect(dictationText(['check out ', '  this', ' plant'])).toBe('check out this plant');
  expect(dictationText(['check out this plant'])).toBe('check out this plant');
  expect(dictationText(['hello  there ', ', next sentence.'])).toBe('hello there, next sentence.');
});
it('discards legacy null navigation optionals without discarding a real search', () => {
  expect(cleanDestinationContext({ query: null, radiusMiles: null } as never)).toEqual({});
  expect(cleanDestinationContext({ query: 'hiking', radiusMiles: 25, scope: 'nearby' })).toEqual({ query: 'hiking', radiusMiles: 25, scope: 'nearby' });
});
