export type SaveState = "saved" | "pending" | "saving" | "failed";

/** Coalesces typing while preserving write order, including edits made during a save. */
export class SaveQueue<T> {
  private pending = new Map<number, T>();
  private failed = new Map<number, T>();
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private write: (item: T) => Promise<void>,
    private changed: (state: SaveState) => void,
  ) {}

  enqueue(id: number, item: T) {
    this.failed.delete(id);
    this.pending.set(id, item);
    this.changed("pending");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, 600);
  }

  get unsaved() {
    return this.pending.size > 0 || this.failed.size > 0 || this.running !== null;
  }

  discard(id: number) {
    this.pending.delete(id);
    this.failed.delete(id);
    this.changed(
      this.failed.size
        ? "failed"
        : this.running
          ? "saving"
          : this.pending.size
            ? "pending"
            : "saved",
    );
  }

  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    while (this.running || this.pending.size) {
      if (!this.running)
        this.running = this.drain().finally(() => {
          this.running = null;
        });
      await this.running;
    }
    this.changed(this.failed.size ? "failed" : "saved");
    return this.failed.size === 0;
  }

  async retry(): Promise<boolean> {
    for (const [id, item] of this.failed) if (!this.pending.has(id)) this.pending.set(id, item);
    this.failed.clear();
    return this.flush();
  }

  private async drain() {
    while (this.pending.size) {
      const [id, item] = this.pending.entries().next().value!;
      this.pending.delete(id);
      this.changed("saving");
      try {
        await this.write(item);
      } catch {
        if (!this.pending.has(id)) this.failed.set(id, item);
      }
    }
  }
}
