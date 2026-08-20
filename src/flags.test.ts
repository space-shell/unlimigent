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
  it("defaults every flag to off", () => {
    const defaults = flagDefaults();
    expect(Object.values(defaults).every((v) => v === false)).toBe(true);
  });

  it("returns defaults when storage is empty", () => {
    expect(readFlags(memoryStorage())).toEqual(flagDefaults());
  });

  it("persists an override and merges it over defaults", () => {
    const storage = memoryStorage();
    setFlag("stage1", true, storage);
    const flags = readFlags(storage);
    expect(flags.stage1).toBe(true);
    expect(flags.stage2).toBe(false);
  });

  it("ignores unknown or malformed persisted keys", () => {
    const storage = memoryStorage();
    storage.setItem(
      "unlimigent.flags",
      JSON.stringify({ stage1: true, bogus: true, stage2: "not-a-bool" }),
    );
    const flags = readFlags(storage);
    expect(flags.stage1).toBe(true);
    expect(flags.stage2).toBe(false);
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
