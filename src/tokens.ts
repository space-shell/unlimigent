export const tokens = {
  paper: "#F6F3EE",
  ink: "#2B2A27",
  inkFaint: "#8A867E",
  terracotta: "#C26B4D",
  moss: "#7D8F70",
  indigo: "#5D6FA3",
  ochre: "#C6A233",
  plum: "#8E6E7E",
} as const;

export type Token = keyof typeof tokens;

export function cssVarName(token: Token): string {
  return `--${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

export function injectTokenVars(root: HTMLElement = document.documentElement): void {
  for (const [token, value] of Object.entries(tokens) as [Token, string][]) {
    root.style.setProperty(cssVarName(token), value);
  }
}
