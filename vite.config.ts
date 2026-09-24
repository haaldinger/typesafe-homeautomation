import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      // AURA_API lets a second dev instance point at a server on another port.
      "/api": process.env.AURA_API ?? "http://127.0.0.1:8787",
    },
  },
});
