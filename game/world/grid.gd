class_name InfiniteGrid
extends Node3D
## The plus-mark ground grid, visually infinite: a MultiMesh pool that
## re-centres on the ship (snapped to the grid step) whenever it crosses a
## cell, covering the current ortho view with margin. Two MultiMeshes — one
## per cross arm — unshaded, ink-faint, flat.

const STEP := 4.0
const CROSS_ARM := 0.5
const CROSS_THICKNESS := 0.02
const GRID_Y := 0.012
const VIEW_MARGIN := 1.6

var _arm_x: MultiMeshInstance3D
var _arm_z: MultiMeshInstance3D
var _center_cell := Vector2i(10_000, 10_000)
var _camera: Camera3D
var _follow: Node
var _last_radius := -1


func setup(camera: Camera3D, follow: Node = null) -> void:
	_camera = camera
	_follow = follow


func _ready() -> void:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(Tokens.INK_FAINT, 0.5)

	_arm_x = _make_arm(Vector3(CROSS_ARM, CROSS_THICKNESS, CROSS_THICKNESS), mat)
	_arm_z = _make_arm(Vector3(CROSS_THICKNESS, CROSS_THICKNESS, CROSS_ARM), mat)
	add_child(_arm_x)
	add_child(_arm_z)


func _make_arm(box_size: Vector3, mat: StandardMaterial3D) -> MultiMeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = box_size
	mesh.material = mat
	var mi := MultiMeshInstance3D.new()
	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.mesh = mesh
	mi.multimesh = multimesh
	return mi


func _physics_process(_delta: float) -> void:
	var center := Vector2.ZERO
	if _follow != null and is_instance_valid(_follow):
		var pos: Vector3 = _follow.position
		center = Vector2(pos.x, pos.z)
	var cell := Vector2i(int(floor(center.x / STEP)), int(floor(center.y / STEP)))
	var coverage := 30.0
	if _camera != null and _camera.orthogonal:
		coverage = _camera.size * VIEW_MARGIN
	var radius := int(ceil(coverage / STEP))
	if cell == _center_cell and radius == _last_radius:
		return
	_center_cell = cell
	_last_radius = radius
	_rebuild_instances(cell, radius)


func _rebuild_instances(cell: Vector2i, radius: int) -> void:
	var count := (radius * 2 + 1) * (radius * 2 + 1)
	_arm_x.multimesh.instance_count = count
	_arm_z.multimesh.instance_count = count
	_arm_x.multimesh.visible_instance_count = count
	_arm_z.multimesh.visible_instance_count = count
	var i := 0
	for ix in range(cell.x - radius, cell.x + radius + 1):
		for iz in range(cell.y - radius, cell.y + radius + 1):
			var pos := Vector3(ix * STEP, GRID_Y, iz * STEP)
			_arm_x.multimesh.set_instance_transform(i, Transform3D(Basis(), pos))
			_arm_z.multimesh.set_instance_transform(i, Transform3D(Basis(), pos))
			i += 1
