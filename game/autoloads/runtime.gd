extends Node
## Boots the data runtime: gateway choice → GraphProjection → GraphStore.
## G1 ships the mock path (flag `g1`); the real gateway goes live with the
## G2 world bring-up on the pad.

var gateway: Node
## Last seen connection state — read by the HUD when it wires up late
## (autoloads start before the scene subscribes).
var connection_state := "offline"


func _note_connection(event: Dictionary) -> void:
	if event.get("kind", "") == "connection":
		connection_state = String(event.get("state", "offline"))


func _ready() -> void:
	if Flags.is_on("g1") or Flags.is_on("g2"):
		start_mock()


func start_mock() -> void:
	_stop_gateway()
	# g2 brings the world up on the large perf scenario (24 workspaces,
	# 6 agents — the device bar); plain g1 uses the default scenario.
	var scenario: Dictionary = (
		MockGateway.large_scenario() if Flags.is_on("g2") else MockGateway.default_scenario()
	)
	gateway = MockGateway.new(scenario)
	add_child(gateway)
	gateway.subscribe(_on_gateway_event)
	gateway.start()


func start_real(url: String = "ws://100.127.193.39:6767/ws") -> void:
	_stop_gateway()
	var real := PaseoGateway.new()
	real.url = url
	gateway = real
	add_child(gateway)
	gateway.subscribe(_on_gateway_event)
	real.start()


func _stop_gateway() -> void:
	if gateway is Node and is_instance_valid(gateway):
		gateway.queue_free()
	gateway = null


func _on_gateway_event(event: Dictionary) -> void:
	_note_connection(event)
	GraphProjection.project(GraphStore.graph, event)
