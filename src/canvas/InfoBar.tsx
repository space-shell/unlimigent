import { useStore } from "zustand";
import type { Runtime } from "../app/runtime";
import type { GraphNode } from "../graph/types";

const KIND_LABEL: Record<GraphNode["kind"], string> = {
  server: "server",
  workspace: "workspace",
  worktree: "worktree",
  agent: "agent",
  schedule: "schedule",
  integration: "integration",
};

/** Bottom info bar: shows the focused node. Keyboard-less stand-in for a
 * detail view until the inspector panel exists. */
export function InfoBar({ runtime }: { runtime: Runtime }) {
  const focusedNodeId = useStore(runtime.store, (s) => s.focusedNodeId);
  const node = useStore(runtime.store, (s) =>
    s.focusedNodeId ? s.nodes[s.focusedNodeId] : null,
  );

  if (!focusedNodeId || !node) {
    return (
      <div className="info-bar" data-empty="true">
        <span className="info-hint">tap a node · drag to pan · pinch to zoom</span>
      </div>
    );
  }

  const meta = Object.entries(node.meta)
    .filter(([, v]) => v !== null && v !== "")
    .slice(0, 5)
    .map(([k, v]) => `${k} ${v}`)
    .join("  ");

  return (
    <div className="info-bar">
      <span className="info-kind">{KIND_LABEL[node.kind]}</span>
      <span className="info-title">{node.title}</span>
      <span className="info-status" data-status={node.status}>
        {node.status}
      </span>
      {meta && <span className="info-meta">{meta}</span>}
    </div>
  );
}
