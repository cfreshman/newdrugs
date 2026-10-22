import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  ARTIFACT_MAX_HTML_BYTES, ARTIFACT_MAX_MESSAGE_REFERENCES, ARTIFACT_MAX_PATH_DEPTH,
  artifactCreateInput, artifactDataSchema, artifactInputs, artifactOutputs, artifactPresentationReferencesSchema, artifactUpdateInput,
} from '../shared/artifacts';

describe('artifact contracts', () => {
  it('supports plain HTML and independent presentation/list visibility choices', () => {
    expect(artifactCreateInput.parse({ title: 'A picture', bodyHtml: '<svg viewBox="0 0 10 10"><circle r="2"/></svg>' })).toMatchObject({ data: {}, assets: [], ephemeral: false });
    for (const ephemeral of [true, false]) expect(artifactCreateInput.parse({ title: 'A graph', bodyHtml: '<main>Graph</main>', ephemeral })).toMatchObject({ ephemeral });
    expect(artifactCreateInput.safeParse({ title: 'A graph', bodyHtml: '<main>Graph</main>', presentation: 'inline' }).success).toBe(false);
    for (const presentation of ['inline', 'link']) expect(artifactInputs['artifacts.present'].parse({ artifactId: randomUUID(), presentation })).toMatchObject({ presentation });
    expect(artifactInputs['artifacts.present'].parse({ artifactId: randomUUID() }).presentation).toBe('link');
  });

  it('keeps strict patch/update semantics and blocks prototype paths', () => {
    const base = { artifactId: randomUUID(), revision: 1 };
    expect(artifactUpdateInput.safeParse(base).success).toBe(false);
    expect(artifactUpdateInput.safeParse({ ...base, data: {}, dataPatches: [{ op: 'remove', path: ['old'] }] }).success).toBe(false);
    for (const key of ['__proto__', 'constructor', 'prototype']) expect(artifactUpdateInput.safeParse({ ...base, dataPatches: [{ op: 'set', path: [key, 'x'], value: true }] }).success).toBe(false);
    expect(artifactUpdateInput.safeParse({ ...base, dataPatches: [{ op: 'set', path: Array(ARTIFACT_MAX_PATH_DEPTH + 1).fill('x'), value: true }] }).success).toBe(false);
    expect(artifactUpdateInput.safeParse({ ...base, dataPatches: [{ op: 'set', path: ['missing'] }] }).success).toBe(false);
    expect(artifactUpdateInput.parse({ ...base, refreshInstruction: null, ephemeral: false })).toMatchObject({ refreshInstruction: null, ephemeral: false });
  });

  it('rejects non-JSON, cyclic, prototype-bearing and excessively deep data', () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    for (const invalid of [[], null, { bad: undefined }, { bad: NaN }, { bad: Infinity }, { bad: 2n }, { bad: new Date() }, cyclic, JSON.parse('{"__proto__":{"polluted":true}}'), JSON.parse('{"nested":{"__proto__":{"polluted":true}}}')]) expect(artifactDataSchema.safeParse(invalid).success).toBe(false);
    let deep: Record<string, unknown> = {}; for (let index = 0; index < 45; index++) deep = { child: deep };
    expect(artifactDataSchema.safeParse(deep).success).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('measures UTF-8 bytes and accepts inner HTML without treating data as markup', () => {
    const text = '</script><script>globalThis.bad=true</script>\u2028\u2029&<>"';
    expect(artifactDataSchema.parse({ text })).toEqual({ text });
    const bodyHtml = '<p>' + 'x'.repeat(ARTIFACT_MAX_HTML_BYTES - 7) + '</p>';
    expect(artifactCreateInput.safeParse({ title: 'At the limit', bodyHtml }).success).toBe(true);
    expect(artifactCreateInput.safeParse({ title: 'Too many bytes', bodyHtml: '<p>' + '😀'.repeat(30_000) + '</p>' }).success).toBe(false);
    for (const wrapper of ['<!doctype html><p>x</p>', '<html><body>x</body></html>', '<base href="https://example.org">', '<meta http-equiv="Content-Security-Policy" content="default-src *">']) expect(artifactCreateInput.safeParse({ title: 'HTML document', bodyHtml: wrapper }).success).toBe(true);
    expect(artifactCreateInput.safeParse({ title: 'Data limit', bodyHtml: '<p>x</p>', data: { text: 'x'.repeat(100_000) } }).success).toBe(false);
  });

  it('keeps presentation references small and every schema describable by the shared catalog', () => {
    const reference = { artifactId: randomUUID(), presentation: 'inline', presentedRevision: 1, title: 'Graph' };
    expect(artifactPresentationReferencesSchema.safeParse(Array(ARTIFACT_MAX_MESSAGE_REFERENCES).fill(reference)).success).toBe(true);
    expect(artifactPresentationReferencesSchema.safeParse(Array(ARTIFACT_MAX_MESSAGE_REFERENCES + 1).fill(reference)).success).toBe(false);
    expect(artifactPresentationReferencesSchema.safeParse([{ ...reference, bodyHtml: '<script></script>' }]).success).toBe(false);
    for (const schema of [...Object.values(artifactInputs), ...Object.values(artifactOutputs)]) expect(() => z.toJSONSchema(schema)).not.toThrow();
  });

  it('separates immutable numeric references from latest and legacy read selectors', () => {
    const artifactId = randomUUID(), reference = { artifactId, presentation: 'inline', presentedRevision: 4, title: 'Graph' };
    expect(artifactPresentationReferencesSchema.parse([reference])[0]).not.toHaveProperty('contentRevision');
    expect(artifactPresentationReferencesSchema.parse([{ ...reference, contentRevision: 2 }])[0].contentRevision).toBe(2);
    expect(artifactPresentationReferencesSchema.safeParse([{ ...reference, contentRevision: 'legacy' }]).success).toBe(false);
    for (const operation of ['artifacts.get', 'artifacts.view', 'artifacts.present'] as const) {
      for (const contentRevision of [undefined, 2, 'legacy']) expect(artifactInputs[operation].safeParse({ artifactId, ...(contentRevision === undefined ? {} : { contentRevision }) }).success).toBe(true);
      for (const contentRevision of [0, -1, 1.5, 'latest']) expect(artifactInputs[operation].safeParse({ artifactId, contentRevision }).success).toBe(false);
    }
    expect(artifactUpdateInput.safeParse({ artifactId, revision: 1, presentation: 'inline' }).success).toBe(false);
    expect(artifactUpdateInput.safeParse({ artifactId, revision: 1, data: {}, presentation: 'inline' }).success).toBe(false);
    expect(artifactUpdateInput.safeParse({ artifactId, revision: 1, data: {} }).success).toBe(true);
  });
});
