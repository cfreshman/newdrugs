export const talkReactions={hundred:'💯',fist:'✊',peace:'✌️',wave:'👋',laugh:'😂'} as const;
export type TalkReactionKey=keyof typeof talkReactions;
export const isTalkReactionKey=(value:unknown):value is TalkReactionKey=>typeof value==='string'&&Object.hasOwn(talkReactions,value);
