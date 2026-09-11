extends Node
## Boots the data runtime: gateway choice → GraphProjection → GraphStore.
## G1 ships the mock path (flag `g1`); the real gateway goes live with the
## G2 world bring-up on the pad.

var gateway: Node


func _ready() -> void:
	if Flags.is_on("g1"):
		start_mock()


func start_mock() -> void:
	_stop_gateway()
	gateway = MockGateway.new()
	add_child(gateway)
	gateway.subscribe(
		func(event: Dictionary) -> void: GraphProjection.project(GraphStore.graph, event)
	)
	gateway.start()


func start_real(url: String = "ws://100.127.193.39:6767/ws") -> void:
	_stop_gateway()
	var real := PaseoGateway.new()
	real.url = url
	gateway = real
	add_child(gateway)
	gateway.subscribe(
		func(event: Dictionary) -> void: GraphProjection.project(GraphStore.graph, event)
	)
	real.start()


func _stop_gateway() -> void:
	if gateway is Node and is_instance_valid(gateway):
		gateway.queue_free()
	gateway = null
