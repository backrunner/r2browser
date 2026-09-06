import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import UnoCSS from 'unocss/vite';
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// react-pdf pins its own PDF.js version; its worker must come from that copy.
const pdfRequire = createRequire(require.resolve('react-pdf'));

// https://vitejs.dev/config/
export default defineConfig(() => ({
  plugins: [react(), UnoCSS()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  clearScreen: false,
  server: {
    port: 3000,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(import.meta.dirname, "./src") },
      {
        find: /^pdfjs-worker\?url$/,
        replacement: `${pdfRequire.resolve('pdfjs-dist/build/pdf.worker.min.mjs')}?url`,
      },
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("react-pdf") || id.includes("pdfjs-dist")) {
            return "vendor-pdf";
          }

          if (id.includes("prismjs") || id.includes("react-zoom-pan-pinch")) {
            return "vendor-preview";
          }

          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router-dom/")
          ) {
            return "vendor-react";
          }

          if (id.includes("@iconify/react") || id.includes("lucide-react") || id.includes("@radix-ui/")) {
            return "vendor-ui";
          }

          return undefined;
        },
      },
    },
  },
}));
