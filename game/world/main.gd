extends Node3D
## G0 boot scene: paper clear color, unshaded token materials, plus-mark grid.
## Flat/unlit by design (INTENT.md design language); the ship lands in G2.
## Everything visible is deterministic — no lighting dependency for the
## on-device render check.

const GRID_STEP := 4.0
const GRID_EXTENT := 5  # 11x11 intersections
const CROSS_ARM := 0.5
const CROSS_THICKNESS := 0.06

@onready var camera: Camera3D = $Camera
@onready var ground: MeshInstance3D = $Ground


func _ready() -> void:
	RenderingServer.set_default_clear_color(Tokens.PAPER)
	camera.position = Vector3(10, 10, 10)
	camera.look_at(Vector3.ZERO, Vector3.UP)
	_ground_material()
	_grid()
	_boot_diagnostics()


func _ground_material() -> void:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(Tokens.INK_FAINT, 0.12)
	ground.material_override = mat


func _grid() -> void:
	var arm := BoxMesh.new()
	arm.size = Vector3(CROSS_ARM, CROSS_THICKNESS, CROSS_THICKNESS)
	var bar := BoxMesh.new()
	bar.size = Vector3(CROSS_THICKNESS, CROSS_THICKNESS, CROSS_ARM)

	var grid_mat := StandardMaterial3D.new()
	grid_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	grid_mat.albedo_color = Color(Tokens.INK_FAINT, 0.55)
	var origin_mat := StandardMaterial3D.new()
	origin_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	origin_mat.albedo_color = Tokens.INK

	var y := CROSS_THICKNESS / 2.0
	for ix in range(-GRID_EXTENT, GRID_EXTENT + 1):
		for iz in range(-GRID_EXTENT, GRID_EXTENT + 1):
			var is_origin := ix == 0 and iz == 0
			var mat_used := origin_mat if is_origin else grid_mat
			var pos := Vector3(ix * GRID_STEP, y, iz * GRID_STEP)
			_cross(arm, bar, mat_used, pos)


func _cross(arm_mesh: BoxMesh, bar_mesh: BoxMesh, mat: StandardMaterial3D, pos: Vector3) -> void:
	for mesh in [arm_mesh, bar_mesh]:
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.material_override = mat
		mi.position = pos
		add_child(mi)


func _boot_diagnostics() -> void:
	var flag_states: Array[String] = []
	for flag_name in Flags.FLAG_NAMES:
		flag_states.append("%s=%s" % [flag_name, Flags.is_on(flag_name)])
	print("unlimigent G0 · flags: %s" % ", ".join(flag_states))
	print("tokens: paper=%s ink=%s" % [Tokens.PAPER.to_html(), Tokens.INK.to_html()])
