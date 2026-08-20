import { createGraphStore, type GraphStore } from "../graph/store";
import { persistSnapshot, loadSnapshot, UnlimigentDb } from "../graph/persist";
import { projectGatewayEvent } from "../gateway/project";
import type { GatewayEvent, PaseoGateway } from "../gateway/types";
import { MockPaseoGateway } from "../gateway/mock";
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
  let centered = false;
  let userMovedCamera = false;

  const scheduleSave = () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveNow(() => persistSnapshot(db, store.getState().snapshot()));
    }, debounceMs);
  };

  /** A restored camera can point at an empty stretch of canvas — after the
   * first snapshot we center on the graph (root server) unless the user has
   * already moved the camera this session. */
  const maybeCenter = () => {
    if (centered || userMovedCamera) return;
    centered = true;
    const state = store.getState();
    const root =
      Object.values(state.nodes).find((n) => n.kind === "server") ??
      Object.values(state.nodes)[0];
    if (root) {
      state.setCamera({ x: root.position.x, y: root.position.y });
    }
  };

  const onGatewayEvent = (event: GatewayEvent) => {
    projectGatewayEvent(store, event);
    if (event.kind === "snapshot") maybeCenter();
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
      bus.onAny((intent) => {
        if (intent.type.startsWith("camera.")) userMovedCamera = true;
      });
      gateway.subscribe(onGatewayEvent);
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
