import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  return {
    plugins: [react()],
    envDir: "..",
    server: {
      port: 5173,
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      proxy: { "/api": `http://127.0.0.1:${env.PORT || 4000}` },
    },
  };
});
