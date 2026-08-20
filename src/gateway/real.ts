import { createPaseoClient } from "@getpaseo/client";
import type {
  GatewayAgent,
  GatewayEvent,
  GatewayListener,
  GatewaySnapshot,
  GatewayWorkspace,
  PaseoGateway,
} from "./types";

const DEFAULT_URL = "ws://100.127.193.39:6767/ws";
const POLL_MS = 4000;

/** Minimal structural types for what we read off the daemon (spike 0a +
 * live probe 2026-08-20). Kept local and permissive — the daemon is the
 * source of truth, not these. */
interface DaemonAgent {
  id: string;
  provider?: string;
  model?: string;
  cwd?: string;
  workspaceId?: string | null;
  status?: string;
  title?: string | null;
  currentModeId?: string | null;
  requiresAttention?: boolean;
  attentionReason?: string | null;
  pendingPermissions?: Array<unknown> | null;
  lastUserMessageAt?: string | null;
  updatedAt?: string | null;
  archivedAt?: string | null;
}

interface DaemonWorkspace {
  id: string;
  name?: string | null;
  title?: string | null;
  projectId?: string;
  projectDisplayName?: string | null;
  workspaceKind?: string;
  workspaceDirectory?: string | null;
  status?: string;
  archivingAt?: string | null;
  diffStat?: string | null;
  gitRuntime?: {
    currentBranch?: string | null;
    remoteUrl?: string | null;
    isDirty?: boolean | null;
    aheadOfOrigin?: number | null;
    behindOfOrigin?: number | null;
  } | null;
  githubRuntime?: { pullRequest?: { title?: string; state?: string } | null } | null;
}

function mapStatus(a: DaemonAgent): GatewayAgent["status"] {
  if (a.requiresAttention || (a.pendingPermissions?.length ?? 0) > 0) return "attention";
  if (a.status === "running") return "running";
  if (a.status === "error") return "error";
  return "idle";
}

function mapAgent(a: DaemonAgent): GatewayAgent | null {
  // archived agents are never visualised
  if (a.archivedAt) return null;
  const cwd = a.cwd ?? "";
  return {
    id: a.id,
    title: a.title ?? cwd.split("/").filter(Boolean).pop() ?? `agent ${a.id.slice(0, 6)}`,
    provider: a.provider ?? "unknown",
    model: a.model ?? "unknown",
    cwd,
    workspaceId: a.workspaceId ?? null,
    status: mapStatus(a),
    mode: a.currentModeId ?? null,
    requiresAttention: a.requiresAttention ?? false,
    attentionReason: a.attentionReason ?? null,
    pendingPermissions: a.pendingPermissions?.length ?? 0,
    lastActivityAt: a.lastUserMessageAt ?? a.updatedAt ?? null,
    archived: false,
  };
}

function isWorkspaceArchived(w: DaemonWorkspace): boolean {
  // "done" workspaces stay visible (the official client shows them);
  // only genuinely archived ones hide
  return w.status === "archived" || w.archivingAt !== null;
}

function mapWorkspace(w: DaemonWorkspace): GatewayWorkspace | null {
  // archived workspaces are never visualised
  if (isWorkspaceArchived(w)) return null;
  const pr = w.githubRuntime?.pullRequest ?? null;
  const git = w.gitRuntime ?? null;
  return {
    id: w.id,
    name: w.name ?? w.title ?? w.id,
    title: w.title ?? null,
    projectId: w.projectId ?? w.id,
    projectDisplayName: w.projectDisplayName ?? w.id,
    workspaceKind: w.workspaceKind ?? "local_checkout",
    directory: w.workspaceDirectory ?? null,
    branch: git?.currentBranch ?? null,
    remoteUrl: git?.remoteUrl ?? null,
    isDirty: git?.isDirty ?? null,
    ahead: git?.aheadOfOrigin ?? null,
    behind: git?.behindOfOrigin ?? null,
    pullRequest: pr ? { title: pr.title ?? "pr", state: pr.state ?? "open" } : null,
    diffStat: w.diffStat ?? null,
    status: w.status ?? "active",
  };
}

function entriesOf(result: unknown): Array<Record<string, unknown>> {
  if (result && typeof result === "object" && Array.isArray((result as { entries?: unknown }).entries)) {
    return (result as { entries: Array<Record<string, unknown>> }).entries;
  }
  return [];
}

/** Read-only live view of a real Paseo daemon. Polls list endpoints and
 * diffs; subscribes when the daemon offers it. Never creates anything. */
export class RealPaseoGateway implements PaseoGateway {
  private listeners = new Set<GatewayListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastAgents = new Map<string, string>();
  private lastWorkspaces = new Map<string, string>();
  private snapshotSent = false;
  private client: ReturnType<typeof createPaseoClient> | null = null;
  private connecting = false;

  constructor(private url: string = DEFAULT_URL) {}

  subscribe(listener: GatewayListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.connecting || this.client) return;
    this.connecting = true;
    void this.run();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.connecting = false;
    void this.client?.close().catch(() => {});
    this.client = null;
    this.emit({ kind: "connection", state: "disconnected" });
  }

  private emit(event: GatewayEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private async run(): Promise<void> {
    try {
      const client = createPaseoClient({ url: this.url });
      await client.connect();
      this.client = client;
    } catch (err) {
      this.connecting = false;
      this.emit({ kind: "connection", state: "error", detail: String(err) });
      return;
    }
    this.connecting = false;
    this.emit({ kind: "connection", state: "connected", detail: this.url });
    await this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_MS);
  }

  private async poll(): Promise<void> {
    const client = this.client;
    if (!client) return;
    try {
      const [agentsRes, workspacesRes] = await Promise.all([
        client.agents.list(),
        client.workspaces.list(),
      ]);
      const workspaces = entriesOf(workspacesRes)
        .map((e) => e as unknown as DaemonWorkspace)
        .filter((w) => typeof w.id === "string")
        .map(mapWorkspace)
        .filter((w): w is GatewayWorkspace => w !== null);
      // agents of filtered (archived) workspaces have no container — drop them
      const liveWorkspaceIds = new Set(workspaces.map((w) => w.id));
      const agents = entriesOf(agentsRes)
        .map((e) => (e.agent as DaemonAgent | undefined) ?? (e as unknown as DaemonAgent))
        .filter((a) => a && typeof a.id === "string")
        .map(mapAgent)
        .filter((a): a is GatewayAgent => a !== null)
        .filter((a) => a.workspaceId === null || liveWorkspaceIds.has(a.workspaceId));

      if (!this.snapshotSent) {
        this.snapshotSent = true;
        for (const a of agents) this.lastAgents.set(a.id, JSON.stringify(a));
        for (const w of workspaces) this.lastWorkspaces.set(w.id, JSON.stringify(w));
        const snapshot: GatewaySnapshot = {
          daemonHost: new URL(this.url.replace("ws", "http")).host,
          workspaces,
          agents,
        };
        this.emit({ kind: "snapshot", snapshot });
        return;
      }

      // diff: updates, additions, removals
      const nextAgents = new Map(agents.map((a) => [a.id, JSON.stringify(a)]));
      for (const a of agents) {
        if (this.lastAgents.get(a.id) !== nextAgents.get(a.id)) {
          this.emit({ kind: "agent-updated", agent: a });
        }
      }
      for (const id of this.lastAgents.keys()) {
        if (!nextAgents.has(id)) this.emit({ kind: "agent-removed", id });
      }
      this.lastAgents = nextAgents;

      const nextWorkspaces = new Map(workspaces.map((w) => [w.id, JSON.stringify(w)]));
      for (const w of workspaces) {
        if (this.lastWorkspaces.get(w.id) !== nextWorkspaces.get(w.id)) {
          this.emit({ kind: "workspace-updated", workspace: w });
        }
      }
      this.lastWorkspaces = nextWorkspaces;
    } catch (err) {
      this.emit({ kind: "connection", state: "error", detail: String(err) });
    }
  }
}

/** Runs the primary gateway; on connection error switches to the fallback
 * (mock). Used so the Pages deploy (no ws:// possible) and offline dev still
 * show a living canvas. */
export class FallbackGateway implements PaseoGateway {
  private listeners = new Set<GatewayListener>();
  private active: PaseoGateway | null = null;
  private unsub: (() => void) | null = null;

  constructor(
    private primary: PaseoGateway,
    private fallback: PaseoGateway,
  ) {}

  subscribe(listener: GatewayListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private forward = (event: GatewayEvent): void => {
    for (const listener of this.listeners) listener(event);
    if (
      event.kind === "connection" &&
      event.state === "error" &&
      this.active === this.primary
    ) {
      this.switchToFallback();
    }
  };

  start(): void {
    if (this.active) return;
    this.active = this.primary;
    this.unsub = this.primary.subscribe(this.forward);
    this.primary.start();
  }

  stop(): void {
    this.unsub?.();
    this.unsub = null;
    this.active?.stop();
    this.active = null;
  }

  private switchToFallback(): void {
    this.unsub?.();
    this.primary.stop();
    this.active = this.fallback;
    this.unsub = this.fallback.subscribe(this.forward);
    this.fallback.start();
  }
}
