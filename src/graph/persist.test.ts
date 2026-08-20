import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createGraphStore } from "./store";
import {
  UnlimigentDb,
  loadSnapshot,
  parseSnapshot,
  persistSnapshot,
  serializeSnapshot,
} from "./persist";

describe("persistence", () => {
  let db: UnlimigentDb;

  beforeEach(async () => {
    db = new UnlimigentDb();
    await db.delete();
    await db.open();
  });

  it("persists and loads a snapshot round-trip", async () => {
    const store = createGraphStore();
    const s = store.getState();
    const server = s.addNode({ kind: "server", title: "srv" });
    s.addNode({ kind: "agent", title: "a", parentId: server.id });
    await persistSnapshot(db, s.snapshot());

    const loaded = await loadSnapshot(db);
    expect(loaded).not.toBeNull();
    expect(Object.keys(loaded!.nodes)).toHaveLength(2);
    expect(Object.keys(loaded!.edges)).toHaveLength(1);
  });

  it("returns null when nothing is stored", async () => {
    expect(await loadSnapshot(db)).toBeNull();
  });

  it("json export/import round-trips", () => {
    const store = createGraphStore();
    const s = store.getState();
    const n = s.addNode({ kind: "server", title: "srv" });
    const json = serializeSnapshot(s.snapshot());
    const parsed = parseSnapshot(json);
    expect(parsed.nodes[n.id]?.title).toBe("srv");
  });

  it("parse rejects malformed json and wrong versions", () => {
    expect(() => parseSnapshot("{nope")).toThrow();
    expect(() => parseSnapshot('{"version":99}')).toThrow(/invalid snapshot/);
  });
});
