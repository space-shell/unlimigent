import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { tokens } from "./tokens";
import { ErrorBoundary } from "./ErrorBoundary";
import { webglSupport } from "./diagnostics";
import { readFlags } from "./flags";
import { createRuntime, type Runtime } from "./app/runtime";
import { RuntimeProvider } from "./app/RuntimeProvider";
import { CameraRig } from "./canvas/CameraRig";
import { NodeLayer } from "./canvas/NodeLayer";
import { EdgeOverlay } from "./canvas/EdgeOverlay";
import { GestureLayer } from "./canvas/GestureLayer";
import { InfoBar } from "./canvas/InfoBar";

function useViewport() {
  const [vp, setVp] = useState(() => ({
    width: globalThis.innerWidth,
    height: globalThis.innerHeight,
  }));
  useEffect(() => {
    const onResize = () =>
      setVp({ width: globalThis.innerWidth, height: globalThis.innerHeight });
    globalThis.addEventListener("resize", onResize);
    return () => globalThis.removeEventListener("resize", onResize);
  }, []);
  return vp;
}

function GraphApp() {
  const viewport = useViewport();
  const runtimeRef = useRef<Runtime | null>(null);
  if (runtimeRef.current === null) runtimeRef.current = createRuntime();
  const runtime = runtimeRef.current;

  return (
    <RuntimeProvider runtime={runtime}>
      <div className="graph-root">
        <Canvas
          orthographic
          camera={{ position: [0, 0, 10], zoom: 48 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
        >
          <color attach="background" args={[tokens.paper]} />
          <CameraRig runtime={runtime} />
          <NodeLayer runtime={runtime} viewport={viewport} />
        </Canvas>
        <EdgeOverlay runtime={runtime} viewport={viewport} />
        <GestureLayer runtime={runtime} />
        <InfoBar runtime={runtime} />
      </div>
    </RuntimeProvider>
  );
}

function BootScreen() {
  return (
    <div className="boot">
      <span className="boot-title">unlimigent</span>
      <span className="boot-sub">stage 1 core · canvas arrives with stage 2</span>
    </div>
  );
}

export function App() {
  const [stage1] = useState(() => readFlags().stage1);
  return (
    <>
      <ErrorBoundary>
        {stage1 ? <GraphApp /> : <BootScreen />}
      </ErrorBoundary>
      <div className="diag">{webglSupport()}</div>
    </>
  );
}
