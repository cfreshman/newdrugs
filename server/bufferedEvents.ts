/** Start reading immediately, including while saved state is being reconciled. */
export class BufferedEvents<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private ended = false;
  private error: unknown;
  private wake?: () => void;
  readonly finished: Promise<void>;
  constructor(source: AsyncIterable<T>) {
    this.finished = (async () => {
      try {
        for await (const event of source) {
          if (this.queue.length >= 10000) throw new Error('Provider event consumer fell behind.');
          this.queue.push(event); this.wake?.();
        }
      } catch (error) { this.error = error; }
      finally { this.ended = true; this.wake?.(); }
    })();
  }
  drain() { return this.queue.splice(0); }
  prepend(event: T) { this.queue.unshift(event); }
  async *[Symbol.asyncIterator]() {
    while (true) {
      const event = this.queue.shift();
      if (event !== undefined) { yield event; continue; }
      if (this.ended) { if (this.error) throw this.error; return; }
      await new Promise<void>(resolve => { this.wake = resolve; });
      this.wake = undefined;
    }
  }
}
