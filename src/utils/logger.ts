import { config } from "./config.js";

/**
 * ログレベル
 */
type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * ログレベルの優先度
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * ログメッセージの形式
 */
interface LogMessage {
  timestamp: string;
  level: LogLevel;
  component?: string;
  message: string;
  data?: Record<string, unknown> | string | number | boolean | null;
}

/**
 * ログユーティリティクラス
 */
class Logger {
  private minLevel: number;

  constructor(level: LogLevel = "info") {
    this.minLevel = LOG_LEVELS[level];
  }

  /**
   * ログレベルを設定
   */
  setLevel(level: LogLevel): void {
    this.minLevel = LOG_LEVELS[level];
  }

  /**
   * 現在のタイムスタンプを取得
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * ログメッセージを出力
   */
  private log(
    level: LogLevel,
    message: string,
    component?: string,
    data?: Record<string, unknown> | string | number | boolean | null
  ): void {
    if (LOG_LEVELS[level] < this.minLevel) {
      return;
    }

    const logMessage: LogMessage = {
      timestamp: this.getTimestamp(),
      level,
      component,
      message,
      data,
    };

    const output = this.formatMessage(logMessage);

    switch (level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "debug":
        console.debug(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * ログメッセージをフォーマット
   */
  private formatMessage(logMessage: LogMessage): string {
    const { timestamp, level, component, message, data } = logMessage;

    const levelStr = `[${level.toUpperCase()}]`;
    const timeStr = timestamp;
    const componentStr = component ? `[${component}]` : "";
    const dataStr = data ? `\n${JSON.stringify(data, null, 2)}` : "";

    return `${timeStr} ${levelStr} ${componentStr} ${message}${dataStr}`;
  }

  /**
   * DEBUGレベルのログ
   */
  debug(
    message: string,
    component?: string,
    data?: Record<string, unknown> | string | number | boolean | null
  ): void {
    this.log("debug", message, component, data);
  }

  /**
   * INFOレベルのログ
   */
  info(
    message: string,
    component?: string,
    data?: Record<string, unknown> | string | number | boolean | null
  ): void {
    this.log("info", message, component, data);
  }

  /**
   * WARNレベルのログ
   */
  warn(
    message: string,
    component?: string,
    data?: Record<string, unknown> | string | number | boolean | null
  ): void {
    this.log("warn", message, component, data);
  }

  /**
   * ERRORレベルのログ
   */
  error(
    message: string,
    component?: string,
    data?: Record<string, unknown> | string | number | boolean | null
  ): void {
    this.log("error", message, component, data);
  }

  /**
   * エラーオブジェクトをログ出力
   */
  logError(
    error: Error,
    component?: string,
    additionalData?: Record<string, unknown> | string | number | boolean | null
  ): void {
    this.error(error.message, component, {
      name: error.name,
      stack: error.stack,
      ...(typeof additionalData === "object" && additionalData !== null ? additionalData : {}),
    });
  }

  /**
   * GitHub Actions用のログ出力
   * https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions
   */
  githubAction = {
    notice: (message: string, file?: string, line?: number): void => {
      const params = [];
      if (file) params.push(`file=${file}`);
      if (line) params.push(`line=${line}`);
      const paramStr = params.length > 0 ? ` ${params.join(",")}` : "";
      console.log(`::notice${paramStr}::${message}`);
    },

    warning: (message: string, file?: string, line?: number): void => {
      const params = [];
      if (file) params.push(`file=${file}`);
      if (line) params.push(`line=${line}`);
      const paramStr = params.length > 0 ? ` ${params.join(",")}` : "";
      console.log(`::warning${paramStr}::${message}`);
    },

    error: (message: string, file?: string, line?: number): void => {
      const params = [];
      if (file) params.push(`file=${file}`);
      if (line) params.push(`line=${line}`);
      const paramStr = params.length > 0 ? ` ${params.join(",")}` : "";
      console.log(`::error${paramStr}::${message}`);
    },

    group: (name: string): void => {
      console.log(`::group::${name}`);
    },

    endGroup: (): void => {
      console.log("::endgroup::");
    },
  };
}

/**
 * グローバルロガーインスタンス
 */
export const logger = new Logger(config.logging.level);

/**
 * コンポーネント固有のロガーを作成
 */
export function createLogger(component: string) {
  return {
    debug: (message: string, data?: Record<string, unknown> | string | number | boolean | null) =>
      logger.debug(message, component, data),
    info: (message: string, data?: Record<string, unknown> | string | number | boolean | null) =>
      logger.info(message, component, data),
    warn: (message: string, data?: Record<string, unknown> | string | number | boolean | null) =>
      logger.warn(message, component, data),
    error: (message: string, data?: Record<string, unknown> | string | number | boolean | null) =>
      logger.error(message, component, data),
    logError: (
      error: Error,
      additionalData?: Record<string, unknown> | string | number | boolean | null
    ) => logger.logError(error, component, additionalData),
  };
}
