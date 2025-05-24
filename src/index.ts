import { VoltAgent, Agent } from '@voltagent/core';
import { VercelAIProvider } from '@voltagent/vercel-ai';
import { openai } from '@ai-sdk/openai';
import { config, validateConfig } from './utils/config.js';
import { createLogger } from './utils/logger.js';

const appLogger = createLogger('APP');

/**
 * アプリケーションの初期化
 */
async function initialize(): Promise<void> {
  appLogger.info('PRレビューエージェントを初期化中...');

  // 設定検証
  const validation = validateConfig();
  if (!validation.valid) {
    appLogger.error('設定エラーが検出されました:', validation.errors);
    process.exit(1);
  }

  appLogger.info('設定検証完了');
}

/**
 * 基本的なレビューエージェントの作成
 */
function createBasicReviewAgent() {
  return new Agent({
    name: 'basic-review-agent',
    instructions: `
あなたはGitHub PRレビュー専門のAIエージェントです。

## 役割
- プルリクエストのコード変更を分析
- コード品質、セキュリティ、バグの可能性を評価
- 建設的なフィードバックを提供

## 分析観点
1. **コード品質**: 可読性、保守性、設計パターン
2. **セキュリティ**: 脆弱性、セキュリティベストプラクティス
3. **バグ検出**: ロジックエラー、エッジケース
4. **パフォーマンス**: 効率性、最適化の余地
5. **スタイル**: コーディング規約、一貫性

## 出力形式
- 具体的で建設的なコメント
- 修正提案を含める
- 重要度（info/warning/error/critical）を明確にする

日本語で分かりやすく回答してください。
    `.trim(),
    llm: new VercelAIProvider(),
    model: openai('gpt-4o-mini'),
  });
}

/**
 * VoltAgentアプリケーションの起動
 */
async function startApplication(): Promise<VoltAgent> {
  const basicReviewAgent = createBasicReviewAgent();

  const voltAgent = new VoltAgent({
    agents: {
      'basic-review': basicReviewAgent,
    },
    port: config.port,
  });

  appLogger.info(`VoltAgentサーバーがポート${config.port}で起動しました`);
  appLogger.info('VoltAgent Console: https://console.voltagent.dev');

  return voltAgent;
}

/**
 * メイン関数
 */
async function main(): Promise<void> {
  try {
    await initialize();
    const voltAgent = await startApplication();

    // Graceful shutdown
    process.on('SIGINT', () => {
      appLogger.info('シャットダウン中...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      appLogger.info('シャットダウン中...');
      process.exit(0);
    });

  } catch (error) {
    appLogger.logError(error as Error, { context: 'main' });
    process.exit(1);
  }
}

// アプリケーション開始
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
