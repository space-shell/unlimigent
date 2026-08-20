import { Canvas } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { tokens } from "./tokens";

export function App() {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 10], zoom: 64 }}
      style={{ touchAction: "none" }}
    >
      <color attach="background" args={[tokens.paper]} />
      <Html center>
        <div className="boot">
          <span className="boot-title">unlimigent</span>
          <span className="boot-sub">stage 0 · scaffold</span>
        </div>
      </Html>
    </Canvas>
  );
}
