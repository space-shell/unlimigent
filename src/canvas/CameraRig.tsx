import { useFrame, useThree } from "@react-three/fiber";
import { useRuntime } from "../app/RuntimeContext";

/** Syncs the three.js camera from store camera state. Dumb by design: all
 * camera decisions happen in the intent controller. The view rotation
 * (theta) turns the XY plane into the isometric orientation. */
export function CameraRig() {
  const { store } = useRuntime();
  const camera = useThree((s) => s.camera);

  useFrame(() => {
    const cam = store.getState().camera;
    camera.position.set(cam.x, cam.y, 10);
    camera.rotation.set(0, 0, -(cam.theta ?? 0));
    const ortho = camera as unknown as {
      zoom: number;
      updateProjectionMatrix: () => void;
    };
    if (ortho.zoom !== cam.zoom) {
      ortho.zoom = cam.zoom;
      ortho.updateProjectionMatrix();
    }
  });

  return null;
}
