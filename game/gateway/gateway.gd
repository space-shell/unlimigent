class_name Gateway
extends RefCounted
## Canonical gateway shapes + event builders (port of src/gateway/types.ts)
## and raw daemon-payload normalizers (shapes captured in Spike Gb —
## fetch_agents_response / fetch_workspaces_response entries). Only the real
## gateway touches raw daemon JSON; everything downstream consumes these
## canonical dictionaries.


static func connection_event(state: String, detail: String = "") -> Dictionary:
	var event := {"kind": "connection", "state": state}
	if detail != "":
		event.detail = detail
	return event


static func snapshot_event(snapshot: Dictionary) -> Dictionary:
	return {"kind": "snapshot", "snapshot": snapshot}


static func workspace_updated_event(workspace: Dictionary) -> Dictionary:
	return {"kind": "workspace-updated", "workspace": workspace}


static func workspace_archived_event(id: String) -> Dictionary:
	return {"kind": "workspace-archived", "id": id}


static func agent_updated_event(agent: Dictionary) -> Dictionary:
	return {"kind": "agent-updated", "agent": agent}


static func agent_removed_event(id: String) -> Dictionary:
	return {"kind": "agent-removed", "id": id}


## Raw workspace entry (fetch_workspaces_response entries[]) → canonical
## GatewayWorkspace. Field names verified against the live daemon 2026-09-11.
static func normalize_workspace(entry: Dictionary) -> Dictionary:
	var git: Dictionary = entry.get("gitRuntime", {})
	var ahead_behind: Dictionary = git.get("aheadBehind", {})
	var pr_raw: Variant = entry.get("githubRuntime", {}).get("pullRequest", null)
	var pr: Variant = null
	if pr_raw is Dictionary:
		pr = {"title": pr_raw.get("title"), "state": pr_raw.get("state")}
	var diff: Dictionary = entry.get("diffStat", {})
	var diff_stat: Variant = null
	if diff.has("additions") or diff.has("deletions"):
		diff_stat = "+%d −%d" % [int(diff.get("additions", 0)), int(diff.get("deletions", 0))]
	return {
		"id": entry.get("id", ""),
		"name": entry.get("name", entry.get("title", "")),
		"title": entry.get("title"),
		"projectId": entry.get("projectId", ""),
		"projectDisplayName": entry.get("projectDisplayName", ""),
		"workspaceKind": entry.get("workspaceKind", "local_checkout"),
		"directory": entry.get("workspaceDirectory"),
		"projectRootPath": entry.get("projectRootPath"),
		"branch": git.get("currentBranch"),
		"remoteUrl": git.get("remoteUrl"),
		"isDirty": git.get("isDirty"),
		"ahead": ahead_behind.get("ahead"),
		"behind": ahead_behind.get("behind"),
		"pullRequest": pr,
		"diffStat": diff_stat,
		"status": entry.get("status", "active"),
	}


## Raw agent entry (fetch_agents_response entries[].agent) → canonical
## GatewayAgent.
static func normalize_agent(agent: Dictionary) -> Dictionary:
	var pending: Variant = agent.get("pendingPermissions", [])
	var pending_count: int = pending.size() if pending is Array else 0
	var requires_attention: bool = bool(agent.get("requiresAttention", false))
	var status: String = agent.get("status", "idle")
	if requires_attention or pending_count > 0:
		status = "attention"
	return {
		"id": agent.get("id", ""),
		"title": agent.get("title", agent.get("id", "")),
		"provider": agent.get("provider", ""),
		"model": agent.get("model", ""),
		"cwd": agent.get("cwd", ""),
		"workspaceId": agent.get("workspaceId"),
		"status": status,
		"mode": agent.get("runtimeInfo", {}).get("modeId", agent.get("currentModeId")),
		"requiresAttention": requires_attention,
		"attentionReason": agent.get("attentionReason"),
		"pendingPermissions": pending_count,
		"lastActivityAt": agent.get("updatedAt"),
		"archived": agent.get("archivedAt") != null,
	}


static func snapshot_from_fetch(
	daemon_host: String, workspace_entries: Array, agent_entries: Array
) -> Dictionary:
	var workspaces: Array = []
	for entry in workspace_entries:
		if entry is Dictionary:
			workspaces.append(normalize_workspace(entry))
	var agents: Array = []
	for entry in agent_entries:
		var agent: Variant = entry.get("agent", entry) if entry is Dictionary else entry
		if agent is Dictionary:
			agents.append(normalize_agent(agent))
	return {"daemonHost": daemon_host, "workspaces": workspaces, "agents": agents}
