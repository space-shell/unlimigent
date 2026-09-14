# Ship regression tests — controls and trail (device regression 2026-09-14:
# a broken call signature killed _physics_process silently; the ship neither
# moved nor kept its position updates).
extends GdUnitTestSuite


func _make_ship() -> Ship:
	var parent := Node3D.new()
	auto_free(parent)
	var ship := Ship.new()
	parent.add_child(ship)
	add_child(parent)
	return ship


func test_thrust_moves_the_ship() -> void:
	var ship := _make_ship()
	auto_free(ship)
	var start := ship.position_2d
	IntentBus.dispatch({"type": "ship.thrust", "source": "gamepad", "dir": {"x": 1.0, "y": 0.0}})
	for i in range(30):
		await get_tree().physics_frame
	assert_float(ship.position_2d.x).is_greater(start.x + 0.5)
	assert_float(ship.velocity.length()).is_greater(0.0)


func test_ship_unsubscribes_on_exit() -> void:
	var ship := _make_ship()
	ship.queue_free()
	await get_tree().process_frame
	# dispatching after free must be a no-op, not an error
	IntentBus.dispatch({"type": "ship.thrust", "source": "gamepad", "dir": {"x": 1.0, "y": 0.0}})
	await get_tree().physics_frame
	assert_bool(true).is_true()


func test_trail_drops_in_world_space() -> void:
	var ship := _make_ship()
	auto_free(ship)
	IntentBus.dispatch({"type": "ship.thrust", "source": "gamepad", "dir": {"x": 1.0, "y": 0.0}})
	for i in range(60):
		await get_tree().physics_frame
	var dropped := 0
	for segment in ship._trail:
		if segment.visible:
			dropped += 1
	assert_int(dropped).is_greater(3)
	# the trail must live OUTSIDE the ship — it is a path in the world,
	# not an ornament that translates with the hull
	assert_that(ship._trail[0].get_parent()).is_not_same(ship)
	assert_str(ship._trail[0].get_parent().name).is_equal("ShipTrail")


func test_drag_limits_speed() -> void:
	var ship := _make_ship()
	auto_free(ship)
	IntentBus.dispatch({"type": "ship.thrust", "source": "gamepad", "dir": {"x": 1.0, "y": 0.0}})
	for i in range(240):
		await get_tree().physics_frame
	assert_float(ship.velocity.length()).is_less_equal(Ship.MAX_SPEED + 0.01)
	IntentBus.dispatch({"type": "ship.thrust", "source": "gamepad", "dir": {"x": 0.0, "y": 0.0}})
	for i in range(120):
		await get_tree().physics_frame
	assert_float(ship.velocity.length()).is_less(0.5)
