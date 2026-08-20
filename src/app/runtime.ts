import { createGraphStore, type GraphStore } from "../graph/store";
import { persistSnapshot, loadSnapshot, UnlimigentDb } from "../graph/persist";
import { connectGateway } from "../gateway/project";
import { MockPaseoGateway } from "../gateway/mock";
import type { PaseoGateway } from "../gateway/types";
import { IntentBus } from "../intents/bus";

export interface Runtime {
  store: GraphStore;
  bus: IntentBus;
  gateway: PaseoGateway;
  start(): Promise<void>;
  stop(): void;
  flush(): Promise<void>;
}

export interface RuntimeOptions {
  gateway?: PaseoGateway;
  db?: UnlimigentDb;
  persistDebounceMs?: number;
  saveNow?: (fn: () => Promise<void>) => void;
}

const PERSIST_DEBOUNCE_MS = 1000;

export function createRuntime(options: RuntimeOptions = {}): Runtime {
  const store = createGraphStore();
  const bus = new IntentBus();
  const gateway = options.gateway ?? new MockPaseoGateway();
  const db = options.db ?? new UnlimigentDb();
  const debounceMs = options.persistDebounceMs ?? PERSIST_DEBOUNCE_MS;
  const saveNow = options.saveNow ?? ((fn) => void fn());

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let started = false;

  const scheduleSave = () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveNow(() => persistSnapshot(db, store.getState().snapshot()));
    }, debounceMs);
  };

  return {
    store,
    bus,
    gateway,
    async start() {
      if (started) return;
      started = true;
      const snap = await loadSnapshot(db);
      if (snap) store.getState().restore(snap);
      store.subscribe(scheduleSave);
      connectGateway(store, gateway);
      gateway.start();
    },
    stop() {
      if (!started) return;
      started = false;
      if (saveTimer !== null) clearTimeout(saveTimer);
      gateway.stop();
    },
    async flush() {
      if (saveTimer !== null) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      await persistSnapshot(db, store.getState().snapshot());
    },
  };
}
