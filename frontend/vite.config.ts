import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_DEV_SERVER_PORT ?? 5173),
      host: env.VITE_DEV_SERVER_HOST ?? "127.0.0.1"
    },
    build: {
      sourcemap: mode !== "production",
      chunkSizeWarningLimit: 6000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("ag-grid-react") || id.includes("ag-grid-community")) {
              return "aggrid";
            }
            return undefined;
          }
        }
      }
    }
  };
});
