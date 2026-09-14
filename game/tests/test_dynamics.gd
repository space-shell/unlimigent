# Change-notification batching + ship boost — device regressions
# 2026-09-14 (per-mutation rebuild storm stuttered every tick; boost is a
# new flight control).
extends GdUnitTestSuite


func test_change_signal_batches_many_mutations() -> void:
	var graph := Graph.new()
	var hits: Array = [0]
	graph.changed.connect(func() -> void: hits[0] += 1)
	for i in range(20):
		graph.add_node({"kind": "agent", "title": "a%d" % i})
	# deferred emission lands on the next frame
	await get_tree().process_frame
	assert_int(hits[0]).is_equal(1)


func test_change_signal_fires_again_next_batch() -> void:
	var graph := Graph.new()
	var hits: Array = [0]
	graph.changed.connect(func() -> void: hits[0] += 1)
	graph.add_node({"kind": "agent", "title": "one"})
	await get_tree().process_frame
	graph.add_node({"kind": "agent", "title": "two"})
	await get_tree().process_frame
	assert_int(hits[0]).is_equal(2)


func test_boost_raises_speed_ceiling() -> void:
	var ship := Ship.new()
	var parent := Node3D.new()
	auto_free(parent)
	parent.add_child(ship)
	add_child(parent)
	auto_free(ship)
	IntentBus.dispatch({"type": "ship.thrust", "source": "gamepad", "dir": {"x": 1.0, "y": 0.0}})
	for i in range(240):
		await get_tree().physics_frame
	var cruise := ship.velocity.length()
	IntentBus.dispatch({"type": "ship.boost", "source": "gamepad", "value": 1.0})
	for i in range(240):
		await get_tree().physics_frame
	var boosted := ship.velocity.length()
	assert_float(boosted).is_greater(cruise * 1.4)
	IntentBus.dispatch({"type": "ship.boost", "source": "gamepad", "value": 0.0})
	IntentBus.dispatch({"type": "ship.thrust", "source": "gamepad", "dir": {"x": 0.0, "y": 0.0}})
	for i in range(240):
		await get_tree().physics_frame
	assert_float(ship.velocity.length()).is_less(0.5)
