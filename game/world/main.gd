extends Node3D
## G0 boot scene: empty isometric plane, token clear color, boot diagnostics.
## Ship, entities, and the world renderer land in G2.

@onready var camera: Camera3D = $Camera


func _ready() -> void:
	RenderingServer.set_default_clear_color(Tokens.PAPER)
	camera.position = Vector3(10, 10, 10)
	camera.look_at(Vector3.ZERO, Vector3.UP)
	_boot_diagnostics()


func _boot_diagnostics() -> void:
	var flag_states: Array[String] = []
	for flag_name in Flags.FLAG_NAMES:
		flag_states.append("%s=%s" % [flag_name, Flags.is_on(flag_name)])
	print("unlimigent G0 · flags: %s" % ", ".join(flag_states))
	print("tokens: paper=%s ink=%s" % [Tokens.PAPER.to_html(), Tokens.INK.to_html()])
