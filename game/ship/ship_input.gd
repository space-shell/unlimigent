class_name ShipInput
extends Node
## Translates touch (virtual joystick + dock area) and gamepad input into
## IntentBus intents. Keyboard-less rule: nothing here reads a keyboard.
## Left 55% of the screen = joystick; right side = dock hold. Gamepad: left
## stick + face button A.
##
## Thrust is mapped through the camera basis projected onto the ground plane,
## so stick-up ALWAYS moves the ship up on screen regardless of iso angle
## (INTENT.md axes: x+ top-left, y+ bottom-right, z+ normal).

const JOY_DEADZONE := 0.15
const STICK_RADIUS_PX := 110.0
const DOCK_BUTTON := JOY_BUTTON_A

var _joystick_active := false
var _joystick_anchor := Vector2.ZERO
var _gamepad_thrusting := false
var _boost_sent := false
var _camera: Camera3D

var _stick_base: Panel
var _stick_knob: Panel


func set_camera(camera: Camera3D) -> void:
	_camera = camera


func _ready() -> void:
	var canvas := CanvasLayer.new()
	canvas.layer = 10
	add_child(canvas)
	_stick_base = _make_circle(Color(Tokens.INK_FAINT, 0.25), 1.0)
	_stick_knob = _make_circle(Color(Tokens.INK, 0.55), 0.45)
	canvas.add_child(_stick_base)
	canvas.add_child(_stick_knob)


func _make_circle(color: Color, radius_scale: float) -> Panel:
	var panel := Panel.new()
	var diameter := STICK_RADIUS_PX * 2.0 * radius_scale
	panel.custom_minimum_size = Vector2.ONE * diameter
	panel.size = panel.custom_minimum_size
	panel.modulate = color
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color = Color.WHITE
	style.set_corner_radius_all(int(STICK_RADIUS_PX * radius_scale))
	panel.add_theme_stylebox_override("panel", style)
	return panel


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed and event.position.x < _screen_left_split():
			_joystick_active = true
			_joystick_anchor = event.position
			_show_stick(_joystick_anchor, Vector2.ZERO)
		elif event.pressed:
			IntentBus.dispatch({"type": "ship.dock", "source": "touch"})
		elif _joystick_active:
			_joystick_active = false
			_hide_stick()
			IntentBus.dispatch(
				{"type": "ship.thrust", "source": "touch", "dir": {"x": 0.0, "y": 0.0}}
			)
		else:
			IntentBus.dispatch({"type": "ship.undock", "source": "touch"})
	elif event is InputEventScreenDrag and _joystick_active:
		var drag := event as InputEventScreenDrag
		var clamped: Vector2 = (drag.position - _joystick_anchor).limit_length(STICK_RADIUS_PX)
		_show_stick(_joystick_anchor, clamped)
		var dir := clamped / STICK_RADIUS_PX
		IntentBus.dispatch(
			{"type": "ship.thrust", "source": "touch", "dir": _plane_dir(Vector2(dir.x, -dir.y))}
		)
	elif event is InputEventJoypadButton and event.button_index == DOCK_BUTTON:
		IntentBus.dispatch(
			{"type": "ship.dock" if event.pressed else "ship.undock", "source": "gamepad"}
		)


func _physics_process(_delta: float) -> void:
	var left := Vector2(
		Input.get_joy_axis(0, JOY_AXIS_LEFT_X), Input.get_joy_axis(0, JOY_AXIS_LEFT_Y)
	)
	if left.length() > JOY_DEADZONE:
		_gamepad_thrusting = true
		IntentBus.dispatch(
			{
				"type": "ship.thrust",
				"source": "gamepad",
				"dir": _plane_dir(Vector2(left.x, -left.y))
			}
		)
	elif _gamepad_thrusting:
		_gamepad_thrusting = false
		IntentBus.dispatch(
			{"type": "ship.thrust", "source": "gamepad", "dir": {"x": 0.0, "y": 0.0}}
		)
	var right_x := Input.get_joy_axis(0, JOY_AXIS_RIGHT_X)
	# continuous zoom: every physics frame carries the raw axis so the rig
	# never misses an update
	IntentBus.dispatch({"type": "camera.zoom", "source": "gamepad", "delta": right_x})
	var trigger := Input.get_joy_axis(0, JOY_AXIS_TRIGGER_RIGHT)
	if absf(trigger) > 0.02 or _boost_sent:
		var value := maxf(0.0, trigger)
		IntentBus.dispatch({"type": "ship.boost", "source": "gamepad", "value": value})
		_boost_sent = value > 0.02


## Screen-space direction → ground-plane direction via the camera basis
## projected onto the plane. Returns graph-plane {x, y} = world {x, z}.
func _plane_dir(screen_dir: Vector2) -> Dictionary:
	if _camera == null:
		return {"x": screen_dir.x, "y": screen_dir.y}
	var basis := _camera.global_transform.basis
	var right := Vector3(basis.x.x, 0.0, basis.x.z)
	var up := Vector3(basis.y.x, 0.0, basis.y.z)
	right = right.normalized() if right.length() > 0.001 else Vector3.RIGHT
	up = up.normalized() if up.length() > 0.001 else Vector3.BACK
	var world := right * screen_dir.x + up * screen_dir.y
	return {"x": world.x, "y": world.z}


func _screen_left_split() -> float:
	return get_viewport().get_visible_rect().size.x * 0.55


func _show_stick(anchor: Vector2, offset: Vector2) -> void:
	_stick_base.visible = true
	_stick_knob.visible = true
	_stick_base.position = anchor - _stick_base.size / 2.0
	_stick_knob.position = anchor + offset - _stick_knob.size / 2.0


func _hide_stick() -> void:
	_stick_base.visible = false
	_stick_knob.visible = false
