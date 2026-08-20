import { useRef } from "react";
import { useStore } from "zustand";
import { Html } from "@react-three/drei";
import type { Runtime } from "../app/runtime";
import type { GraphNode } from "../graph/types";
import {
  NODE_HALF_H,
  NODE_HALF_W,
  rectVisible,
  viewRect,
  type Viewport,
} from "./cameraMath";

const KIND_GLYPH: Record<GraphNode["kind"], string> = {
  server: "◉",
  workspace: "◇",
  worktree: "◇",
  agent: "▲",
  schedule: "○",
  integration: "✦",
};

const CULL_MARGIN = 1;

function lodFor(zoom: number): "full" | "compact" | "dot" {
  if (zoom >= 28) return "full";
  if (zoom >= 12) return "compact";
  return "dot";
}

function subLine(node: GraphNode): string {
  switch (node.kind) {
    case "agent":
      return [node.meta.provider, node.meta.model].filter(Boolean).join(" · ") || "agent";
    case "workspace":
    case "worktree":
      return String(node.meta.branch ?? node.kind);
    case "server":
      return "daemon";
    default:
      return node.kind;
  }
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originPos: { x: number; y: number };
  moved: boolean;
  longPressFired: boolean;
  timer: ReturnType<typeof setTimeout>;
}

function NodeCard({
  node,
  lod,
  focused,
  runtime,
}: {
  node: GraphNode;
  lod: "full" | "compact" | "dot";
  focused: boolean;
  runtime: Runtime;
}) {
  const dragRef = useRef<DragState | null>(null);

  const endInteraction = () => {
    if (dragRef.current) {
      clearTimeout(dragRef.current.timer);
      dragRef.current = null;
    }
  };

  return (
    <Html
      position={[node.position.x, node.position.y, 0]}
      center
      zIndexRange={[100, 0]}
      style={{ pointerEvents: lod === "dot" ? "none" : "auto" }}
    >
      <div
        className={`node-card${focused ? " focused" : ""}`}
        data-kind={node.kind}
        data-status={node.status}
        data-lod={lod}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const timer = setTimeout(() => {
            const drag = dragRef.current;
            if (drag && !drag.moved) {
              drag.longPressFired = true;
              runtime.bus.dispatch({
                type: "node.context",
                source: "touch",
                id: node.id,
              });
            }
          }, 450);
          dragRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            originPos: { ...node.position },
            moved: false,
            longPressFired: false,
            timer,
          };
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag || e.pointerId !== drag.pointerId) return;
          e.stopPropagation();
          const dxPx = e.clientX - drag.startX;
          const dyPx = e.clientY - drag.startY;
          if (!drag.moved && Math.hypot(dxPx, dyPx) > 6) {
            drag.moved = true;
            clearTimeout(drag.timer);
          }
          if (drag.moved) {
            const zoom = runtime.store.getState().camera.zoom;
            runtime.store.getState().moveNode(node.id, {
              x: drag.originPos.x + dxPx / zoom,
              y: drag.originPos.y - dyPx / zoom,
            });
          }
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          const drag = dragRef.current;
          endInteraction();
          if (drag && !drag.moved && !drag.longPressFired) {
            runtime.bus.dispatch({
              type: "node.activate",
              source: "touch",
              id: node.id,
            });
          }
        }}
        onPointerCancel={() => endInteraction()}
      >
        {lod !== "dot" && (
          <>
            <span className="node-glyph" aria-hidden="true">
              {KIND_GLYPH[node.kind]}
            </span>
            <span className="node-text">
              <span className="node-title">{node.title}</span>
              {lod === "full" && <span className="node-sub">{subLine(node)}</span>}
            </span>
          </>
        )}
      </div>
    </Html>
  );
}

export function NodeLayer({
  runtime,
  viewport,
}: {
  runtime: Runtime;
  viewport: Viewport;
}) {
  const nodes = useStore(runtime.store, (s) => s.nodes);
  const camera = useStore(runtime.store, (s) => s.camera);
  const focusedNodeId = useStore(runtime.store, (s) => s.focusedNodeId);

  const rect = viewRect(camera, viewport);
  const lod = lodFor(camera.zoom);
  const list = Object.values(nodes).filter((n) =>
    rectVisible(rect, n.position, NODE_HALF_W, NODE_HALF_H, CULL_MARGIN),
  );

  return (
    <>
      {list.map((node) => (
        <NodeCard
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
