import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["mapbox-gl"],
  },
  server: {
    host: "0.0.0.0",
    port: 3002,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
