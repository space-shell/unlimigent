# IntentBus tests — port of src/intents/bus.test.ts semantics.
extends GdUnitTestSuite


func test_dispatch_reaches_typed_handlers() -> void:
	var hits: Array[String] = []
	var off := IntentBus.on("ship.thrust", func(_i: Dictionary) -> void: hits.append("typed"))
	IntentBus.dispatch({"type": "ship.thrust", "source": "gamepad", "dir": {"x": 1.0, "y": 0.0}})
	off.call()
	assert_int(hits.size()).is_equal(1)


func test_dispatch_reaches_any_handlers() -> void:
	var hits: Array[String] = []
	IntentBus.on_any(func(i: Dictionary) -> void: hits.append(i.type))
	IntentBus.dispatch({"type": "ui.menu", "source": "touch"})
	IntentBus.dispatch({"type": "nav.back", "source": "gamepad"})
	assert_int(hits.size()).is_equal(2)
	assert_str(hits[0]).is_equal("ui.menu")
	assert_str(hits[1]).is_equal("nav.back")


func test_unsubscribe_callable_stops_delivery() -> void:
	# lambdas capture ints by value — count through an array reference
	var count: Array = [0]
	var off := IntentBus.on("ui.back", func(_i: Dictionary) -> void: count[0] += 1)
	IntentBus.dispatch({"type": "ui.back", "source": "touch"})
	off.call()
	IntentBus.dispatch({"type": "ui.back", "source": "touch"})
	assert_int(count[0]).is_equal(1)


func test_off_any() -> void:
	var count := 0
	var handler := func(_i: Dictionary) -> void: count += 1
	IntentBus.on_any(handler)
	IntentBus.off_any(handler)
	IntentBus.dispatch({"type": "ui.voice", "source": "voice"})
	assert_int(count).is_equal(0)


func test_recent_log_caps_at_limit() -> void:
	IntentBus.clear_log()
	for i in range(250):
		IntentBus.dispatch({"type": "nav.back", "source": "system", "i": i})
	assert_int(IntentBus.recent().size()).is_equal(IntentBus.LOG_LIMIT)
	var last: Dictionary = IntentBus.recent()[IntentBus.recent().size() - 1]
	assert_int(int(last.i)).is_equal(249)


func test_handler_can_unsubscribe_during_dispatch() -> void:
	var count: Array = [0]
	var box := {"off": Callable()}
	box.off = IntentBus.on(
		"node.activate",
		func(_i: Dictionary) -> void:
			count[0] += 1
			if box.off.is_valid():
				box.off.call()
	)
	IntentBus.dispatch({"type": "node.activate", "source": "touch"})
	IntentBus.dispatch({"type": "node.activate", "source": "touch"})
	assert_int(count[0]).is_equal(1)


func after_test() -> void:
	IntentBus.clear_log()
