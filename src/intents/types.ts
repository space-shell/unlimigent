export type IntentSource = "touch" | "gamepad" | "gaze" | "voice" | "system";

export type Vec2 = { x: number; y: number };

export type Intent =
  | { type: "nav.move"; source: IntentSource; dir: Vec2 }
  | { type: "nav.jump"; source: IntentSource; dir: Vec2 }
  | { type: "nav.back"; source: IntentSource }
  | { type: "node.activate"; source: IntentSource; id?: string }
  | { type: "node.context"; source: IntentSource; id?: string }
  | { type: "camera.pan"; source: IntentSource; delta: Vec2 }
  | { type: "camera.zoom"; source: IntentSource; delta: number; origin?: Vec2 }
  | { type: "camera.teleport"; source: IntentSource; target: Vec2 }
  | { type: "camera.focus"; source: IntentSource; id?: string }
  | { type: "ui.menu"; source: IntentSource }
  | { type: "ui.back"; source: IntentSource }
  | { type: "ui.voice"; source: IntentSource };

export type IntentType = Intent["type"];

export interface IntentEnvelope<I extends Intent = Intent> {
  intent: I;
  at: number;
  seq: number;
}
