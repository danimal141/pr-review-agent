import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("config.ts", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 環境変数をバックアップ
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // 環境変数を復元
    process.env = originalEnv;
    // モジュールキャッシュをクリア
    vi.resetModules();
  });

  describe("ポート設定", () => {
    it("VOLTAGENT_PORT環境変数が設定されている場合、その値を使用する", async () => {
      process.env.VOLTAGENT_PORT = "8080";

      const { config } = await import("../../src/utils/config.js");

      expect(config.port).toBe(8080);
    });

    it("VOLTAGENT_PORT環境変数が未設定の場合、デフォルト値3141を使用する", async () => {
      process.env.VOLTAGENT_PORT = undefined;

      const { config } = await import("../../src/utils/config.js");

      expect(config.port).toBe(3141);
    });

    it("VOLTAGENT_PORT環境変数が無効な値の場合、NaNになる", async () => {
      process.env.VOLTAGENT_PORT = "invalid";

      // NaNが設定されるとZodスキーマがエラーを投げる
      expect(async () => {
        await import("../../src/utils/config.js");
      }).rejects.toThrow();
    });

    it("VOLTAGENT_PORT環境変数が範囲外でも解析される", async () => {
      process.env.VOLTAGENT_PORT = "99999";

      const { config } = await import("../../src/utils/config.js");

      expect(config.port).toBe(99999);
    });
  });

  describe("API キー設定", () => {
    it("OPENAI_API_KEY環境変数が正しく読み込まれる", async () => {
      process.env.OPENAI_API_KEY = "test-openai-key";

      const { config } = await import("../../src/utils/config.js");

      expect(config.openai.apiKey).toBe("test-openai-key");
    });

    it("ANTHROPIC_API_KEY環境変数が正しく読み込まれる", async () => {
      process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

      const { config } = await import("../../src/utils/config.js");

      expect(config.anthropic.apiKey).toBe("test-anthropic-key");
    });

    it("GITHUB_TOKEN環境変数が正しく読み込まれる", async () => {
      process.env.GITHUB_TOKEN = "test-github-token";

      const { config } = await import("../../src/utils/config.js");

      expect(config.github.token).toBe("test-github-token");
    });
  });

  describe("ログレベル設定", () => {
    it("有効なログレベルが設定される", async () => {
      const validLevels = ["error", "warn", "info", "debug"];

      for (const level of validLevels) {
        process.env.LOG_LEVEL = level;
        vi.resetModules();

        const { config } = await import("../../src/utils/config.js");

        expect(config.logging.level).toBe(level);
      }
    });

    it("無効なログレベルの場合、Zodスキーマがエラーを投げる", async () => {
      process.env.LOG_LEVEL = "invalid";

      // 無効なログレベルはZodスキーマでエラーになる
      expect(async () => {
        await import("../../src/utils/config.js");
      }).rejects.toThrow();
    });

    it("LOG_LEVEL未設定の場合、デフォルト値が使用される", async () => {
      process.env.LOG_LEVEL = undefined;

      const { config } = await import("../../src/utils/config.js");

      expect(["error", "warn", "info", "debug"]).toContain(config.logging.level);
    });
  });

  describe("レビュー設定", () => {
    it("REVIEW_MAX_FILES環境変数が正しく読み込まれる", async () => {
      process.env.REVIEW_MAX_FILES = "100";

      const { config } = await import("../../src/utils/config.js");

      expect(config.review.maxFiles).toBe(100);
    });

    it("REVIEW_MAX_LINES_PER_FILE環境変数が正しく読み込まれる", async () => {
      process.env.REVIEW_MAX_LINES_PER_FILE = "2000";

      const { config } = await import("../../src/utils/config.js");

      expect(config.review.maxLinesPerFile).toBe(2000);
    });

    it("無効な数値設定の場合、NaNでZodスキーマがエラーを投げる", async () => {
      process.env.REVIEW_MAX_FILES = "invalid";
      process.env.REVIEW_MAX_LINES_PER_FILE = "invalid";

      // NaNが設定されるとZodスキーマがエラーを投げる
      expect(async () => {
        await import("../../src/utils/config.js");
      }).rejects.toThrow();
    });
  });

  describe("ブール値設定", () => {
    it("ENABLE_SECURITY_SCAN環境変数が正しく解釈される", async () => {
      const testCases = [
        { value: "true", expected: true },
        { value: "false", expected: false },
      ];

      for (const testCase of testCases) {
        process.env.ENABLE_SECURITY_SCAN = testCase.value;
        vi.resetModules();

        const { config } = await import("../../src/utils/config.js");

        expect(config.review.enableSecurityScan).toBe(testCase.expected);
      }
    });

    it("ENABLE_STYLE_CHECK環境変数が正しく解釈される", async () => {
      process.env.ENABLE_STYLE_CHECK = "true";

      const { config } = await import("../../src/utils/config.js");

      expect(config.review.enableStyleCheck).toBe(true);
    });

    it("ENABLE_CODE_ANALYSIS環境変数が正しく解釈される", async () => {
      process.env.ENABLE_CODE_ANALYSIS = "false";

      const { config } = await import("../../src/utils/config.js");

      expect(config.review.enableCodeAnalysis).toBe(false);
    });
  });

  describe("設定検証", () => {
    it("必須設定が不足している場合、検証エラーを返す", async () => {
      // 必須環境変数をクリア
      process.env.OPENAI_API_KEY = undefined;
      process.env.ANTHROPIC_API_KEY = undefined;
      process.env.GITHUB_TOKEN = ""; // 空文字列にする

      const { validateConfig } = await import("../../src/utils/config.js");

      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("全ての必須設定が正しい場合、検証が成功する", async () => {
      process.env.OPENAI_API_KEY = "test-openai-key";
      process.env.GITHUB_TOKEN = "test-github-token";
      process.env.VOLTAGENT_PORT = "3141";

      const { validateConfig } = await import("../../src/utils/config.js");

      const result = validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });
});
