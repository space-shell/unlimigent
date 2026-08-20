export const FLAG_NAMES = [
  "stage1",
  "stage2",
  "stage3",
  "stage4",
  "stage5",
  "stage6",
  "voice",
] as const;

export type FlagName = (typeof FLAG_NAMES)[number];
export type FlagState = Readonly<Record<FlagName, boolean>>;

// Stage 1 (graph core) and Stage 2 (canvas + touch) verified complete; later
// stages stay default-off until they clear the device bar.
const DEFAULTS: FlagState = {
  stage1: true,
  stage2: true,
  stage3: false,
  stage4: false,
  stage5: false,
  stage6: false,
  voice: false,
};

const STORAGE_KEY = "unlimigent.flags";

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function flagDefaults(): FlagState {
  return DEFAULTS;
}

export function readFlags(storage: Storage | null = defaultStorage()): FlagState {
  if (!storage) return DEFAULTS;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULTS;
    const overrides = parsed as Record<string, unknown>;
    const merged: Record<FlagName, boolean> = { ...DEFAULTS };
    for (const name of FLAG_NAMES) {
      const value = overrides[name];
      if (typeof value === "boolean") merged[name] = value;
    }
    return merged;
  } catch {
    return DEFAULTS;
  }
}

export function setFlag(
  name: FlagName,
  value: boolean,
  storage: Storage | null = defaultStorage(),
): FlagState {
  const merged: Record<FlagName, boolean> = { ...readFlags(storage), [name]: value };
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // storage unavailable or full - flags stay for this session only
  }
  return merged;
}

export function resetFlags(storage: Storage | null = defaultStorage()): FlagState {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return DEFAULTS;
}
