import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

let commitHash = process.env.COMMIT_HASH || 'unknown';
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  // git not available (Docker build) — use COMMIT_HASH env var or fallback
}
const pkg = JSON.parse(
  execSync('cat package.json').toString()
);

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
      '/display': {
        target: 'http://localhost:3000',
      },
      '/uploads': {
        target: 'http://localhost:3000',
      },
    },
  },
});
