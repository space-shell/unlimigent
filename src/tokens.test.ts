import { describe, expect, it } from "vitest";
import { cssVarName, tokens } from "./tokens";

describe("tokens", () => {
  it("exposes the INTENT.md palette", () => {
    expect(tokens.paper).toBe("#F6F3EE");
    expect(tokens.ink).toBe("#2B2A27");
    expect(tokens.terracotta).toBe("#C26B4D");
    expect(tokens.moss).toBe("#7D8F70");
    expect(tokens.indigo).toBe("#5D6FA3");
    expect(tokens.ochre).toBe("#C6A233");
    expect(tokens.plum).toBe("#8E6E7E");
    expect(tokens.inkFaint).toBe("#8A867E");
  });

  it("maps token names to kebab-case css variables", () => {
    expect(cssVarName("paper")).toBe("--paper");
    expect(cssVarName("inkFaint")).toBe("--ink-faint");
  });
});
