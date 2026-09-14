# Projection tests — daemon truth → graph (port of web project.ts behavior,
# validated against live daemon payload shapes captured in Spike Gb).
extends GdUnitTestSuite


func _mock_snapshot() -> Dictionary:
	return MockGateway.default_scenario().snapshot.duplicate(true)


func _count_kind(graph: Graph, kind: String) -> int:
	var n := 0
	for node in graph.nodes.values():
		if node.kind == kind:
			n += 1
	return n


func _find_by_external(graph: Graph, external_id: String) -> Dictionary:
	for node in graph.nodes.values():
		if node.externalId == external_id:
			return node
	return {}


func test_snapshot_projects_full_hierarchy() -> void:
	var graph := Graph.new()
	GraphProjection.project(graph, Gateway.snapshot_event(_mock_snapshot()))
	assert_int(_count_kind(graph, "server")).is_equal(1)
	assert_int(_count_kind(graph, "project")).is_equal(2)
	assert_int(_count_kind(graph, "workspace")).is_equal(2)
	assert_int(_count_kind(graph, "worktree")).is_equal(1)
	assert_int(_count_kind(graph, "agent")).is_equal(2)
	# hierarchy: agent under its workspace, workspace under its project
	var agent := _find_by_external(graph, "agt_opencode_main")
	var ws := _find_by_external(graph, "wks_unlimigent")
	var project := _find_by_external(graph, "prj_unlimigent")
	assert_str(agent.parentId).is_equal(ws.id)
	assert_str(ws.parentId).is_equal(project.id)


func test_workspace_titles_use_daemon_name() -> void:
	var graph := Graph.new()
	GraphProjection.project(graph, Gateway.snapshot_event(_mock_snapshot()))
	var ws := _find_by_external(graph, "wks_unlimigent")
	assert_str(ws.title).is_equal("spatial canvas foundations")
	# worktree with a name too, not its branch
	var wt := _find_by_external(graph, "wks_voice")
	assert_str(wt.title).is_equal("voice command interpretation")
	# branch still surfaces in meta
	assert_str(wt.meta.branch).is_equal("voice-commands")


func test_status_mapping() -> void:
	var graph := Graph.new()
	GraphProjection.project(graph, Gateway.snapshot_event(_mock_snapshot()))
	# pendingPermissions → attention
	assert_str(_find_by_external(graph, "agt_codex_voice").status).is_equal("attention")
	# running agent stays running
	assert_str(_find_by_external(graph, "agt_opencode_main").status).is_equal("running")
	# open PR → workspace attention
	assert_str(_find_by_external(graph, "wks_voice").status).is_equal("attention")


func test_prune_removes_disappeared_entities_and_empty_projects() -> void:
	var graph := Graph.new()
	GraphProjection.project(graph, Gateway.snapshot_event(_mock_snapshot()))
	# drop xagent workspace + both agents from the "daemon" view
	var reduced := _mock_snapshot()
	reduced.workspaces = [reduced.workspaces[0], reduced.workspaces[1]]
	reduced.agents = []
	GraphProjection.project(graph, Gateway.snapshot_event(reduced))
	assert_int(_count_kind(graph, "agent")).is_equal(0)
	assert_int(_count_kind(graph, "project")).is_equal(1)
	assert_that(_find_by_external(graph, "wks_xagent")).is_empty()


func test_workspace_archived_event_removes_node() -> void:
	var graph := Graph.new()
	GraphProjection.project(graph, Gateway.snapshot_event(_mock_snapshot()))
	GraphProjection.project(graph, Gateway.workspace_archived_event("wks_voice"))
	assert_that(_find_by_external(graph, "wks_voice")).is_empty()


func test_workspace_updated_archived_status_removes_node() -> void:
	var graph := Graph.new()
	GraphProjection.project(graph, Gateway.snapshot_event(_mock_snapshot()))
	var ws: Dictionary = _mock_snapshot().workspaces[1]
	ws.status = "archived"
	GraphProjection.project(graph, Gateway.workspace_updated_event(ws))
	assert_that(_find_by_external(graph, "wks_voice")).is_empty()


func test_agent_updated_flaps_status() -> void:
	var graph := Graph.new()
	GraphProjection.project(graph, Gateway.snapshot_event(_mock_snapshot()))
	var agent: Dictionary = _mock_snapshot().agents[0].duplicate(true)
	agent.status = "idle"
	GraphProjection.project(graph, Gateway.agent_updated_event(agent))
	assert_str(_find_by_external(graph, "agt_opencode_main").status).is_equal("idle")


func test_agent_updated_archived_removes() -> void:
	var graph := Graph.new()
	GraphProjection.project(graph, Gateway.snapshot_event(_mock_snapshot()))
	var agent: Dictionary = _mock_snapshot().agents[0].duplicate(true)
	agent.archived = true
	GraphProjection.project(graph, Gateway.agent_updated_event(agent))
	assert_that(_find_by_external(graph, "agt_opencode_main")).is_empty()


func test_agent_removed_event() -> void:
	var graph := Graph.new()
	GraphProjection.project(graph, Gateway.snapshot_event(_mock_snapshot()))
	GraphProjection.project(graph, Gateway.agent_removed_event("agt_codex_voice"))
	assert_that(_find_by_external(graph, "agt_codex_voice")).is_empty()


func test_upsert_trusts_daemon_hierarchy() -> void:
	# persisted graph with a stale parent: upsert reparents to daemon truth
	var graph := Graph.new()
	GraphProjection.project(graph, Gateway.snapshot_event(_mock_snapshot()))
	var wrong_parent := graph.add_node({"kind": "project", "title": "stale"})
	var agent_node := _find_by_external(graph, "agt_opencode_main")
	graph.reparent(agent_node.id, wrong_parent.id)
	var agent: Dictionary = _mock_snapshot().agents[0].duplicate(true)
	GraphProjection.project(graph, Gateway.agent_updated_event(agent))
	var ws := _find_by_external(graph, "wks_unlimigent")
	assert_str(_find_by_external(graph, "agt_opencode_main").parentId).is_equal(ws.id)


func test_large_scenario_projects_full_graph() -> void:
	var graph := Graph.new()
	var scenario := MockGateway.large_scenario()
	GraphProjection.project(graph, Gateway.snapshot_event(scenario.snapshot))
	assert_int(scenario.snapshot.workspaces.size()).is_equal(24)
	assert_int(scenario.snapshot.agents.size()).is_equal(6)
	# server + 12 projects + 24 workspaces + 6 agents
	assert_int(graph.nodes.size()).is_equal(43)
