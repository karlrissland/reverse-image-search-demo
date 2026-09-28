import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API base URL is resolved at runtime from /config.js (see src/config.ts),
// so the build stays environment-agnostic and deployable to any Static Web App.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
