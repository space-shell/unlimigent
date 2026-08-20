import type { EdgeKind, GraphEdge, GraphNode, NodeKind } from "./types";

let counter = 0;

export function makeId(prefix: string): string {
  counter += 1;
  const rand =
    globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 6) ??
    Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export function createNode(init: {
  kind: NodeKind;
  title: string;
  position?: { x: number; y: number };
  parentId?: string | null;
  origin?: "user" | "gateway";
  externalId?: string | null;
  status?: GraphNode["status"];
  meta?: GraphNode["meta"];
}): GraphNode {
  return {
    id: makeId(init.kind.slice(0, 3)),
    kind: init.kind,
    title: init.title,
    position: init.position ?? { x: 0, y: 0 },
    status: init.status ?? "idle",
    parentId: init.parentId ?? null,
    origin: init.origin ?? "user",
    externalId: init.externalId ?? null,
    meta: init.meta ?? {},
    createdAt: Date.now(),
  };
}

export function createEdge(from: string, to: string, kind: EdgeKind): GraphEdge {
  return { id: makeId("edg"), from, to, kind };
}
