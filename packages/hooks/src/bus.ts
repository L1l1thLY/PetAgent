import type { HookEvent, HookSubscriber } from "./types.js";

export class HookBus {
  private subscribers: HookSubscriber[] = [];

  register(sub: HookSubscriber): void {
    this.subscribers.push(sub);
  }

  unregister(name: string): void {
    this.subscribers = this.subscribers.filter((s) => s.name !== name);
  }

  list(): ReadonlyArray<HookSubscriber> {
    return this.subscribers;
  }

  async publish(event: HookEvent): Promise<void> {
    const matches = this.subscribers.filter((s) => !s.filter || s.filter(event));
    await Promise.all(
      matches.map(async (s) => {
        try {
          await s.handle(event);
        } catch (err) {
          console.error(`[hook:${s.name}] error:`, err);
        }
      }),
    );
  }
}

export const globalHookBus = new HookBus();
