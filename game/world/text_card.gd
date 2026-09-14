class_name TextCard
extends Node3D
## A standing text card: ink border + paper backing + Label3D. Aligned to
## the zy plane (INTENT.md canon — rotation 0 faces +Z, the camera-side
## diagonal). All text in the world renders through this class so the
## 14px-DPI minimum and card style stay universal.

const BORDER := 0.07

var label: Label3D
var text_color: Color = Color.WHITE

var _font: FontFile
var _font_size: int
var _pixel_size: float
var _pad: float
var _backing_mesh: QuadMesh
var _border_mesh: QuadMesh


static func create(
	text_value: String,
	font: FontFile,
	font_size: int,
	color: Color,
	pixel_size: float,
	pad: float = 0.16,
) -> TextCard:
	var card := TextCard.new()
	card._font = font
	card._font_size = font_size
	card._pixel_size = pixel_size
	card._pad = pad
	card.text_color = color
	card._build(text_value)
	return card


func _build(text_value: String) -> void:
	_border_mesh = QuadMesh.new()
	var border_mat := StandardMaterial3D.new()
	border_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	border_mat.albedo_color = Tokens.INK
	_border_mesh.material = border_mat
	var border := MeshInstance3D.new()
	border.mesh = _border_mesh
	border.position = Vector3(0, 0, -0.03)
	add_child(border)

	_backing_mesh = QuadMesh.new()
	var backing_mat := StandardMaterial3D.new()
	backing_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	backing_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	backing_mat.albedo_color = Color(Tokens.PAPER, 0.94)
	_backing_mesh.material = backing_mat
	var backing := MeshInstance3D.new()
	backing.mesh = _backing_mesh
	backing.position = Vector3(0, 0, -0.02)
	add_child(backing)

	label = Label3D.new()
	label.font = _font
	label.font_size = _font_size
	label.modulate = text_color
	label.no_depth_test = true
	label.pixel_size = _pixel_size
	label.outline_size = 0
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.position = Vector3(0, 0, 0.0)
	add_child(label)
	set_text(text_value)


func set_text(text_value: String) -> void:
	label.text = text_value
	var size_px: Vector2 = _font.get_multiline_string_size(
		label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size
	)
	var w := maxf(size_px.x * _pixel_size, 0.2)
	var h := maxf(size_px.y * _pixel_size, _pixel_size * _font_size)
	_backing_mesh.size = Vector2(w + _pad * 2.0, h + _pad * 2.0)
	_border_mesh.size = Vector2(w + _pad * 2.0 + BORDER, h + _pad * 2.0 + BORDER)


func set_pixel_size(pixel_size: float) -> void:
	_pixel_size = pixel_size
	label.pixel_size = pixel_size
	set_text(label.text)
