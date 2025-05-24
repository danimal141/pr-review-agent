import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("logger.ts", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleSpy: {
    info: ReturnType<typeof vi.spyOn<typeof console, "info">>;
    error: ReturnType<typeof vi.spyOn<typeof console, "error">>;
    warn: ReturnType<typeof vi.spyOn<typeof console, "warn">>;
    debug: ReturnType<typeof vi.spyOn<typeof console, "debug">>;
    log: ReturnType<typeof vi.spyOn<typeof console, "log">>;
  };

  beforeEach(() => {
    // 環境変数をバックアップ
    originalEnv = { ...process.env };

    // コンソール出力をモック
    consoleSpy = {
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
    } as any;

    // モジュールキャッシュをクリア
    vi.resetModules();
  });

  afterEach(() => {
    // 環境変数を復元
    process.env = originalEnv;

    // スパイをリセット
    vi.restoreAllMocks();

    // モジュールキャッシュをクリア
    vi.resetModules();
  });

  describe("createLogger", () => {
    it("指定された名前でロガーが作成される", async () => {
      // デフォルトのログレベルを設定
      process.env.LOG_LEVEL = "debug";

      const { createLogger } = await import("../../src/utils/logger.js");

      const logger = createLogger("TEST");

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.logError).toBe("function");
    });

    it("異なる名前で複数のロガーが作成できる", async () => {
      // デフォルトのログレベルを設定
      process.env.LOG_LEVEL = "debug";

      const { createLogger } = await import("../../src/utils/logger.js");

      const logger1 = createLogger("TEST1");
      const logger2 = createLogger("TEST2");

      expect(logger1).toBeDefined();
      expect(logger2).toBeDefined();
      // 関数は異なるが、内部的に同じloggerインスタンスを使用する
    });
  });

  describe("ログレベル制御", () => {
    it("infoレベルで適切なログが出力される", async () => {
      process.env.LOG_LEVEL = "info";

      const { createLogger } = await import("../../src/utils/logger.js");
      const logger = createLogger("TEST");

      logger.info("テスト情報");
      logger.warn("テスト警告");
      logger.error("テストエラー");
      logger.debug("テストデバッグ");

      // info以上のログが出力される (infoはconsole.log使用)
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining("テスト情報"));
      expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining("テスト警告"));
      expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining("テストエラー"));
      // debugは出力されない（infoレベルより下）
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it("errorレベルでエラーのみ出力される", async () => {
      process.env.LOG_LEVEL = "error";

      const { createLogger } = await import("../../src/utils/logger.js");
      const logger = createLogger("TEST");

      logger.info("テスト情報");
      logger.warn("テスト警告");
      logger.error("テストエラー");
      logger.debug("テストデバッグ");

      // errorのみ出力される
      expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining("テストエラー"));
      expect(consoleSpy.log).not.toHaveBeenCalled(); // infoはconsole.log使用
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it("debugレベルですべてのログが出力される", async () => {
      process.env.LOG_LEVEL = "debug";

      const { createLogger } = await import("../../src/utils/logger.js");
      const logger = createLogger("TEST");

      logger.info("テスト情報");
      logger.warn("テスト警告");
      logger.error("テストエラー");
      logger.debug("テストデバッグ");

      // すべてのレベルが出力される
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining("テスト情報"));
      expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining("テスト警告"));
      expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining("テストエラー"));
      expect(consoleSpy.debug).toHaveBeenCalledWith(expect.stringContaining("テストデバッグ"));
    });
  });

  describe("GitHub Actions用ログ機能", () => {
    it("GitHub Actions warningコマンドが正しく出力される", async () => {
      const { logger } = await import("../../src/utils/logger.js");

      logger.githubAction.warning("テスト警告");

      expect(consoleSpy.log).toHaveBeenCalledWith("::warning::テスト警告");
    });

    it("GitHub Actions errorコマンドが正しく出力される", async () => {
      const { logger } = await import("../../src/utils/logger.js");

      logger.githubAction.error("テストエラー");

      expect(consoleSpy.log).toHaveBeenCalledWith("::error::テストエラー");
    });

    it("GitHub Actions noticeコマンドが正しく出力される", async () => {
      const { logger } = await import("../../src/utils/logger.js");

      logger.githubAction.notice("テスト情報");

      expect(consoleSpy.log).toHaveBeenCalledWith("::notice::テスト情報");
    });

    it("ファイル名と行番号付きでwarningコマンドが出力される", async () => {
      const { logger } = await import("../../src/utils/logger.js");

      logger.githubAction.warning("テスト警告", "src/test.ts", 42);

      expect(consoleSpy.log).toHaveBeenCalledWith("::warning file=src/test.ts,line=42::テスト警告");
    });

    it("ファイル名のみでerrorコマンドが出力される", async () => {
      const { logger } = await import("../../src/utils/logger.js");

      logger.githubAction.error("テストエラー", "src/test.ts");

      expect(consoleSpy.log).toHaveBeenCalledWith("::error file=src/test.ts::テストエラー");
    });
  });

  describe("ローカル環境", () => {
    it("ローカル環境で標準的なコンソール出力が使用される", async () => {
      // ログレベルをdebugに設定してすべてのログが出力されるようにする
      process.env.LOG_LEVEL = "debug";

      const { createLogger } = await import("../../src/utils/logger.js");
      const logger = createLogger("TEST");

      const testMessage = "テストメッセージ";

      logger.info(testMessage);
      logger.warn(testMessage);
      logger.error(testMessage);

      // 標準的なコンソール出力が使用される
      // infoはconsole.logを使用
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining("TEST"));
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining(testMessage));

      expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining("TEST"));
      expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining(testMessage));

      expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining("TEST"));
      expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining(testMessage));
    });
  });

  describe("logError機能", () => {
    it("Error オブジェクトが適切にログ出力される", async () => {
      process.env.LOG_LEVEL = "debug";

      const { createLogger } = await import("../../src/utils/logger.js");
      const logger = createLogger("TEST");

      const error = new Error("テストエラー");
      const context = { userId: "123", action: "test" };

      logger.logError(error, context);

      // エラーメッセージが出力される
      expect(consoleSpy.error).toHaveBeenCalled();
      const callArgs = consoleSpy.error.mock.calls[0][0];
      expect(callArgs).toContain("テストエラー");
      expect(callArgs).toContain("[TEST]");
    });

    it("logError でスタックトレースが含まれる", async () => {
      process.env.LOG_LEVEL = "debug";

      const { createLogger } = await import("../../src/utils/logger.js");
      const logger = createLogger("TEST");

      const error = new Error("テストエラー");

      logger.logError(error);

      // エラーメッセージが含まれる
      expect(consoleSpy.error).toHaveBeenCalled();
      const callArgs = consoleSpy.error.mock.calls[0][0];
      expect(callArgs).toContain("テストエラー");
      // スタックトレースが含まれる（JSON形式）
      expect(callArgs).toContain("stack");
    });

    it("logError でコンテキストなしでも動作する", async () => {
      process.env.LOG_LEVEL = "debug";

      const { createLogger } = await import("../../src/utils/logger.js");
      const logger = createLogger("TEST");

      const error = new Error("テストエラー");

      expect(() => logger.logError(error)).not.toThrow();
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });

  describe("デフォルトロガー", () => {
    it("デフォルトのloggerエクスポートが存在する", async () => {
      const { logger } = await import("../../src/utils/logger.js");

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.logError).toBe("function");
      expect(typeof logger.githubAction).toBe("object");
      expect(typeof logger.githubAction.warning).toBe("function");
      expect(typeof logger.githubAction.error).toBe("function");
      expect(typeof logger.githubAction.notice).toBe("function");
    });
  });

  describe("メッセージフォーマット", () => {
    it("タイムスタンプとコンポーネント名が含まれる", async () => {
      process.env.LOG_LEVEL = "debug";

      const { createLogger } = await import("../../src/utils/logger.js");
      const logger = createLogger("TEST_COMPONENT");

      logger.info("テストメッセージ");

      // console.logが呼ばれているかを確認
      expect(consoleSpy.log).toHaveBeenCalled();
      expect(consoleSpy.log.mock.calls.length).toBeGreaterThan(0);

      const callArgs = consoleSpy.log.mock.calls[0][0];

      // ISO 8601形式のタイムスタンプをチェック
      expect(callArgs).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      // コンポーネント名が含まれる
      expect(callArgs).toContain("[TEST_COMPONENT]");

      // ログレベルが含まれる
      expect(callArgs).toContain("[INFO]");

      // メッセージが含まれる
      expect(callArgs).toContain("テストメッセージ");
    });

    it("フォーマットの順序が正しい", async () => {
      process.env.LOG_LEVEL = "debug";

      const { createLogger } = await import("../../src/utils/logger.js");
      const logger = createLogger("TEST");

      logger.warn("テストメッセージ");

      // console.warnが呼ばれているかを確認
      expect(consoleSpy.warn).toHaveBeenCalled();
      expect(consoleSpy.warn.mock.calls.length).toBeGreaterThan(0);

      const callArgs = consoleSpy.warn.mock.calls[0][0];

      // フォーマット: timestamp [LEVEL] [COMPONENT] message
      expect(callArgs).toMatch(
        /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[WARN\] \[TEST\] テストメッセージ/
      );
    });

    it("データ付きログが正しくフォーマットされる", async () => {
      process.env.LOG_LEVEL = "debug";

      const { createLogger } = await import("../../src/utils/logger.js");
      const logger = createLogger("TEST");

      const testData = { key: "value", number: 42 };
      logger.info("テストメッセージ", testData);

      // console.logが呼ばれているかを確認
      expect(consoleSpy.log).toHaveBeenCalled();
      expect(consoleSpy.log.mock.calls.length).toBeGreaterThan(0);

      const callArgs = consoleSpy.log.mock.calls[0][0];

      expect(callArgs).toContain("テストメッセージ");
      expect(callArgs).toContain('"key": "value"');
      expect(callArgs).toContain('"number": 42');
    });
  });
});
