import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Only the mock is tested here: it has no React Native dependencies, by
    // design. Component tests would need a native harness.
    include: ['tests/**/*.test.ts'],
  },
});
