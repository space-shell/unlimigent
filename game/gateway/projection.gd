class_name GraphProjection
extends RefCounted
## Projection: daemon truth → graph nodes. Port of src/gateway/project.ts
## with the G2 hub layout (INTENT.md world canon): server central, projects
## on a golden-angle ring, workspaces ringed on their project, agents ringed
## on their workspace — spacing chosen against plate sizes so nothing
## overlaps. The elkjs re-flow stays retired; this placement is the layout.
##
## Hierarchy mirrors Paseo exactly (INTENT.md "Node ontology"):
##   server → project → workspace (local | worktree, siblings) → agents.
## Archived entities never visualise; nodes are removed when entities
## archive. Persisted graphs can predate hierarchy fixes — the daemon is
## always trusted (reparent on upsert).

const GOLDEN_ANGLE := 2.399963
const PROJECT_RADIUS := 15.0
const WORKSPACE_RADIUS := 6.0
const AGENT_RADIUS := 2.8


static func _agent_status(agent: Dictionary) -> String:
	return agent.get("status", "idle")


static func _workspace_status(ws: Dictionary) -> String:
	if ws.get("pullRequest") != null:
		return "attention"
	var status: String = ws.get("status", "")
	if status == "done":
		return "done"
	if status == "running":
		return "running"
	return "idle"


static func _workspace_meta(ws: Dictionary) -> Dictionary:
	var git_bits: Array[String] = []
	if ws.get("isDirty") == true:
		git_bits.append("dirty")
	if ws.get("ahead") != null and int(ws.ahead) > 0:
		git_bits.append("↑%d" % int(ws.ahead))
	if ws.get("behind") != null and int(ws.behind) > 0:
		git_bits.append("↓%d" % int(ws.behind))
	var pr: Variant = ws.get("pullRequest")
	var diff: Variant = ws.get("diffStat")
	var meta := {
		"branch": ws.get("branch"),
		"path": ws.get("directory"),
		"remote": ws.get("remoteUrl"),
		"pr": null,
		"diff": diff,
		"git": " ".join(git_bits) if not git_bits.is_empty() else null,
	}
	if pr is Dictionary:
		meta.pr = "%s: %s" % [pr.get("state", ""), pr.get("title", "")]
	return meta


static func _agent_meta(agent: Dictionary) -> Dictionary:
	var pending: int = int(agent.get("pendingPermissions", 0))
	return {
		"provider": agent.get("provider"),
		"model": agent.get("model"),
		"mode": agent.get("mode"),
		"cwd": agent.get("cwd"),
		"permissions": str(pending) if pending > 0 else null,
		"attention": agent.get("attentionReason"),
		"activity": agent.get("lastActivityAt"),
	}


static func _find_by_external_id(graph: Graph, external_id: String) -> Variant:
	for node_id in graph.nodes.keys():
		var node: Dictionary = graph.nodes[node_id]
		if node.origin == "gateway" and node.externalId == external_id:
			return node
	return null


static func _gateway_server_id(graph: Graph) -> Variant:
	for node_id in graph.nodes.keys():
		var node: Dictionary = graph.nodes[node_id]
		if node.kind == "server" and node.origin == "gateway":
			return node.id
	return null


static func _ensure_server(graph: Graph, host: String) -> String:
	var existing: Variant = _gateway_server_id(graph)
	if existing is String:
		return existing
	return (
		graph
		. add_node(
			{"kind": "server", "title": host, "origin": "gateway", "position": {"x": 0.0, "y": 0.0}}
		)
		. id
	)


static func _ensure_project(
	graph: Graph, server_id: String, project_id: String, name: String, root_path: Variant
) -> String:
	var existing: Variant = _find_by_external_id(graph, project_id)
	if existing is Dictionary:
		graph.set_node_title(existing.id, name)
		if root_path is String:
			var meta: Dictionary = existing.meta.duplicate(true)
			meta.path = root_path
			graph.set_node_meta(existing.id, meta)
		return existing.id
	var i := graph.child_count(server_id)
	var angle := (i * PI) / 4.0 - PI / 2.0
	return (
		graph
		. add_node(
			{
				"kind": "project",
				"title": name,
				"parentId": server_id,
				"origin": "gateway",
				"externalId": project_id,
				"position": {"x": 4.0 + cos(angle) * 3.0, "y": sin(angle) * 3.0},
				"meta": {"path": root_path},
			}
		)
		. id
	)


static func _upsert_workspace(graph: Graph, project_id: String, ws: Dictionary) -> bool:
	var existing: Variant = _find_by_external_id(graph, ws.id)
	var kind := "worktree" if ws.get("workspaceKind", "") == "worktree" else "workspace"
	var meta := _workspace_meta(ws)
	# workspace/worktree nodes are info nodes: branch as the title; sub is
	# "Local" for checkouts or the worktree folder name for worktrees
	var title: Variant = ws.get("branch")
	if title == null:
		title = ws.get("name", "")
	var folder: Variant = null
	if ws.get("directory") is String:
		var parts: PackedStringArray = String(ws.directory).split("/")
		if parts.size() > 0:
			folder = parts[parts.size() - 1]
	meta["worktree"] = folder if kind == "worktree" else null

	if existing is Dictionary:
		# persisted graphs can predate hierarchy fixes — trust the daemon
		var reparented: bool = graph.reparent(existing.id, project_id)
		graph.set_node_title(existing.id, title)
		graph.set_node_status(existing.id, _workspace_status(ws))
		graph.set_node_meta(existing.id, meta)
		return reparented

	var parent_node: Dictionary = graph.nodes.get(project_id, {})
	var px := float(parent_node.get("position", {}).get("x", 0.0))
	var py := float(parent_node.get("position", {}).get("y", 0.0))
	var i := graph.child_count(project_id)
	var base_angle := atan2(py, px) if px != 0.0 or py != 0.0 else 0.0
	var angle := base_angle + 0.7 * (i - 1)
	(
		graph
		. add_node(
			{
				"kind": kind,
				"title": title,
				"parentId": project_id,
				"origin": "gateway",
				"externalId": ws.id,
				"status": _workspace_status(ws),
				"position":
				{
					"x": px + cos(angle) * WORKSPACE_RADIUS,
					"y": py + sin(angle) * WORKSPACE_RADIUS,
				},
				"meta": meta,
			}
		)
	)
	return true


static func _upsert_agent(graph: Graph, agent: Dictionary) -> bool:
	var existing: Variant = _find_by_external_id(graph, agent.id)
	var parent: Variant = null
	var workspace_id: Variant = agent.get("workspaceId")
	if workspace_id is String:
		parent = _find_by_external_id(graph, workspace_id)
	if existing is Dictionary:
		# persisted graphs can predate hierarchy fixes — trust the daemon
		var new_parent: Variant = parent.id if parent is Dictionary else null
		var reparented: bool = graph.reparent(existing.id, new_parent)
		graph.set_node_status(existing.id, _agent_status(agent))
		graph.set_node_title(existing.id, agent.get("title", ""))
		graph.set_node_meta(existing.id, _agent_meta(agent))
		return reparented

	var parent_id: Variant = parent.id if parent is Dictionary else null
	var position: Dictionary = {"x": 4.0, "y": -12.0}
	if parent is Dictionary:
		var parent_pos: Dictionary = parent.position
		var i := graph.child_count(parent.id)
		var angle := i * GOLDEN_ANGLE
		position = {
			"x": float(parent_pos.x) + cos(angle) * AGENT_RADIUS,
			"y": float(parent_pos.y) + sin(angle) * AGENT_RADIUS,
		}
	(
		graph
		. add_node(
			{
				"kind": "agent",
				"title": agent.get("title", ""),
				"parentId": parent_id,
				"origin": "gateway",
				"externalId": agent.id,
				"status": _agent_status(agent),
				"position": position,
				"meta": _agent_meta(agent),
			}
		)
	)
	return true


## Remove workspace/agent nodes whose entity disappeared or archived, and
## project nodes with no live workspaces left. Returns removal count.
static func _prune_orphans(graph: Graph, snapshot: Dictionary) -> int:
	var live_ids: Dictionary = {}
	for ws in snapshot.get("workspaces", []):
		live_ids[ws.id] = true
	for agent in snapshot.get("agents", []):
		live_ids[agent.id] = true
	var removed := 0
	for node_id in graph.nodes.keys().duplicate():
		var node: Dictionary = graph.nodes[node_id]
		if node.origin != "gateway" or node.kind == "server" or node.kind == "project":
			continue
		if node.externalId != null and not live_ids.has(node.externalId):
			graph.remove_node(node.id)
			removed += 1
	var project_ids: Dictionary = {}
	for ws in snapshot.get("workspaces", []):
		project_ids[ws.projectId] = true
	for node_id in graph.nodes.keys().duplicate():
		var node: Dictionary = graph.nodes[node_id]
		if node.origin == "gateway" and node.kind == "project":
			if not project_ids.has(node.externalId):
				graph.remove_node(node.id)
				removed += 1
	return removed


static func _apply_snapshot(graph: Graph, snapshot: Dictionary) -> void:
	var server_id := _ensure_server(graph, snapshot.get("daemonHost", "daemon"))
	for ws in snapshot.get("workspaces", []):
		var project_id := _ensure_project(
			graph,
			server_id,
			ws.projectId,
			ws.get("projectDisplayName", ""),
			ws.get("projectRootPath"),
		)
		_upsert_workspace(graph, project_id, ws)
	for agent in snapshot.get("agents", []):
		_upsert_agent(graph, agent)
	_prune_orphans(graph, snapshot)


static func project(graph: Graph, event: Dictionary) -> void:
	var kind: String = event.get("kind", "")
	if kind == "snapshot":
		_apply_snapshot(graph, event.snapshot)
	elif kind == "workspace-updated":
		var ws: Dictionary = event.workspace
		# only genuinely archived workspaces are removed on update
		if ws.get("status", "") == "archived":
			var archived_node: Variant = _find_by_external_id(graph, ws.id)
			if archived_node is Dictionary:
				graph.remove_node(archived_node.id)
			return
		var server_id: Variant = _gateway_server_id(graph)
		if server_id is String:
			var project_id := _ensure_project(
				graph,
				server_id,
				ws.projectId,
				ws.get("projectDisplayName", ""),
				ws.get("projectRootPath"),
			)
			_upsert_workspace(graph, project_id, ws)
	elif kind == "workspace-archived":
		var ws_node: Variant = _find_by_external_id(graph, event.id)
		if ws_node is Dictionary:
			graph.remove_node(ws_node.id)
	elif kind == "agent-updated":
		var agent: Dictionary = event.agent
		if agent.get("archived", false):
			var archived_node: Variant = _find_by_external_id(graph, agent.id)
			if archived_node is Dictionary:
				graph.remove_node(archived_node.id)
		else:
			_upsert_agent(graph, agent)
	elif kind == "agent-removed":
		var agent_node: Variant = _find_by_external_id(graph, event.id)
		if agent_node is Dictionary:
			graph.remove_node(agent_node.id)
	# "connection": nothing to project
