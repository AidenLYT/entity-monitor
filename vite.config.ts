import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works at https://<user>.github.io/<repo>/ and locally.
  base: './',
  plugins: [react()],
  test: {
    include: ['{src,collector,shared}/**/*.test.ts'],
  },
});
