export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function requireValue<T>(value: T | null | undefined, message = 'Not found.'): T {
  if (value === null || value === undefined) throw new AppError(404, 'not_found', message);
  return value;
}
