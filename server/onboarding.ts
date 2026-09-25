import { rows } from './db';
import { currentUser } from './auth';
export async function ensureIntroduction(userId: string) {
  const introduction = await rows('messages').findOne({ _id: `intro:${userId}`, kind: 'introduction' });
  const user = await currentUser(userId);
  const closing = user.starterGranted
    ? "I've given you a US dollar. What would you like to do?"
    : 'What would you like to do?';
  const text = `New Drugs is made in New England to help you meet people nearby. Share what you’re up to and make plans. Ask me to help, or use the launcher to browse people, posts, and messages yourself. Use responsibly.

New Drugs is a social experiment, it takes no profit. Credits pay for AI at cost. Or use your own [Codex, Claude Code, or other agent](/agents) for **free**.

${closing}`;
  if (introduction) {
    if (introduction.text !== text) await rows('messages').updateOne({ _id: introduction._id, kind: 'introduction', text: introduction.text }, { $set: { text } });
    return;
  }
  if (await rows('messages').findOne({ userId })) return;
  await rows('messages').updateOne({ _id: `intro:${userId}` }, { $setOnInsert: { userId, role: 'assistant', text, source: 'app', kind: 'introduction', createdAt: new Date().toISOString() } }, { upsert: true });
}
