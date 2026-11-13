import { defineConfig } from 'vite-plus'

export default defineConfig({
  defaultPackage: { dev: './apps/web', build: './apps/web', preview: './apps/web' },
  lint: {
    ignorePatterns: ['**/dist/**', '**/fixtures/**', '**/*.json'],
    plugins: ['typescript', 'vue'],
    options: { typeAware: true, typeCheck: true },
  },
  staged: { '*': 'vp check --fix' },
  run: {
    cache: true,
    tasks: {
      'stations:build': { command: 'vpx packages/stations/src/build.ts', cache: false },
      'trains:build': { command: 'vpx packages/trains/src/build.ts', cache: false },
      'netz:build': { command: 'vpx packages/netz/src/build.ts', cache: false },
      'hafas:record': { command: 'vpx packages/hafas/scripts/record-fixtures.ts', cache: false },
    },
  },
})
