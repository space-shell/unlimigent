# Sub-agent handling + inspect pagination — pilot feedback 2026-09-14.
extends GdUnitTestSuite


func test_subagent_detected_from_daemon_labels() -> void:
	var raw := {
		"id": "c7f7b892",
		"status": "closed",
		"pendingPermissions": [],
		"labels": {"paseo.parent-agent-id": "c521b946"},
	}
	var agent := Gateway.normalize_agent(raw)
	assert_bool(agent.subagent).is_true()
	var top_level := Gateway.normalize_agent({"id": "x", "pendingPermissions": [], "labels": {}})
	assert_bool(top_level.subagent).is_false()


func test_projection_carries_subagent_meta() -> void:
	var graph := Graph.new()
	var scenario := MockGateway.default_scenario()
	scenario.snapshot.agents[0].subagent = true
	GraphProjection.project(graph, Gateway.snapshot_event(scenario.snapshot))
	var agent_node: Dictionary = {}
	for candidate in graph.nodes.values():
		if candidate.kind == "agent":
			agent_node = candidate
			break
	assert_bool(agent_node.meta.subagent).is_true()


func test_compass_skips_subagents() -> void:
	assert_bool(Compass.should_show({"status": "running", "meta": {"subagent": true}})).is_false()
	assert_bool(Compass.should_show({"status": "running", "meta": {"subagent": null}})).is_true()
	assert_bool(Compass.should_show({"status": "idle", "meta": {}})).is_false()


func test_inspect_lines_wrap_and_flag_empty() -> void:
	var node := {"title": "probe", "kind": "agent", "meta": {}, "status": "running"}
	var empty := Interaction.build_inspect_lines(node, [])
	assert_bool(empty.any(func(l: String) -> bool: return l.contains("no live messages"))).is_true()
	var messages := [
		{"role": "user", "text": "run the shell command and report the kernel version please"},
		{"role": "agent", "text": "Kernel version: 6.18.35 NixOS"},
	]
	var lines := Interaction.build_inspect_lines(node, messages)
	assert_int(lines.size()).is_greater(4)
	for line in lines:
		assert_bool(line.length() <= Interaction.INSPECT_WRAP_CHARS + 2).is_true()


func test_wrap_line_splits_long_words_lines() -> void:
	var wrapped := Interaction._wrap_line(
		"alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu", 20
	)
	assert_int(wrapped.size()).is_greater(2)
	for line in wrapped:
		assert_bool(line.length() <= 20).is_true()
