import { useEffect, useRef, type ReactNode } from "react";
import { createRuntime, type Runtime } from "./runtime";
import { CameraController } from "../canvas/controller";
import { RuntimeContext } from "./RuntimeContext";

export function RuntimeProvider({
  children,
  runtime: external,
}: {
  children: ReactNode;
  runtime?: Runtime;
}) {
  const ref = useRef<Runtime | null>(null);
  if (ref.current === null) {
    ref.current = external ?? createRuntime();
  }
  const runtime = ref.current;

  useEffect(() => {
    const controller = new CameraController(runtime.store, runtime.bus, {
      getViewport: () => ({
        width: globalThis.innerWidth,
        height: globalThis.innerHeight,
      }),
    });
    controller.attach();
    void runtime.start();
    return () => {
      controller.detach();
      runtime.stop();
    };
  }, [runtime]);

  return (
    <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>
  );
}
