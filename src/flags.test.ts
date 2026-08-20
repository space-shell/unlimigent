import { describe, expect, it } from "vitest";
import { flagDefaults, readFlags, resetFlags, setFlag } from "./flags";

function memoryStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

describe("flags", () => {
  it("defaults shipped stages on, future stages off", () => {
    const defaults = flagDefaults();
    expect(defaults.stage1).toBe(true);
    expect(defaults.stage2).toBe(true);
    expect(defaults.stage4).toBe(true);
    for (const [name, on] of Object.entries(defaults)) {
      if (!["stage1", "stage2", "stage4"].includes(name)) expect(on).toBe(false);
    }
  });

  it("returns defaults when storage is empty", () => {
    expect(readFlags(memoryStorage())).toEqual(flagDefaults());
  });

  it("persists an override and merges it over defaults", () => {
    const storage = memoryStorage();
    setFlag("stage5", true, storage);
    const flags = readFlags(storage);
    expect(flags.stage5).toBe(true);
    expect(flags.stage6).toBe(false);
  });

  it("ignores unknown or malformed persisted keys", () => {
    const storage = memoryStorage();
    storage.setItem(
      "unlimigent.flags",
      JSON.stringify({ stage5: true, bogus: true, stage6: "not-a-bool" }),
    );
    const flags = readFlags(storage);
    expect(flags.stage5).toBe(true);
    expect(flags.stage6).toBe(false);
    expect("bogus" in flags).toBe(false);
  });

  it("falls back to defaults on corrupt json", () => {
    const storage = memoryStorage();
    storage.setItem("unlimigent.flags", "{not json");
    expect(readFlags(storage)).toEqual(flagDefaults());
  });

  it("reset clears overrides", () => {
    const storage = memoryStorage();
    setFlag("voice", true, storage);
    expect(resetFlags(storage)).toEqual(flagDefaults());
    expect(readFlags(storage)).toEqual(flagDefaults());
  });
});
