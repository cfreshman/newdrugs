export function notificationActor(person: { handle?: unknown; name?: unknown } | null | undefined): string {
  return person?.handle ? `@${person.handle}` : typeof person?.name === 'string' && person.name.trim() ? person.name.trim() : 'Someone';
}

export function logNotificationText(kind: 'log_added' | 'log_invitation' | 'log_update', actor: string, title: unknown): string {
  const hangout = typeof title === 'string' && title.trim() ? title.trim() : 'a hangout';
  if (kind === 'log_added') return `${actor} added you to ${hangout}`;
  if (kind === 'log_invitation') return `${actor} invited you to ${hangout}`;
  return `${actor} added to ${hangout}`;
}
