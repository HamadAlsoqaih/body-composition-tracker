import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// For GitHub Pages project sites the app is served from /<repo-name>/.
// Set base to "./" so assets resolve correctly regardless of repo name.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
