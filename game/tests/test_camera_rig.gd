# Camera rig unit tests — zoom clamping (right-stick x-axis zoom).
extends GdUnitTestSuite


func test_zoom_clamps_low() -> void:
	assert_float(CameraRig.clamp_size(1.0)).is_equal(CameraRig.SIZE_MIN)


func test_zoom_clamps_high() -> void:
	assert_float(CameraRig.clamp_size(500.0)).is_equal(CameraRig.SIZE_MAX)


func test_zoom_passes_through_range() -> void:
	assert_float(CameraRig.clamp_size(20.0)).is_equal(20.0)
	assert_float(CameraRig.clamp_size(7.0)).is_equal(7.0)
	assert_float(CameraRig.clamp_size(48.0)).is_equal(48.0)
