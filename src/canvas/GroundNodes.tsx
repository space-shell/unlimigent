import { useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { useStore } from "zustand";
import type { Runtime } from "../app/runtime";
import type { GraphNode } from "../graph/types";
import { snapToGrid } from "../graph/arrange";
import { screenDeltaToWorld, worldToScreen, type Viewport } from "./cameraMath";
import { tokens, type Token } from "../tokens";

const FONT = "/unlimigent/fonts/JetBrainsMono-Regular.ttf";

/** Plate footprint in world units (keep in sync with ELK_NODE_W/H). */
export const PLATE_W = 4;
export const PLATE_H = 1.5;

const HOLD_MS = 600;
const DRAG_SLOP_PX = 6;

const STATUS_TOKEN: Record<GraphNode["status"], Token> = {
  idle: "inkFaint",
  running: "indigo",
  attention: "ochre",
  error: "terracotta",
  done: "moss",
  archived: "plum",
};

function lodFor(zoom: number): "dot" | "compact" | "full" | "detail" {
  if (zoom >= 90) return "detail";
  if (zoom >= 28) return "full";
  if (zoom >= 12) return "compact";
  return "dot";
}

function subLine(node: GraphNode): string {
  switch (node.kind) {
    case "agent":
      return [node.meta.provider, node.meta.model].filter(Boolean).join(" · ") || "agent";
    case "workspace":
      return String(node.meta.path ?? node.meta.branch ?? "workspace");
    case "worktree":
      return String(node.meta.worktree ?? node.meta.branch ?? "worktree");
    case "server":
      return "daemon";
    default:
      return node.kind;
  }
}

function metaRows(node: GraphNode): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const push = (label: string, v: unknown) => {
    if (v !== null && v !== undefined && v !== "" && v !== false) {
      rows.push([label, String(v)]);
    }
  };
  push("branch", node.meta.branch);
  push("path", node.meta.path);
  push("git", node.meta.git);
  push("pr", node.meta.pr);
  push("diff", node.meta.diff);
  push("provider", node.meta.provider);
  push("model", node.meta.model);
  push("mode", node.meta.mode);
  push("permissions", node.meta.permissions);
  push("attention", node.meta.attention);
  return rows.slice(0, 6);
}

function descendantCount(store: Runtime["store"], id: string): number {
  const nodes = store.getState().nodes;
  let n = 0;
  const walk = (parentId: string) => {
    for (const node of Object.values(nodes) as GraphNode[]) {
      if (node.parentId === parentId) {
        n += 1;
        walk(node.id);
      }
    }
  };
  walk(id);
  return n;
}

interface HoldState {
  active: boolean;
  startAt: number;
  fill: number;
  done: boolean;
}

function GroundPlate({
  node,
  lod,
  focused,
  runtime,
}: {
  node: GraphNode;
  lod: "dot" | "compact" | "full" | "detail";
  focused: boolean;
  runtime: Runtime;
}) {
  const collapsed = useStore(runtime.store, (s) => s.collapsedIds.has(node.id));
  const hiddenCount = descendantCount(runtime.store, node.id);
  const accent = tokens[STATUS_TOKEN[node.status]];

  const holdRef = useRef<HoldState>({ active: false, startAt: 0, fill: 0, done: false });
  const [fill, setFill] = useState(0);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: { x: number; y: number };
    moved: boolean;
  } | null>(null);

  useFrame(() => {
    const hold = holdRef.current;
    if (!hold.active) {
      if (fill !== 0 && !hold.done) setFill(0);
      return;
    }
    const t = Math.min(1, (performance.now() - hold.startAt) / HOLD_MS);
    setFill(t);
    if (t >= 1 && !hold.done) {
      hold.done = true;
      hold.active = false;
      runtime.store.getState().toggleCollapsed(node.id);
      setFill(0);
    }
  });

  const cancelHold = () => {
    holdRef.current.active = false;
    holdRef.current.done = false;
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) {
      // snap to grid on release
      const p = runtime.store.getState().nodes[node.id]?.position;
      if (p) {
        runtime.store.getState().moveNode(node.id, {
          x: snapToGrid(p.x),
          y: snapToGrid(p.y),
        });
      }
    }
    return drag;
  };

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.nativeEvent.button !== undefined && e.nativeEvent.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    holdRef.current = { active: true, startAt: performance.now(), fill: 0, done: false };
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.nativeEvent.clientX,
      startY: e.nativeEvent.clientY,
      origin: { ...node.position },
      moved: false,
    };
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.stopPropagation();
    const dxPx = e.nativeEvent.clientX - drag.startX;
    const dyPx = e.nativeEvent.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dxPx, dyPx) > DRAG_SLOP_PX) {
      drag.moved = true;
      cancelHold();
      runtime.store.getState().pinNode(node.id, true);
    }
    if (drag.moved) {
      const state = runtime.store.getState();
      const d = screenDeltaToWorld(dxPx, dyPx, state.camera);
      state.moveNode(node.id, {
        x: drag.origin.x + d.x,
        y: drag.origin.y + d.y,
      });
    }
  };

  const onUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const drag = endDrag();
    const wasHolding = holdRef.current.active || holdRef.current.done;
    cancelHold();
    if (drag && !drag.moved && !wasHolding) {
      runtime.bus.dispatch({ type: "node.activate", source: "touch", id: node.id });
    }
  };

  const textPad = 0.28;
  const borderW = focused ? PLATE_W + 0.24 : PLATE_W + 0.12;
  const borderH = focused ? PLATE_H + 0.24 : PLATE_H + 0.12;

  const detailRows = lod === "detail" ? metaRows(node) : [];

  return (
    <group
      position={[node.position.x, node.position.y, 0.02]}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        cancelHold();
        endDrag();
      }}
    >
      {/* hairline border plate */}
      <mesh position={[0, 0, -0.01]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[borderW, borderH]} />
        <meshBasicMaterial color={focused ? accent : tokens.inkFaint} />
      </mesh>
      {/* paper fill */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PLATE_W, PLATE_H]} />
        <meshBasicMaterial
          color={tokens.paper}
          transparent
          opacity={node.status === "archived" ? 0.65 : 1}
        />
      </mesh>
      {/* status dot */}
      <mesh position={[PLATE_W / 2 - textPad, lod === "dot" ? 0 : PLATE_H / 2 - 0.32, 0.002]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.12, 16]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      {/* hold-to-collapse ring: fills clockwise around the plate border */}
      {fill > 0 && fill < 1 && (
        <mesh position={[0, 0, 0.004]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[PLATE_H / 2 + 0.02, PLATE_H / 2 + 0.22, 48, 1, Math.PI / 2, fill * Math.PI * 2]} />
          <meshBasicMaterial color={accent} />
        </mesh>
      )}
      {lod !== "dot" && (
        <Text
          font={FONT}
          fontSize={lod === "compact" ? 0.3 : 0.34}
          color={tokens.ink}
          anchorX="left"
          anchorY="top"
          position={[-PLATE_W / 2 + textPad, PLATE_H / 2 - 0.18, 0.002]}
          rotation={[-Math.PI / 2, 0, 0]}
          maxWidth={PLATE_W - textPad * 2 - 0.4}
        >
          {node.title}
        </Text>
      )}
      {lod !== "dot" && (
        <Text
          font={FONT}
          fontSize={0.22}
          color={tokens.inkFaint}
          anchorX="left"
          anchorY="top"
          position={[-PLATE_W / 2 + textPad, PLATE_H / 2 - 0.68, 0.002]}
          rotation={[-Math.PI / 2, 0, 0]}
          maxWidth={PLATE_W - textPad * 2}
        >
          {subLine(node)}
        </Text>
      )}
      {detailRows.length > 0 && (
        <Text
          font={FONT}
          fontSize={0.2}
          color={tokens.inkFaint}
          anchorX="left"
          anchorY="top"
          position={[-PLATE_W / 2 + textPad, -PLATE_H / 2 + detailRows.length * 0.3 + 0.1, 0.002]}
          rotation={[-Math.PI / 2, 0, 0]}
          maxWidth={PLATE_W - textPad * 2}
        >
          {detailRows.map(([k, v]) => `${k} ${v}`).join("\n")}
        </Text>
      )}
      {/* collapsed subtree badge */}
      {collapsed && hiddenCount > 0 && (
        <Text
          font={FONT}
          fontSize={0.3}
          color={accent}
          anchorX="center"
          anchorY="middle"
          position={[0, 0, 0.002]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {`+${hiddenCount}`}
        </Text>
      )}
    </group>
  );
}

export function GroundNodes({ runtime, viewport }: { runtime: Runtime; viewport: Viewport }) {
  const nodes = useStore(runtime.store, (s) => s.nodes);
  const camera = useStore(runtime.store, (s) => s.camera);
  const focusedNodeId = useStore(runtime.store, (s) => s.focusedNodeId);
  const hidden = useRef<Set<string>>(new Set());

  // recompute hidden (collapsed descendants) cheaply on nodes/collapse change
  hidden.current = new Set();
  const state = runtime.store.getState();
  for (const id of state.collapsedIds) {
    for (const node of Object.values(nodes) as GraphNode[]) {
      if (state.isDescendantOf(node.id, id)) hidden.current.add(node.id);
    }
  }

  const lod = lodFor(camera.zoom);
  const margin = 240;
  const list = (Object.values(nodes) as GraphNode[]).filter((n) => {
    if (hidden.current.has(n.id)) return false;
    const s = worldToScreen(n.position.x, n.position.y, camera, viewport);
    return (
      s.x > -margin && s.x < viewport.width + margin &&
      s.y > -margin && s.y < viewport.height + margin
    );
  });

  return (
    <>
      {list.map((node) => (
        <GroundPlate
          key={node.id}
          node={node}
          lod={lod}
          focused={node.id === focusedNodeId}
          runtime={runtime}
        />
      ))}
    </>
  );
}
