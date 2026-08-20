/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { tokens } from "./src/tokens";

export default defineConfig({
  base: "/unlimigent/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "unlimigent",
        short_name: "unlimigent",
        description: "A spatial user experience for the management and orchestration of AI agents",
        display: "standalone",
        background_color: tokens.paper,
        theme_color: tokens.paper,
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
  },
  test: {
    environment: "node",
  },
});
