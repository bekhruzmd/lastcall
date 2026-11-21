/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Unit tests always run against the in-memory mock, never the live backend.
    env: { VITE_USE_MOCK: '1' },
  },
})
