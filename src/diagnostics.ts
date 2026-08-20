export function webglSupport(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    if (gl2) {
      return `webgl2 · ${String(gl2.getParameter(gl2.RENDERER))}`;
    }
    const gl1 = canvas.getContext("webgl");
    if (gl1) {
      return `webgl1 · ${String(gl1.getParameter(gl1.RENDERER))}`;
    }
    return "no webgl context";
  } catch (err) {
    return `webgl threw · ${String(err)}`;
  }
}
