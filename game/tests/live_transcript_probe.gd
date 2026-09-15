extends SceneTree
## One-shot live transcript verification against the real daemon.
## Prints gateway frame/timeline diagnostics + accumulated transcript.
## Run: godot4 --headless --path game -s tests/live_transcript_probe.gd

const PROBE_AGENT_ID := "c7f7b892-a250-453e-82f2-abfa66924049"
const WAIT_SEC := 120.0


func _init() -> void:
	var gateway := PaseoGateway.new()
	get_root().add_child(gateway)
	gateway.url = "ws://100.127.193.39:6767/ws"
	gateway.start()
	var elapsed := 0.0
	while elapsed < WAIT_SEC:
		await process_frame
		elapsed += 1.0 / 60.0
	print("probe frame counts: %s" % str(gateway.frame_counts()))
	print("probe timeline items: %s" % str(gateway.timeline_item_counts()))
	var transcript: Array = gateway.get_transcript(PROBE_AGENT_ID)
	print("probe transcript entries: %d" % transcript.size())
	for message in transcript.slice(maxi(transcript.size() - 5, 0)):
		print("probe [%s] %s" % [message.role, String(message.text).substr(0, 90)])
	quit(0)
