import { rows } from './db';
import { currentUser, users } from './auth';
import { starterAvailable } from './starterPool';
export async function ensureIntroduction(userId: string) {
  const introduction = await rows('messages').findOne({ _id: `intro:${userId}`, kind: 'introduction' });
  const user = await currentUser(userId);
  // Count saved accounts only, never anonymous visits or test fixtures. Exclude the viewer.
  const others = await users().countDocuments({ handle: { $type: 'string' }, suspendedAt:null, internalTestAccount: { $ne: true }, _id: { $ne: userId } });
  const join = others ? `Now join ${others.toLocaleString('en-US')} ${others === 1 ? 'other person' : 'others'} on New Drugs.` : 'Be the first to join New Drugs.';
  const closing = user.starterGranted || await starterAvailable(user)
    ? "I've given you a US dollar to start."
    : !user.handle ? '[Create an account](/profile) to get started.' : '';
  const text = `New Drugs, made in New England, is a social experiment that aims to make your life better. Its like Twitter X Bumble BFF X ChatGPT. Share what you’re up to and make plans. Use responsibly.

New Drugs takes no profit. Credits pay for AI at cost. Or use your own [Codex, Claude Code, or other agent](/agents) for **free**.

${closing}${closing ? ' ' : ''}${join}`;
  if (introduction) {
    if (introduction.text !== text) await rows('messages').updateOne({ _id: introduction._id, kind: 'introduction', text: introduction.text }, { $set: { text } });
    return;
  }
  if (await rows('messages').findOne({ userId })) return;
  await rows('messages').updateOne({ _id: `intro:${userId}` }, { $setOnInsert: { userId, role: 'assistant', text, source: 'app', kind: 'introduction', createdAt: new Date().toISOString() } }, { upsert: true });
}
