import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { tokens } from "./tokens";
import { ErrorBoundary } from "./ErrorBoundary";
import { webglSupport } from "./diagnostics";
import { readFlags } from "./flags";
import { createRuntime, type Runtime } from "./app/runtime";
import { RuntimeProvider } from "./app/RuntimeProvider";
import { largeScenario, MockPaseoGateway } from "./gateway/mock";
import { FallbackGateway, RealPaseoGateway } from "./gateway/real";
import { GridLayer } from "./canvas/GridLayer";
import { NodeShadows } from "./canvas/NodeShadows";
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
  if (runtimeRef.current === null) {
    const params = new URLSearchParams(globalThis.location.search);
    // ?large = perf scenario, ?mock = mock daemon; default = live read-only
    // daemon with mock fallback (Pages origin cannot reach ws://).
    const gateway = params.has("large")
      ? new MockPaseoGateway({ scenario: largeScenario() })
      : params.has("mock")
        ? new MockPaseoGateway()
        : new FallbackGateway(new RealPaseoGateway(), new MockPaseoGateway());
    runtimeRef.current = createRuntime({ gateway });
  }
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
          <CameraRig />
          <NodeShadows />
          <NodeLayer runtime={runtime} viewport={viewport} />
        </Canvas>
        <GridLayer runtime={runtime} viewport={viewport} />
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
