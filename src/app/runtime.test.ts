import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createRuntime } from "./runtime";
import { MockPaseoGateway } from "../gateway/mock";
import { UnlimigentDb } from "../graph/persist";

function manualClock() {
  let fn: (() => void) | null = null;
  return {
    setInterval: (f: () => void, _ms: number) => {
      fn = f;
      return 1;
    },
    clearInterval: () => {
      fn = null;
    },
    tick: () => fn?.(),
  };
}

describe("runtime", () => {
  it("wires gateway events into the store", async () => {
    const clock = manualClock();
    const gateway = new MockPaseoGateway({ clock: clock as never });
    const runtime = createRuntime({ gateway, db: new UnlimigentDb() });
    await runtime.start();
    expect(Object.keys(runtime.store.getState().nodes).length).toBeGreaterThan(0);
    clock.tick();
    runtime.stop();
  });

  it("flush persists the current graph", async () => {
    const clock = manualClock();
    const gateway = new MockPaseoGateway({ clock: clock as never });
    const db = new UnlimigentDb();
    const runtime = createRuntime({ gateway, db });
    await runtime.start();
    await runtime.flush();
    const doc = await db.graphs.get("default");
    expect(doc).not.toBeUndefined();
    expect(Object.keys(doc!.snapshot.nodes).length).toBeGreaterThan(0);
    runtime.stop();
  });

  it("debounced save fires after the window", async () => {
    const clock = manualClock();
    const gateway = new MockPaseoGateway({ clock: clock as never });
    let saves = 0;
    const runtime = createRuntime({
      gateway,
      db: new UnlimigentDb(),
      persistDebounceMs: 20,
      saveNow: (fn) => {
        saves += 1;
        void fn();
      },
    });
    await runtime.start();
    saves = 0;
    runtime.store.getState().addNode({ kind: "server", title: "x" });
    expect(saves).toBe(0);
    await new Promise((r) => setTimeout(r, 60));
    expect(saves).toBe(1);
    runtime.stop();
  });

  it("restores a persisted graph on start", async () => {
    const clock = manualClock();
    const gateway = new MockPaseoGateway({ clock: clock as never });
    const db = new UnlimigentDb();
    const first = createRuntime({ gateway, db });
    await first.start();
    first.store.getState().addNode({ kind: "schedule", title: "cron" });
    await first.flush();
    first.stop();

    const second = createRuntime({ gateway, db });
    await second.start();
    const titles = Object.values(second.store.getState().nodes).map((n) => n.title);
    expect(titles).toContain("cron");
    second.stop();
  });
});
