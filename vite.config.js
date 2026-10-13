import { defineConfig } from 'vite';

// Relative assets also work at https://<user>.github.io/<repo>/.
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist' }
});
