export type NodeKind =
  | "server"
  | "project"
  | "workspace"
  | "worktree"
  | "agent"
  | "schedule"
  | "integration";

export type NodeStatus =
  | "idle"
  | "running"
  | "attention"
  | "error"
  | "done"
  | "archived";

export interface Vec2 {
  x: number;
  y: number;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  title: string;
  position: Vec2;
  status: NodeStatus;
  parentId: string | null;
  origin: "user" | "gateway";
  externalId: string | null;
  meta: Record<string, string | number | boolean | null>;
  createdAt: number;
}

export type EdgeKind = "contains" | "spawns" | "links";

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface GraphSnapshot {
  version: 1;
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
  collapsedIds?: string[];
}

export const GRAPH_SNAPSHOT_VERSION = 1;
