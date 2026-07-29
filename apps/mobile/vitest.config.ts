import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Business rules only — the in-memory fixtures under tests/fixtures/mock/
    // have no React Native dependencies, by design. Component tests would need
    // a native harness.
    include: ['tests/**/*.test.ts'],
  },
});
