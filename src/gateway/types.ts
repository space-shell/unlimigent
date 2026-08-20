// Gateway data shapes mirror what the daemon actually returns (spike 0a +
// live probe 2026-08-20, @getpaseo/client 0.4.0). The graph never imports
// @getpaseo/client — only the real gateway does.

export interface GatewayWorkspace {
  id: string;
  /** Workspace name (daemon `name`, falls back to `title`). */
  name: string;
  /** Human title from the daemon, when different. */
  title: string | null;
  projectId: string;
  projectDisplayName: string;
  workspaceKind: string;
  /** Filesystem path of the checkout/worktree. */
  directory: string | null;
  branch: string | null;
  remoteUrl: string | null;
  isDirty: boolean | null;
  ahead: number | null;
  behind: number | null;
  pullRequest: { title: string; state: string } | null;
  diffStat: string | null;
  status: string;
}

export interface GatewayAgent {
  id: string;
  /** Daemon-provided agent title. */
  title: string;
  provider: string;
  model: string;
  cwd: string;
  workspaceId: string | null;
  status: "idle" | "running" | "attention" | "error";
  mode: string | null;
  requiresAttention: boolean;
  attentionReason: string | null;
  pendingPermissions: number;
  lastActivityAt: string | null;
}

export interface GatewaySnapshot {
  daemonHost: string;
  workspaces: GatewayWorkspace[];
  agents: GatewayAgent[];
}

export type GatewayEvent =
  | { kind: "snapshot"; snapshot: GatewaySnapshot }
  | { kind: "workspace-updated"; workspace: GatewayWorkspace }
  | { kind: "workspace-archived"; id: string }
  | { kind: "agent-updated"; agent: GatewayAgent }
  | { kind: "agent-removed"; id: string }
  | { kind: "connection"; state: "connected" | "disconnected" | "error"; detail?: string };

export type GatewayListener = (event: GatewayEvent) => void;

export interface PaseoGateway {
  start(): void;
  stop(): void;
  subscribe(listener: GatewayListener): () => void;
}
