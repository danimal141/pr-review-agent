import 'dotenv/config';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { logger } from './utils/logger.js';
import { config } from './utils/config.js';
import { PRReviewWorkflow } from './index.js';
import { GitHubEventParser } from './tools/github-api.js';

/**
 * GitHub Actions用のPRレビューエントリーポイント
 */
export class GitHubActionEntrypoint {
  private workflow: PRReviewWorkflow;

  constructor() {
    this.workflow = new PRReviewWorkflow();
  }

  /**
   * GitHub Actionsメインエントリーポイント
   */
  async run(): Promise<void> {
    try {
      // GitHub Actionsのコンテキストをログ出力
      logger.info('GitHubAction', `イベント: ${github.context.eventName}`);
      logger.info('GitHubAction', `アクション: ${github.context.payload.action}`);

      // PR関連のイベントのみ処理
      if (!this.shouldProcessEvent()) {
        logger.info('GitHubAction', 'スキップ: PR関連のイベントではありません');
        return;
      }

      // GitHub Webhookペイロードを解析
      const prEvent = GitHubEventParser.parsePREvent(github.context.payload);
      logger.info('GitHubAction', `PR #${prEvent.number} のレビューを開始`);

      // 設定チェック
      this.validateConfiguration();

      // PRレビューを実行
      const reviewResult = await this.workflow.reviewPR(prEvent);

      // GitHub Actionsの出力設定
      core.setOutput('review-id', reviewResult.reviewId);
      core.setOutput('total-comments', reviewResult.summary.totalComments.toString());
      core.setOutput('overall-score', reviewResult.summary.overallScore.toString());
      core.setOutput('recommendation', reviewResult.summary.recommendation);

      // ジョブサマリーを作成
      await this.createJobSummary(reviewResult);

      logger.info('GitHubAction', `PR #${prEvent.number} のレビュー完了`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('GitHubAction', `GitHub Actions実行エラー: ${errorMessage}`);

      // GitHub Actionsのエラー出力
      core.setFailed(errorMessage);

      // エラー詳細をアウトプットに設定
      core.setOutput('error', errorMessage);
      core.setOutput('success', 'false');

      throw error;
    }
  }

  /**
   * イベントを処理すべきかチェック
   */
  private shouldProcessEvent(): boolean {
    const { eventName, payload } = github.context;

    // プルリクエストイベントのみ処理
    if (eventName !== 'pull_request') {
      return false;
    }

    // 特定のアクションのみ処理
    const targetActions = [
      'opened',           // PRが開かれた
      'synchronize',      // PRが更新された（新しいコミットがプッシュされた）
      'reopened',         // PRが再開された
      'ready_for_review', // ドラフトから通常のPRに変更された
    ];

    return targetActions.includes(payload.action as string);
  }

  /**
   * 設定の検証
   */
  private validateConfiguration(): void {
    // 必須環境変数のチェック
    const requiredEnvVars = [
      'GITHUB_TOKEN',
      'OPENAI_API_KEY',
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(`必須環境変数が設定されていません: ${missingVars.join(', ')}`);
    }

    // GitHub Actionsコンテキストのチェック
    if (!github.context.payload.pull_request) {
      throw new Error('プルリクエストのペイロードが見つかりません');
    }

    logger.info('GitHubAction', '設定検証完了');
  }

  /**
   * GitHub ActionsのJob Summaryを作成
   */
  private async createJobSummary(reviewResult: any): Promise<void> {
    try {
      const { summary, executionStats } = reviewResult;

      let summaryMarkdown = `# 🤖 AI PR レビュー結果\n\n`;

      // 基本情報
      summaryMarkdown += `## 📊 概要\n\n`;
      summaryMarkdown += `| 項目 | 値 |\n`;
      summaryMarkdown += `|------|-----|\n`;
      summaryMarkdown += `| 全体スコア | ${(summary.overallScore * 10).toFixed(1)}/100 |\n`;
      summaryMarkdown += `| 推奨事項 | ${this.getRecommendationText(summary.recommendation)} |\n`;
      summaryMarkdown += `| 検出された問題 | ${summary.totalComments}件 |\n`;
      summaryMarkdown += `| 分析ファイル数 | ${executionStats.filesAnalyzed}件 |\n`;
      summaryMarkdown += `| 実行時間 | ${(executionStats.totalTimeMs / 1000).toFixed(2)}秒 |\n\n`;

      // 重要度別の問題数
      if (summary.totalComments > 0) {
        summaryMarkdown += `## 🚨 問題の内訳\n\n`;
        summaryMarkdown += `| 重要度 | 件数 |\n`;
        summaryMarkdown += `|--------|------|\n`;
        if (summary.bySeverity.critical > 0) {
          summaryMarkdown += `| 🔴 重大 | ${summary.bySeverity.critical} |\n`;
        }
        if (summary.bySeverity.error > 0) {
          summaryMarkdown += `| 🟠 エラー | ${summary.bySeverity.error} |\n`;
        }
        if (summary.bySeverity.warning > 0) {
          summaryMarkdown += `| 🟡 警告 | ${summary.bySeverity.warning} |\n`;
        }
        if (summary.bySeverity.info > 0) {
          summaryMarkdown += `| ℹ️ 情報 | ${summary.bySeverity.info} |\n`;
        }
        summaryMarkdown += `\n`;
      }

      // カテゴリ別の問題数
      if (Object.keys(summary.byCategory).length > 0) {
        summaryMarkdown += `## 📁 カテゴリ別問題数\n\n`;
        summaryMarkdown += `| カテゴリ | 件数 |\n`;
        summaryMarkdown += `|----------|------|\n`;

        Object.entries(summary.byCategory)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .forEach(([category, count]) => {
            const categoryName = this.getCategoryDisplayName(category);
            summaryMarkdown += `| ${categoryName} | ${count} |\n`;
          });
        summaryMarkdown += `\n`;
      }

      // エージェント実行結果
      summaryMarkdown += `## 🤖 エージェント実行結果\n\n`;
      summaryMarkdown += `| エージェント | 状態 | 実行時間 | コメント数 |\n`;
      summaryMarkdown += `|-------------|------|----------|----------|\n`;

      reviewResult.agentResults.forEach((result: any) => {
        const status = result.success ? '✅ 成功' : '❌ 失敗';
        const executionTime = `${result.executionTimeMs}ms`;
        summaryMarkdown += `| ${this.getAgentDisplayName(result.agentName)} | ${status} | ${executionTime} | ${result.comments.length} |\n`;
      });

      // 詳細な推奨事項（もしあれば）
      if (reviewResult.recommendations && reviewResult.recommendations.length > 0) {
        summaryMarkdown += `\n## 💡 推奨事項\n\n`;
        reviewResult.recommendations.forEach((rec: string, index: number) => {
          summaryMarkdown += `${index + 1}. ${rec}\n`;
        });
      }

      summaryMarkdown += `\n---\n`;
      summaryMarkdown += `*このレビューは AI によって自動生成されました。*\n`;

      // GitHub ActionsのJob Summaryに設定
      await core.summary
        .addRaw(summaryMarkdown)
        .write();

      logger.info('GitHubAction', 'Job Summary作成完了');

    } catch (error) {
      logger.error('GitHubAction', `Job Summary作成エラー: ${error}`);
      // Job Summaryの作成に失敗してもメインのワークフローは継続
    }
  }

  /**
   * 推奨事項の表示名を取得
   */
  private getRecommendationText(recommendation: string): string {
    switch (recommendation) {
      case 'approve':
        return '✅ 承認';
      case 'requestChanges':
        return '🔄 変更要求';
      case 'comment':
      default:
        return '💬 コメント';
    }
  }

  /**
   * カテゴリの表示名を取得
   */
  private getCategoryDisplayName(category: string): string {
    const displayNames: Record<string, string> = {
      'codeQuality': '🔧 コード品質',
      'security': '🔒 セキュリティ',
      'performance': '⚡ パフォーマンス',
      'style': '🎨 スタイル',
      'bestPractices': '✨ ベストプラクティス',
      'bugs': '🐛 バグ',
      'maintainability': '🔧 保守性',
    };
    return displayNames[category] || category;
  }

  /**
   * エージェントの表示名を取得
   */
  private getAgentDisplayName(agentName: string): string {
    const displayNames: Record<string, string> = {
      'supervisor': '🎯 スーパーバイザー',
      'code-analysis': '🔍 コード解析',
      'security': '🔒 セキュリティ',
      'style': '🎨 スタイル',
      'summary': '📋 要約',
    };
    return displayNames[agentName] || agentName;
  }
}

/**
 * GitHub Actions実行関数
 */
export async function runGitHubAction(): Promise<void> {
  const entrypoint = new GitHubActionEntrypoint();
  await entrypoint.run();
}

/**
 * メイン実行関数
 * GitHub Actionsコンテキストで実行された場合の処理
 */
async function main(): Promise<void> {
  try {
    // GitHub Actionsコンテキストかどうかをチェック
    if (process.env.GITHUB_ACTIONS !== 'true') {
      logger.warn('GitHubAction', 'GitHub Actionsコンテキスト外で実行されています');
      return;
    }

    logger.info('GitHubAction', 'GitHub Actions PR レビューエージェント開始');
    await runGitHubAction();
    logger.info('GitHubAction', 'GitHub Actions PR レビューエージェント完了');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('GitHubAction', `実行エラー: ${errorMessage}`);

    // GitHub Actionsにエラーを報告
    core.setFailed(errorMessage);
    process.exit(1);
  }
}

// ES moduleのトップレベルでの実行チェック
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
