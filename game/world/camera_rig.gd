class_name CameraRig
extends Node
## Iso follow camera: keeps the classic isometric angle, tracks the ship
## (or an activated entity, briefly), smoothed. The Camera3D stays a dumb
## consumer — this rig computes target offsets only.

const FOLLOW_LERP := 4.0
const SHIP_OFFSET := Vector3(17, 17, 17)
const FOCUS_OFFSET := Vector3(11, 11, 11)
const FOCUS_RETURN_SEC := 4.0
## Ship hull ≈ 0.75 world units; ortho `size` is the full vertical extent.
## 50% screen occupation → 1.5; 2% → 37.5 (pilot-specified clamps).
const SIZE_MIN := 1.5
const SIZE_MAX := 37.5
const SIZE_DEFAULT := 20.0
## Zoom works in log-space with inertia: holding the stick accelerates the
## zoom velocity, releasing damps it — the zoom ramps in and glides out
## instead of tracking the stick linearly.
const ZOOM_ACCEL := 4.2
const ZOOM_VMAX := 3.0
const ZOOM_DAMP := 6.0
const RESET_TWEEN_SEC := 0.4
## Docking pulls in to a reading zoom; the previous zoom eases back after.
const FOCUS_SIZE := 6.0
const FOCUS_TWEEN_SEC := 0.5

var camera: Camera3D
var ship: Ship
var _focus_target: Variant = null
var _focus_until := 0.0
var _zoom_axis := 0.0
var _zoom_velocity := 0.0
var _reset_tween: Tween
var _off_activate: Callable
var _off_zoom: Callable
var _off_zoom_reset: Callable
var _focusing := false
var _size_before_focus := SIZE_DEFAULT


## Exponential right-stick zoom, clamped to ship-relative screen fractions.
static func clamp_size(value: float) -> float:
	return clampf(value, SIZE_MIN, SIZE_MAX)


func setup(p_camera: Camera3D, p_ship: Ship) -> void:
	camera = p_camera
	ship = p_ship
	camera.size = SIZE_DEFAULT
	# orientation locks once to the classic iso angle; from here on the rig
	# only translates — no orbiting around the ship (pilot preference)
	camera.position = ship.position + SHIP_OFFSET
	camera.look_at(ship.position, Vector3.UP)
	IntentBus.on("node.activate", _on_node_activate)
	IntentBus.on(
		"camera.zoom",
		func(intent: Dictionary) -> void:
			var delta: Variant = intent.get("delta")
			if delta is float or delta is int:
				_zoom_axis = float(delta)
	)
	IntentBus.on("camera.zoom.reset", func(_intent: Dictionary) -> void: _reset_zoom())


func _reset_zoom() -> void:
	if _reset_tween != null and _reset_tween.is_valid():
		_reset_tween.kill()
	_zoom_axis = 0.0
	_zoom_velocity = 0.0
	_reset_tween = create_tween()
	_reset_tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	_reset_tween.tween_property(camera, "size", SIZE_DEFAULT, RESET_TWEEN_SEC)


func _zoom_to(target: float, duration: float) -> void:
	if _reset_tween != null and _reset_tween.is_valid():
		_reset_tween.kill()
	_zoom_axis = 0.0
	_zoom_velocity = 0.0
	_reset_tween = create_tween()
	_reset_tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	_reset_tween.tween_property(camera, "size", clamp_size(target), duration)


func _on_node_activate(intent: Dictionary) -> void:
	var id: Variant = intent.get("id")
	if id is String and GraphStore.graph.nodes.has(id):
		_focus_target = id
		_focus_until = Time.get_ticks_msec() / 1000.0 + FOCUS_RETURN_SEC
		if not _focusing:
			_focusing = true
			_size_before_focus = camera.size
		_zoom_to(FOCUS_SIZE, FOCUS_TWEEN_SEC)


func _end_focus() -> void:
	_focus_target = null
	_focusing = false
	_zoom_to(_size_before_focus, FOCUS_TWEEN_SEC)


func _physics_process(delta: float) -> void:
	if camera == null or ship == null:
		return
	if absf(_zoom_axis) > 0.005:
		if _reset_tween != null and _reset_tween.is_valid():
			_reset_tween.kill()
		if _focusing:
			# manual zoom takes over from the focus pull
			_focusing = false
			_focus_target = null
		_zoom_velocity = clampf(
			_zoom_velocity + _zoom_axis * ZOOM_ACCEL * delta, -ZOOM_VMAX, ZOOM_VMAX
		)
	else:
		_zoom_velocity *= exp(-ZOOM_DAMP * delta)
	if absf(_zoom_velocity) > 0.001:
		camera.size = clamp_size(camera.size * exp(_zoom_velocity * delta))
	var target := ship.position + SHIP_OFFSET
	if _focus_target is String and Time.get_ticks_msec() / 1000.0 < _focus_until:
		var node: Variant = GraphStore.graph.nodes.get(_focus_target)
		if node is Dictionary:
			var pos: Dictionary = node.position
			target = Vector3(float(pos.x), 0.0, float(pos.y)) + FOCUS_OFFSET
		else:
			_focus_target = null
	elif _focusing:
		_end_focus()
	camera.position = camera.position.lerp(target, FOLLOW_LERP * delta)
