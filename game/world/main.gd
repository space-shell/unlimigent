extends Node3D
## G0 boot scene grown into the G2 world: paper clear color, unshaded token
## materials, plus-mark grid; behind `g2` — pilotable ship, world renderer,
## approach-to-interact, iso follow camera, HUD. Everything visible is
## deterministic — no lighting dependency for the on-device render check.

const HUD_FONT_PATH := "res://assets/fonts/JetBrainsMono-Regular.ttf"
## INTENT.md: no text below 14 px relative to screen DPI — HUD included.
const HUD_MIN_PX := 16.0

var _hud: Label
var _hud_sub: Label
var _ship_input: ShipInput
var _camera_rig: CameraRig
var _connection_state := "offline"
var _fps_accum := 0.0

@onready var camera: Camera3D = $Camera
@onready var ground: MeshInstance3D = $Ground
@onready var ship: Ship = $Ship
@onready var interaction: Node3D = $Interaction


func _ready() -> void:
	RenderingServer.set_default_clear_color(Tokens.PAPER)
	camera.position = Vector3(17, 17, 17)
	camera.look_at(Vector3.ZERO, Vector3.UP)
	_ground_material()
	var grid := InfiniteGrid.new()
	add_child(grid)
	grid.setup(camera, ship if Flags.is_on("g2") else null)
	_boot_diagnostics()
	if Flags.is_on("g2"):
		_wire_g2()
	else:
		ship.visible = false
		ship.set_physics_process(false)
		interaction.visible = false
		interaction.set_physics_process(false)


func _ground_material() -> void:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(Tokens.INK_FAINT, 0.12)
	ground.material_override = mat


func _wire_g2() -> void:
	_ship_input = ShipInput.new()
	_ship_input.set_camera(camera)
	add_child(_ship_input)
	_camera_rig = CameraRig.new()
	add_child(_camera_rig)
	_camera_rig.setup(camera, ship)
	var compass := Compass.new()
	compass.setup(ship, camera)
	var canvas := CanvasLayer.new()
	canvas.layer = 8
	add_child(canvas)
	canvas.add_child(compass)
	_build_hud()
	GraphStore.graph.changed.connect(_update_hud)
	if Runtime.gateway != null:
		Runtime.gateway.subscribe(_on_gateway_event)
	_connection_state = Runtime.connection_state
	_update_hud()


func _build_hud() -> void:
	var canvas := CanvasLayer.new()
	canvas.layer = 5
	add_child(canvas)
	var font := load(HUD_FONT_PATH)
	var screen_h := get_viewport().get_visible_rect().size.y
	var scale: float = maxf(1.0, screen_h / 800.0)
	var title_px := int(17 * scale)
	var sub_px := int(13 * scale)
	_hud = Label.new()
	_hud.text = "unlimigent"
	_hud.add_theme_font_override("font", font)
	_hud.add_theme_font_size_override("font_size", title_px)
	_hud.modulate = Tokens.INK
	_hud.position = Vector2(24, 18)
	canvas.add_child(_hud)
	_hud_sub = Label.new()
	_hud_sub.add_theme_font_override("font", font)
	_hud_sub.add_theme_font_size_override("font_size", sub_px)
	_hud_sub.modulate = Tokens.INK_FAINT
	_hud_sub.position = Vector2(24, 18 + title_px + 14)
	_hud_sub.text = "left: fly · right stick: zoom · stick click: reset · RT: boost · right hold: dock"
	canvas.add_child(_hud_sub)


func _on_gateway_event(event: Dictionary) -> void:
	if event.get("kind", "") == "connection":
		_connection_state = String(event.get("state", "?"))
		_update_hud()


func _process(delta: float) -> void:
	if _hud_sub == null:
		return
	_fps_accum += delta
	if _fps_accum >= 0.5:
		_fps_accum = 0.0
		_hud_sub.text = (
			"%d entities · %d fps · left: fly · right hold: dock"
			% [GraphStore.graph.nodes.size(), Engine.get_frames_per_second()]
		)
		if Flags.is_on("gb"):
			print("hud: %s | %s" % [_hud.text, _hud_sub.text])


func _update_hud() -> void:
	if _hud == null:
		return
	_hud.text = "unlimigent · %s" % _connection_state


func _boot_diagnostics() -> void:
	var flag_states: Array[String] = []
	for flag_name in Flags.FLAG_NAMES:
		flag_states.append("%s=%s" % [flag_name, Flags.is_on(flag_name)])
	print("unlimigent G0 · flags: %s" % ", ".join(flag_states))
	print("tokens: paper=%s ink=%s" % [Tokens.PAPER.to_html(), Tokens.INK.to_html()])
	var joypads: Array = Input.get_connected_joypads()
	print("gc: joypads=%d %s" % [joypads.size(), str(joypads)])


func _unhandled_input(event: InputEvent) -> void:
	if not Flags.is_on("gb"):
		return
	if event is InputEventScreenTouch:
		print("gc: touch pressed=%s pos=%s idx=%s" % [event.pressed, event.position, event.index])
	elif event is InputEventScreenDrag:
		print(
			(
				"gc: drag pos=%s rel=%s vel=%s idx=%s"
				% [event.position, event.relative, event.velocity, event.index]
			)
		)
	elif event is InputEventJoypadMotion:
		var axis: InputEventJoypadMotion = event
		if absf(axis.axis_value) > 0.15:
			print("gc: joy axis=%s value=%.2f" % [axis.axis, axis.axis_value])
	elif event is InputEventJoypadButton:
		var btn: InputEventJoypadButton = event
		print(
			(
				"gc: joybtn button=%s pressed=%s pressure=%.2f"
				% [btn.button_index, btn.pressed, btn.pressure]
			)
		)
