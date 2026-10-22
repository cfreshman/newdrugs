import { z } from 'zod';
import { ARTIFACT_COPY_GUIDANCE } from './artifactGuidance';

export const ARTIFACT_MAX_HTML_BYTES = 120_000;
export const ARTIFACT_MAX_DATA_BYTES = 100_000;
export const ARTIFACT_MAX_INSTRUCTION_LENGTH = 16_000;
export const ARTIFACT_MAX_TITLE_LENGTH = 120;
export const ARTIFACT_MAX_INPUT_BYTES = 256_000;
export const ARTIFACT_REQUEST_BYTES = ARTIFACT_MAX_INPUT_BYTES + 8_192;
export const ARTIFACT_MAX_ACCOUNT_COUNT = 200;
export const ARTIFACT_MAX_ACCOUNT_TEXT_BYTES = 8 * 1024 * 1024;
export const ARTIFACT_MAX_ACCOUNT_VERSIONS = 2_000;
export const ARTIFACT_MAX_ASSETS = 10;
export const ARTIFACT_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const ARTIFACT_MAX_PATCHES = 100;
export const ARTIFACT_MAX_PATH_DEPTH = 20;
export const ARTIFACT_MAX_JSON_DEPTH = 40;
export const ARTIFACT_MAX_SOURCE_CHARACTERS = 30_000;
export const ARTIFACT_MAX_MESSAGE_REFERENCES = 3;

const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength;
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
const artifactId = z.uuid().describe('Exact artifact ID returned by operations, attached to this conversation or supplied through a shared bearer URL. Management operations still require ownership.');
const positiveRevision = z.number().int().positive().describe('Exact current artifact revision. Re-read after a conflict; never silently overwrite newer content.');
const contentRevision = z.number().int().positive().describe('Immutable content version. Omit for the latest artifact. Use the contentRevision from a chat presentation to read that exact saved version.');
const readVersion = z.union([contentRevision, z.literal('legacy')]).describe('Exact immutable content version, or legacy for the first available source frozen during migration. Omit for the latest artifact.');
export type ArtifactVersionSelector = z.infer<typeof readVersion>;
export const artifactPresentationSchema = z.enum(['inline', 'link']).describe('Deliver this result inline in the primary assistant bubble or as a link opening its expanded viewer. External and automation callers receive a descriptor, without permission to insert primary-chat messages.');
export type ArtifactPresentation = z.infer<typeof artifactPresentationSchema>;
export const artifactTitleSchema = z.string().trim().min(1).max(ARTIFACT_MAX_TITLE_LENGTH);
export const artifactBodyHtmlSchema = z.string().trim().min(1).max(ARTIFACT_MAX_HTML_BYTES).superRefine((value, context) => {
  if (utf8Bytes(value) > ARTIFACT_MAX_HTML_BYTES) context.addIssue({ code: 'custom', message: `Artifact HTML cannot exceed ${ARTIFACT_MAX_HTML_BYTES} UTF-8 bytes.` });
}).describe(`Raw HTML document or body fragment without Markdown fences, at most 120000 UTF-8 bytes. Inline CSS and JavaScript are allowed. Optional data is available as globalThis.data before scripts execute. Use ordinary HTML image URLs, links, styles and scripts. Optional file mappings also support src="nd-asset:ID".\n\n${ARTIFACT_COPY_GUIDANCE}`);
export const artifactRefreshInstructionSchema = z.string().trim().min(1).max(ARTIFACT_MAX_INSTRUCTION_LENGTH).describe('Reusable target-neutral refresh instructions preserving the original request, expected data shape, retrieval guidance and missing-data handling. Do not embed an artifact ID, changing account facts or a schedule. Pure HTML may have instructions explicitly refreshing its HTML content.');

/** JSON values are data, with no lossy coercion or prototype-bearing objects. */
function jsonProblem(value: unknown): string | undefined {
  const pending = [{ value, depth: 0 }], seen = new Set<object>();
  while (pending.length) {
    const item = pending.pop()!;
    if (item.depth > ARTIFACT_MAX_JSON_DEPTH) return 'Artifact JSON is nested too deeply.';
    if (item.value === null || typeof item.value === 'string' || typeof item.value === 'boolean') continue;
    if (typeof item.value === 'number') { if (Number.isFinite(item.value)) continue; return 'Artifact JSON numbers must be finite.'; }
    if (typeof item.value !== 'object') return 'Use JSON values without undefined, functions or other non-JSON values.';
    if (seen.has(item.value)) return 'Artifact JSON cannot contain cycles or repeated object references.';
    seen.add(item.value);
    if (!Array.isArray(item.value) && ![Object.prototype, null].includes(Object.getPrototypeOf(item.value))) return 'Artifact data must contain plain JSON objects.';
    for (const [key, child] of Object.entries(item.value)) {
      if (forbiddenKeys.has(key)) return 'Artifact JSON contains a forbidden prototype key.';
      pending.push({ value: child, depth: item.depth + 1 });
    }
    if (Array.isArray(item.value) && Object.keys(item.value).length !== item.value.length) return 'Artifact JSON arrays cannot contain empty slots or extra properties.';
  }
}

// Validate the original object before Zod's record parser strips __proto__.
// A validation pipe retains a describable JSON-object contract without coercion.
const artifactJsonSchema = z.unknown().superRefine((value, context) => {
  const problem = jsonProblem(value);
  if (problem) { context.addIssue({ code: 'custom', message: problem }); return; }
  if (utf8Bytes(JSON.stringify(value)) > ARTIFACT_MAX_DATA_BYTES) context.addIssue({ code: 'custom', message: `Artifact data cannot exceed ${ARTIFACT_MAX_DATA_BYTES} UTF-8 bytes.` });
});
export const artifactDataSchema = artifactJsonSchema.pipe(z.record(z.string(), z.unknown())).describe('One JSON object, at most 100000 UTF-8 bytes when serialized. Put changing values here when the HTML uses globalThis.data. Pure HTML can omit this field.');
export type ArtifactData = z.infer<typeof artifactDataSchema>;
const patchValue = z.unknown().superRefine((value, context) => {
  const problem = jsonProblem(value);
  if (problem) context.addIssue({ code: 'custom', message: problem });
});
const pathSegment = z.union([z.string().min(1).max(120).refine(key => !forbiddenKeys.has(key), 'Prototype keys cannot be patched.'), z.number().int().min(0).max(10_000)]);
const path = z.array(pathSegment).min(1).max(ARTIFACT_MAX_PATH_DEPTH);
export const artifactDataPatchSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('set'), path, value: patchValue }),
  z.strictObject({ op: z.literal('remove'), path }),
]);
export type ArtifactDataPatch = z.infer<typeof artifactDataPatchSchema>;
export const artifactAssetSchema = z.strictObject({ id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).describe('Image placeholder ID used in HTML as src="nd-asset:ID".'), fileId: z.uuid().describe('Existing readable PNG, JPEG or WebP file ID, including Log photos. This optional mapping is not required for ordinary image URLs.') });
export type ArtifactAsset = z.infer<typeof artifactAssetSchema>;
const assets = z.array(artifactAssetSchema).max(ARTIFACT_MAX_ASSETS).refine(value => new Set(value.map(asset => asset.id)).size === value.length, 'Artifact image IDs must be unique.');
export const artifactProducerSchema = z.strictObject({ kind: z.enum(['hosted', 'automation', 'external', 'browser']), name: z.string().max(160), id: z.string().max(200).optional() });
export type ArtifactProducer = z.infer<typeof artifactProducerSchema>;
export const artifactPresentationReferenceSchema = z.strictObject({ artifactId, presentation: artifactPresentationSchema, presentedRevision: positiveRevision, contentRevision: contentRevision.optional().describe('Pinned immutable content version. Missing only on legacy references, which resolve the first available source frozen during migration without fabricating earlier history.'), title: z.string().min(1).max(ARTIFACT_MAX_TITLE_LENGTH) });
export type ArtifactPresentationReference = z.infer<typeof artifactPresentationReferenceSchema>;
export const artifactPresentationReferencesSchema = z.array(artifactPresentationReferenceSchema).max(ARTIFACT_MAX_MESSAGE_REFERENCES);

export const artifactSummarySchema = z.strictObject({
  id: artifactId, title: z.string().min(1).max(ARTIFACT_MAX_TITLE_LENGTH), ephemeral: z.boolean(), revision: positiveRevision, contentRevision: positiveRevision,
  hasRefreshInstruction: z.boolean(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), contentUpdatedAt: z.iso.datetime(), dataUpdatedAt: z.iso.datetime(), producer: artifactProducerSchema,
});
export type ArtifactSummary = z.infer<typeof artifactSummarySchema>;
export const artifactDetailSchema = artifactSummarySchema.extend({ bodyHtml: z.string(), data: artifactDataSchema, refreshInstruction: z.string().nullable(), assets });
export type ArtifactDetail = z.infer<typeof artifactDetailSchema>;
/** Possession of the artifact URL grants its display, never account management. */
export const publicArtifactAssetSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), url: z.string().regex(/^\/api\/artifacts\/[0-9a-f-]{36}\/assets\/[A-Za-z0-9_-]{1,128}(?:\?version=[1-9][0-9]*)?$/),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']), bytes: z.number().int().positive().max(ARTIFACT_MAX_IMAGE_BYTES), sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export const publicArtifactSchema = z.strictObject({
  id: artifactId, title: z.string().min(1).max(ARTIFACT_MAX_TITLE_LENGTH), bodyHtml: z.string(), data: artifactDataSchema, assets: z.array(publicArtifactAssetSchema).max(ARTIFACT_MAX_ASSETS),
  revision: positiveRevision, contentRevision: positiveRevision, updatedAt: z.iso.datetime(), contentUpdatedAt: z.iso.datetime(),
});
export type PublicArtifactDetail = z.infer<typeof publicArtifactSchema>;
export const publicArtifactSummarySchema = publicArtifactSchema.pick({ id: true, title: true });

export const artifactListInput = z.strictObject({ limit: z.number().int().min(1).max(50).default(20), cursor: z.string().max(600).optional(), includeEphemeral: z.boolean().default(false) });
export const artifactGetInput = z.strictObject({ artifactId, contentRevision: readVersion.optional(), section: z.enum(['all', 'bodyHtml', 'data', 'refreshInstruction']).default('all'), offset: z.number().int().min(0).max(ARTIFACT_MAX_HTML_BYTES).default(0), length: z.number().int().min(1).max(ARTIFACT_MAX_SOURCE_CHARACTERS).default(ARTIFACT_MAX_SOURCE_CHARACTERS) });
export const artifactViewInput = z.strictObject({ artifactId: z.uuid().describe('The long unguessable artifact ID from its exact URL. Possession grants render-only access, never owner management or refresh instructions.'), contentRevision: readVersion.optional() });
const ephemeral = z.boolean().describe('Persist normally but omit from the ordinary Artifacts list. This changes only list visibility, without expiry or different permissions, quotas or cleanup.');
export const artifactCreateInput = z.strictObject({ title: artifactTitleSchema, bodyHtml: artifactBodyHtmlSchema, data: artifactDataSchema.default({}), refreshInstruction: artifactRefreshInstructionSchema.optional(), assets: assets.default([]), ephemeral: ephemeral.default(false) });
export const artifactUpdateInput = z.strictObject({ artifactId, revision: positiveRevision, title: artifactTitleSchema.optional(), bodyHtml: artifactBodyHtmlSchema.optional(), data: artifactDataSchema.optional().describe('Replace the complete JSON data object. Omit to preserve it; cannot be combined with dataPatches.'), dataPatches: z.array(artifactDataPatchSchema).min(1).max(ARTIFACT_MAX_PATCHES).optional().describe('At most 100 set/remove path patches, each at most 20 segments. Array set may replace or append exactly at length; remove compacts the array. Cannot be combined with complete data replacement.'), refreshInstruction: artifactRefreshInstructionSchema.nullable().optional(), assets: assets.optional().describe('Complete replacement of the attached image list. Earlier chat versions retain their own declared images, subject to current upload authorization. [] clears the latest version without deleting uploads.'), ephemeral: ephemeral.optional() }).superRefine((value, context) => {
  if (value.data !== undefined && value.dataPatches !== undefined) context.addIssue({ code: 'custom', message: 'Choose complete data replacement or data patches, not both.' });
  if (['title', 'bodyHtml', 'data', 'dataPatches', 'refreshInstruction', 'assets', 'ephemeral'].every(key => value[key as keyof typeof value] === undefined)) context.addIssue({ code: 'custom', message: 'Choose at least one artifact field to update.' });
});
export const artifactPresentInput = z.strictObject({ artifactId: artifactViewInput.shape.artifactId, contentRevision: readVersion.optional(), presentation: artifactPresentationSchema.default('link') });
export const artifactDeleteInput = z.strictObject({ artifactId, revision: positiveRevision });
export type ArtifactCreateInput = z.infer<typeof artifactCreateInput>;
export type ArtifactUpdateInput = z.infer<typeof artifactUpdateInput>;
export const artifactListOutput = z.strictObject({ items: z.array(artifactSummarySchema).max(50), nextCursor: z.string().nullable() });
export const artifactSourceSchema = z.strictObject({ section: z.enum(['bodyHtml', 'data', 'refreshInstruction']), offset: z.number().int().nonnegative(), totalCharacters: z.number().int().nonnegative(), content: z.string().max(ARTIFACT_MAX_SOURCE_CHARACTERS), nextOffset: z.number().int().nonnegative().nullable() });
export const artifactGetOutput = z.union([artifactDetailSchema, artifactSummarySchema.extend({ source: artifactSourceSchema })]);
export const artifactViewOutput = publicArtifactSchema;
export const artifactCreateOutput = artifactSummarySchema;
export const artifactUpdateOutput = artifactSummarySchema;
export const artifactPresentOutput = artifactPresentationReferenceSchema;
export const artifactDeleteOutput = z.strictObject({ deleted: z.literal(true), artifactId });

export const artifactInputs = { 'artifacts.list': artifactListInput, 'artifacts.get': artifactGetInput, 'artifacts.view': artifactViewInput, 'artifacts.create': artifactCreateInput, 'artifacts.update': artifactUpdateInput, 'artifacts.present': artifactPresentInput, 'artifacts.delete': artifactDeleteInput } as const;
export const artifactOutputs = { 'artifacts.list': artifactListOutput, 'artifacts.get': artifactGetOutput, 'artifacts.view': artifactViewOutput, 'artifacts.create': artifactCreateOutput, 'artifacts.update': artifactUpdateOutput, 'artifacts.present': artifactPresentOutput, 'artifacts.delete': artifactDeleteOutput } as const;
