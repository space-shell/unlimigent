import { createStore } from "zustand/vanilla";
import { createEdge, createNode } from "./factory";
import type { GraphEdge, GraphNode, GraphSnapshot, NodeKind, Vec2 } from "./types";

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  /** View rotation in radians. π/4 = isometric orientation. */
  theta?: number;
}

export const ZOOM_MIN = 4;
export const ZOOM_MAX = 256;
export const ZOOM_DEFAULT = 48;
export const THETA_ISO = Math.PI / 4;

export interface GraphState {
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
  focusedNodeId: string | null;
  camera: CameraState;

  addNode: (init: Parameters<typeof createNode>[0]) => GraphNode;
  moveNode: (id: string, position: Vec2) => void;
  setNodeStatus: (id: string, status: GraphNode["status"]) => void;
  setNodeTitle: (id: string, title: string) => void;
  removeNode: (id: string) => void;
  connect: (from: string, to: string, kind: GraphEdge["kind"]) => GraphEdge | null;

  focus: (id: string | null) => void;
  setCamera: (camera: Partial<CameraState>) => void;

  snapshot: () => GraphSnapshot;
  restore: (snap: GraphSnapshot) => void;
  clear: () => void;
}

export function createGraphStore() {
  return createStore<GraphState>()((set, get) => ({
    nodes: {},
    edges: {},
    focusedNodeId: null,
    camera: { x: 0, y: 0, zoom: ZOOM_DEFAULT, theta: THETA_ISO },

    addNode: (init) => {
      const node = createNode(init);
      set((state) => {
        const edges = { ...state.edges };
        if (init.parentId && state.nodes[init.parentId]) {
          const edge = createEdge(init.parentId, node.id, "contains");
          edges[edge.id] = edge;
        }
        return { nodes: { ...state.nodes, [node.id]: node }, edges };
      });
      return node;
    },

    moveNode: (id, position) =>
      set((state) => {
        const node = state.nodes[id];
        if (!node) return state;
        return { nodes: { ...state.nodes, [id]: { ...node, position } } };
      }),

    setNodeStatus: (id, status) =>
      set((state) => {
        const node = state.nodes[id];
        if (!node) return state;
        return { nodes: { ...state.nodes, [id]: { ...node, status } } };
      }),

    setNodeTitle: (id, title) =>
      set((state) => {
        const node = state.nodes[id];
        if (!node) return state;
        return { nodes: { ...state.nodes, [id]: { ...node, title } } };
      }),

    removeNode: (id) =>
      set((state) => {
        if (!state.nodes[id]) return state;
        const nodes = { ...state.nodes };
        const edges: Record<string, GraphEdge> = {};
        for (const [edgeId, edge] of Object.entries(state.edges)) {
          if (edge.from === id || edge.to === id) continue;
          edges[edgeId] = edge;
        }
        for (const node of Object.values(nodes)) {
          if (node.parentId === id) node.parentId = null;
        }
        delete nodes[id];
        const focused =
          state.focusedNodeId === id ? null : state.focusedNodeId;
        return { nodes, edges, focusedNodeId: focused };
      }),

    connect: (from, to, kind) => {
      const state = get();
      if (!state.nodes[from] || !state.nodes[to] || from === to) return null;
      for (const edge of Object.values(state.edges)) {
        if (edge.from === from && edge.to === to && edge.kind === kind) {
          return edge;
        }
      }
      const edge = createEdge(from, to, kind);
      set((s) => ({ edges: { ...s.edges, [edge.id]: edge } }));
      return edge;
    },

    focus: (id) => {
      const state = get();
      if (id !== null && !state.nodes[id]) return;
      set({ focusedNodeId: id });
    },

    setCamera: (camera) => set((s) => ({ camera: { ...s.camera, ...camera } })),

    snapshot: () => {
      const s = get();
      return {
        version: 1,
        nodes: { ...s.nodes },
        edges: { ...s.edges },
      };
    },

    restore: (snap) =>
      set({
        nodes: { ...snap.nodes },
        edges: { ...snap.edges },
        focusedNodeId: null,
      }),

    clear: () => set({ nodes: {}, edges: {}, focusedNodeId: null }),
  }));
}

export type GraphStore = ReturnType<typeof createGraphStore>;

export function childCount(state: GraphState, parentId: string): number {
  let n = 0;
  for (const node of Object.values(state.nodes)) {
    if (node.parentId === parentId) n += 1;
  }
  return n;
}

export function nextFreePosition(
  state: GraphState,
  parentId: string | null,
): Vec2 {
  if (!parentId) return { x: 0, y: 0 };
  const parent = state.nodes[parentId];
  if (!parent) return { x: 0, y: 0 };
  const siblings = Object.values(state.nodes).filter(
    (n) => n.parentId === parentId,
  );
  const i = siblings.length;
  const angle = (i * Math.PI) / 6;
  return {
    x: parent.position.x + Math.cos(angle) * (220 + i * 40),
    y: parent.position.y + Math.sin(angle) * (180 + i * 30),
  };
}

export type { NodeKind };
