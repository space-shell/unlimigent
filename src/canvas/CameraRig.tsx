import { useFrame, useThree } from "@react-three/fiber";
import { useRuntime } from "../app/RuntimeContext";
import { PHI_ISO } from "../graph/store";

const DISTANCE = 100;

/** Syncs the three.js camera from store camera state. Dumb by design: all
 * camera decisions happen in the intent controller. Position on the
 * theta/phi arc gives the 3D isometric view of the ground plane. */
export function CameraRig() {
  const { store } = useRuntime();
  const camera = useThree((s) => s.camera);

  useFrame(() => {
    const cam = store.getState().camera;
    const th = cam.theta ?? 0;
    const ph = cam.phi ?? PHI_ISO;
    camera.position.set(
      cam.x + Math.cos(th) * Math.cos(ph) * DISTANCE,
      cam.y + Math.sin(th) * Math.cos(ph) * DISTANCE,
      Math.sin(ph) * DISTANCE,
    );
    camera.up.set(0, 0, 1);
    camera.lookAt(cam.x, cam.y, 0);
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
