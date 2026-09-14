class_name Ship
extends Node3D
## The pilotable ship. Flight model: intent-driven thrust with exponential
## drag on the world plane; yaw faces travel. All input arrives as
## ship.thrust intents from the IntentBus — never raw events. The trail is a
## long world-space breadcrumb path (memory of where you came from): dropped
## at fixed distance intervals, fading and tapering over its length.

const ACCEL := 14.0
const DRAG := 2.6
const MAX_SPEED := 9.0
const SHIP_HEIGHT := 0.4
const SPAWN_POSITION := Vector2(4.0, 10.0)
const TRAIL_LENGTH := 160
const TRAIL_DROP_DIST := 0.18
const TRAIL_MIN_SPEED := 0.3

var position_2d := SPAWN_POSITION
var velocity := Vector2.ZERO
var thrust_input := Vector2.ZERO

var _body: MeshInstance3D
var _trail_root: Node3D
var _trail: Array[MeshInstance3D] = []
var _trail_mats: Array[StandardMaterial3D] = []
var _last_drop := Vector2(INF, INF)
var _off_thrust: Callable


func _ready() -> void:
	_body = MeshInstance3D.new()
	var mesh := PrismMesh.new()
	mesh.size = Vector3(0.55, 0.18, 0.75)
	# the ship alone is shaded — the only physical object in a flat world
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Tokens.INK
	mat.roughness = 0.8
	mesh.material = mat
	_body.mesh = mesh
	_body.rotation_degrees = Vector3(0, 180, 0)
	add_child(_body)
	var keel := MeshInstance3D.new()
	var keel_mesh := BoxMesh.new()
	keel_mesh.size = Vector3(0.1, 0.05, 0.6)
	var keel_mat := StandardMaterial3D.new()
	keel_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	keel_mat.albedo_color = Tokens.INDIGO
	keel_mesh.material = keel_mat
	keel.mesh = keel_mesh
	keel.position = Vector3(0, 0.12, 0)
	_body.add_child(keel)
	# world-space trail: segments live under the scene root, not the ship,
	# so the recorded path stays where you flew it
	_trail_root = Node3D.new()
	_trail_root.name = "ShipTrail"
	get_parent().call_deferred("add_child", _trail_root)
	for i in range(TRAIL_LENGTH):
		var segment := MeshInstance3D.new()
		var quad := QuadMesh.new()
		quad.size = Vector2.ONE * 0.22
		var tmat := StandardMaterial3D.new()
		tmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		tmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		var fade := 1.0 - float(i) / float(TRAIL_LENGTH)
		tmat.albedo_color = Color(Tokens.INDIGO, 0.0)
		quad.material = tmat
		segment.mesh = quad
		segment.rotation_degrees = Vector3(-90, 0, 0)
		segment.visible = false
		_trail_root.add_child(segment)
		_trail.append(segment)
		_trail_mats.append(tmat)
	_off_thrust = IntentBus.on("ship.thrust", _on_thrust)
	position = Vector3(position_2d.x, SHIP_HEIGHT, position_2d.y)


func _exit_tree() -> void:
	if _off_thrust.is_valid():
		_off_thrust.call()


func _on_thrust(intent: Dictionary) -> void:
	var dir: Variant = intent.get("dir")
	if dir is Dictionary:
		thrust_input = Vector2(float(dir.get("x", 0.0)), float(dir.get("y", 0.0)))


func _physics_process(delta: float) -> void:
	velocity += thrust_input.limit_length(1.0) * ACCEL * delta
	velocity *= exp(-DRAG * delta)
	velocity = velocity.limit_length(MAX_SPEED)
	position_2d += velocity * delta
	position = Vector3(position_2d.x, SHIP_HEIGHT, position_2d.y)
	if velocity.length() > 0.4:
		var yaw := atan2(velocity.x, velocity.y)
		rotation = Vector3(0, yaw, 0)
	_update_trail()


## Breadcrumb drop at fixed distance intervals — the path shows exactly
## where the ship has flown, independent of speed.
func _update_trail() -> void:
	if velocity.length() < TRAIL_MIN_SPEED:
		return
	if position_2d.distance_to(_last_drop) < TRAIL_DROP_DIST:
		return
	_last_drop = position_2d
	for i in range(_trail.size() - 1, 0, -1):
		_trail[i].position = _trail[i - 1].position
		_trail[i].visible = _trail[i - 1].visible
	_trail[0].position = Vector3(position_2d.x, SHIP_HEIGHT - 0.1, position_2d.y)
	_trail[0].visible = true
	for i in range(_trail.size()):
		var t := float(i) / float(_trail.size())
		_trail_mats[i].albedo_color = Color(Tokens.INDIGO, 0.6 * (1.0 - t))
		_trail[i].scale = Vector3.ONE * (1.0 - 0.7 * t)


## Nearest-entity queries fly the ship's plane position.
func plane_position() -> Vector2:
	return position_2d
