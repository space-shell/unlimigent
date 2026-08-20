import type { Intent, IntentType } from "./types";

export type IntentHandler = (intent: Intent) => void;

export class IntentBus {
  private handlers = new Map<IntentType, Set<IntentHandler>>();
  private anyHandlers = new Set<IntentHandler>();
  private seq = 0;
  private log: Intent[] = [];

  on(type: IntentType, handler: IntentHandler): () => void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler);
    this.handlers.set(type, set);
    return () => set.delete(handler);
  }

  onAny(handler: IntentHandler): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  dispatch(intent: Intent): void {
    this.seq += 1;
    this.log.push(intent);
    if (this.log.length > 200) this.log.shift();
    for (const h of this.handlers.get(intent.type) ?? []) h(intent);
    for (const h of this.anyHandlers) h(intent);
  }

  recent(): readonly Intent[] {
    return this.log;
  }
}
