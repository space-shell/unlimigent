/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { tokens } from "./src/tokens";

export default defineConfig({
  base: "/unlimigent/",
  resolve: {
    alias: {
      // relay's exports map points browsers at .ts source; use the built file
      "@getpaseo/relay/e2ee": fileURLToPath(
        new URL("./node_modules/@getpaseo/relay/dist/e2ee.js", import.meta.url),
      ),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: "three", test: /node_modules[\\/](three|@react-three)/ },
            { name: "paseo", test: /node_modules[\\/](@getpaseo|tweetnacl)/ },
            { name: "elk", test: /node_modules[\\/]elkjs/ },
            { name: "vendor", test: /node_modules/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
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
