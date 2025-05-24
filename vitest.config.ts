import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // TypeScriptファイルを直接実行
    environment: 'node',

    // テストファイルのパターン
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],

    // テスト実行時の設定
    globals: true,

    // カバレッジ設定
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
      ],
    },

    // テストタイムアウト設定
    testTimeout: 10000,

    // 環境変数の設定
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
    },
  },

  // TypeScript解決設定
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
