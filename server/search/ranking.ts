import { createHash } from 'node:crypto';

const stop = new Set(['a','an','and','or','the','to','of','in','on','for','with','at','by','is','are','be','me','my','i','who','someone','people','person','find','nearby','about','into','that','this','would','like']);
export const hashText = (text: string) => createHash('sha256').update(text).digest('hex');
export function words(text: string) { return (text.normalize('NFKC').toLocaleLowerCase('en-US').match(/[\p{L}\p{N}_]+/gu) || []).filter(word => word.length > 1 && !stop.has(word)); }
export function termCounts(text: string) { const counts: Record<string, number> = Object.create(null); for (const word of words(text)) counts[word] = (counts[word] || 0) + 1; return counts; }
export function normalize(vector: number[]) { const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)); if (!Number.isFinite(norm) || !norm) throw new Error('Invalid semantic vector'); return vector.map(value => value / norm); }
export function dot(a: number[], b: number[]) { if (a.length !== b.length) return 0; let value = 0; for (let i = 0; i < a.length; i++) value += a[i] * b[i]; return value; }
export function bm25(query: string[], documents: { id: string; terms: Record<string, number> }[]) {
  const unique = [...new Set(query)], lengths = documents.map(doc => Object.values(doc.terms).reduce((sum, count) => sum + count, 0));
  const average = lengths.reduce((sum, length) => sum + length, 0) / Math.max(1, lengths.length) || 1;
  const frequency = new Map(unique.map(word => [word, documents.filter(doc => doc.terms[word]).length]));
  return documents.map((document, index) => ({ id: document.id, score: unique.reduce((score, word) => {
    const tf = document.terms[word] || 0; if (!tf) return score;
    const idf = Math.log(1 + (documents.length - frequency.get(word)! + .5) / (frequency.get(word)! + .5));
    return score + idf * tf * 2.2 / (tf + 1.2 * (.25 + .75 * lengths[index] / average));
  }, 0) })).filter(item => item.score > 0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
export function fuse(lanes: { id: string; score: number }[][], weights: number[] = []) {
  const scores = new Map<string, number>();
  lanes.forEach((lane, laneIndex) => lane.forEach((item, rank) => scores.set(item.id, (scores.get(item.id) || 0) + (weights[laneIndex] ?? 1) / (60 + rank + 1))));
  return [...scores].map(([id, score]) => ({ id, score })).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
export function feedbackVector(query: number[], positive: number[][], negative: number[][]) {
  const result = [...query];
  for (let i=0;i<result.length;i++) result[i] += .65 * positive.reduce((sum, vector)=>sum+vector[i],0)/Math.max(1,positive.length) - .35 * negative.reduce((sum,vector)=>sum+vector[i],0)/Math.max(1,negative.length);
  return normalize(result);
}
export function diversify<T extends { id: string; score: number; ownerId: string; vector?: number[] }>(ranked: T[], limit: number, strength = .15) {
  const remaining = [...ranked], selected: T[] = [], maximum = ranked[0]?.score || 1;
  while (remaining.length && selected.length < limit) {
    let best = 0, bestScore = -Infinity;
    remaining.forEach((candidate, index) => {
      const repetition = selected.reduce((max, previous) => Math.max(max, candidate.ownerId === previous.ownerId ? 1 : candidate.vector && previous.vector ? Math.max(0, dot(candidate.vector, previous.vector)) : 0), 0);
      const score = (1-strength) * candidate.score / maximum - strength * repetition;
      if (score > bestScore) { best = index; bestScore = score; }
    });
    selected.push(remaining.splice(best, 1)[0]);
  }
  return selected;
}
/** Fuse candidate ranks, then retain semantic score separation. A single generic
 * word must not double a weak result's score merely by appearing in both lanes. */
export function hybridRank(dense: {id:string;score:number}[], lexical: {id:string;score:number}[]) {
  const denseScores=new Map(dense.map(item=>[item.id,item.score])),lexicalScores=new Map(lexical.map(item=>[item.id,item.score]));
  return fuse([dense,lexical]).map(item=>{const semantic=Math.max(0,denseScores.get(item.id)||0),lexical=lexicalScores.get(item.id)||0;
    return {id:item.id,score:.85*semantic+.12*lexical/(lexical+3)+.03*item.score/(2/61)};
  }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}

/** Trim only the weakest unsupported semantic neighbors; lexical evidence still qualifies. */
export function semanticCandidate(score: number, lexical = 0) { return score >= (lexical > 0 ? .2 : .23); }
