import Dexie, { type Table } from "dexie";
import type { GraphSnapshot } from "./types";

const GRAPH_DOC_ID = "default";

interface GraphDoc {
  id: string;
  snapshot: GraphSnapshot;
  savedAt: number;
}

interface MetaDoc {
  key: string;
  value: string;
}

export class UnlimigentDb extends Dexie {
  graphs!: Table<GraphDoc, string>;
  meta!: Table<MetaDoc, string>;

  constructor(name = "unlimigent") {
    super(name);
    this.version(1).stores({
      graphs: "id",
      meta: "key",
    });
  }
}

export async function persistSnapshot(
  db: UnlimigentDb,
  snapshot: GraphSnapshot,
): Promise<void> {
  await db.graphs.put({ id: GRAPH_DOC_ID, snapshot, savedAt: Date.now() });
}

export async function loadSnapshot(
  db: UnlimigentDb,
): Promise<GraphSnapshot | null> {
  const doc = await db.graphs.get(GRAPH_DOC_ID);
  if (!doc) return null;
  if (doc.snapshot.version !== 1) return null;
  return doc.snapshot;
}

export function serializeSnapshot(snapshot: GraphSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export function parseSnapshot(json: string): GraphSnapshot {
  const parsed: unknown = JSON.parse(json);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as GraphSnapshot).version !== 1 ||
    typeof (parsed as GraphSnapshot).nodes !== "object" ||
    typeof (parsed as GraphSnapshot).edges !== "object"
  ) {
    throw new Error("invalid snapshot: expected version 1 graph");
  }
  const snap = parsed as GraphSnapshot;
  if (snap.collapsedIds !== undefined && !Array.isArray(snap.collapsedIds)) {
    throw new Error("invalid snapshot: collapsedIds must be an array");
  }
  return snap;
}
