import 'dotenv/config';
import { logger } from './utils/logger.js';
import { createSupervisorAgent } from './agents/supervisor.js';
import { createCodeAnalysisAgent } from './agents/code-analysis.js';
import { createSecurityAgent } from './agents/security.js';
import { createStyleAgent } from './agents/style.js';
import { createSummaryAgent, SummaryAgentHelpers } from './agents/summary.js';
import { FileAnalyzerTool } from './tools/file-analyzer.js';
import { SecurityScannerTool } from './tools/security-scanner.js';
import { CodeMetricsTool } from './tools/code-metrics.js';
import { ReviewResult, AgentResult, ReviewComment } from './types/review.js';
import { createGitHubAPITool } from './tools/github-api.js';
import { GitHubPREvent, PRInfo } from './types/github.js';

/**
 * PRレビューワークフローのメインクラス
 */
export class PRReviewWorkflow {
  private githubAPI: ReturnType<typeof createGitHubAPITool>;
  private supervisorAgent: ReturnType<typeof createSupervisorAgent>;
  private codeAnalysisAgent: ReturnType<typeof createCodeAnalysisAgent>;
  private securityAgent: ReturnType<typeof createSecurityAgent>;
  private styleAgent: ReturnType<typeof createStyleAgent>;
  private summaryAgent: ReturnType<typeof createSummaryAgent>;

  constructor() {
    this.githubAPI = createGitHubAPITool();
    this.supervisorAgent = createSupervisorAgent();
    this.codeAnalysisAgent = createCodeAnalysisAgent();
    this.securityAgent = createSecurityAgent();
    this.styleAgent = createStyleAgent();
    this.summaryAgent = createSummaryAgent();
  }

  /**
   * メインのレビュー実行ワークフロー
   */
  async reviewPR(prEvent: GitHubPREvent): Promise<ReviewResult> {
    const startTime = Date.now();
    logger.info('PRReviewWorkflow', `PR #${prEvent.number} のレビューを開始`);

    try {
      // 1. PR情報を取得
      const prInfo = await this.getPRInfo(prEvent);
      logger.info('PRReviewWorkflow', `${prInfo.files.length}ファイルの変更を検出`);

      // 2. 各専門エージェントを並行実行
      const agentResults = await this.runSpecializedAgents(prInfo);

      // 3. SummaryAgentで結果を統合
      const summaryResult = await this.generateSummary(agentResults);

      // 4. 総合レビュー結果を構築
      const reviewResult: ReviewResult = {
        prNumber: prEvent.number,
        repository: prEvent.repository.fullName,
        reviewId: `review-${Date.now()}`,
        createdAt: new Date().toISOString(),
        agentResults,
        summary: {
          totalComments: summaryResult.totalComments,
          bySeverity: summaryResult.bySeverity,
          byCategory: summaryResult.byCategory,
          overallScore: summaryResult.overallScore / 10, // 0-10スケールに変換
          recommendation: this.mapRecommendation(summaryResult.recommendation),
        },
        executionStats: {
          totalTimeMs: Date.now() - startTime,
          filesAnalyzed: prInfo.files.length,
          linesAnalyzed: prInfo.files.reduce((sum, file) => sum + file.additions, 0),
        },
      };

      // 5. GitHub PRにコメント投稿
      await this.postReviewToGitHub(prInfo, reviewResult, summaryResult);

      logger.info('PRReviewWorkflow', `PR #${prEvent.number} のレビュー完了`);
      return reviewResult;

    } catch (error) {
      logger.error('PRReviewWorkflow', `レビュー実行エラー: ${error}`);
      throw error;
    }
  }

  /**
   * PR情報を取得
   */
  private async getPRInfo(prEvent: GitHubPREvent): Promise<PRInfo> {
    return await this.githubAPI.getPRInfo(
      prEvent.repository.owner.login,
      prEvent.repository.name,
      prEvent.number
    );
  }

  /**
   * 専門エージェントを並行実行
   */
  private async runSpecializedAgents(prInfo: PRInfo): Promise<AgentResult[]> {
    const results: AgentResult[] = [];

    // コード解析エージェント
    try {
      const codeAnalysisResult = await this.runCodeAnalysisAgent(prInfo);
      results.push(codeAnalysisResult);
    } catch (error) {
      logger.error('PRReviewWorkflow', `コード解析エラー: ${error}`);
      results.push(this.createErrorResult('code-analysis', error));
    }

    // セキュリティエージェント
    try {
      const securityResult = await this.runSecurityAgent(prInfo);
      results.push(securityResult);
    } catch (error) {
      logger.error('PRReviewWorkflow', `セキュリティ分析エラー: ${error}`);
      results.push(this.createErrorResult('security', error));
    }

    // スタイルエージェント
    try {
      const styleResult = await this.runStyleAgent(prInfo);
      results.push(styleResult);
    } catch (error) {
      logger.error('PRReviewWorkflow', `スタイル分析エラー: ${error}`);
      results.push(this.createErrorResult('style', error));
    }

    return results;
  }

  /**
   * コード解析エージェントを実行
   */
  private async runCodeAnalysisAgent(prInfo: PRInfo): Promise<AgentResult> {
    const startTime = Date.now();

    // ファイル解析とメトリクス計算
    const fileAnalysisResults = await FileAnalyzerTool.analyzeFiles(prInfo.files);
    const codeMetrics = CodeMetricsTool.calculateBatchMetrics(prInfo.files);

    // エージェントに分析データを渡す
    const analysisData = {
      files: prInfo.files,
      fileAnalysis: fileAnalysisResults,
      codeMetrics: codeMetrics,
      prInfo: {
        title: prInfo.title,
        body: prInfo.body,
        totalFiles: prInfo.files.length,
        totalAdditions: prInfo.files.reduce((sum, file) => sum + file.additions, 0),
        totalDeletions: prInfo.files.reduce((sum, file) => sum + file.deletions, 0),
      }
    };

    const response = await this.codeAnalysisAgent.generateText(JSON.stringify(analysisData));
    const comments = this.parseAgentResponse(response.text, 'code-analysis');

    return {
      agentName: 'code-analysis',
      executionTimeMs: Date.now() - startTime,
      success: true,
      comments,
      metadata: {
        filesAnalyzed: fileAnalysisResults.length,
        averageComplexity: codeMetrics.reduce((sum, m) => sum + m.cyclomaticComplexity, 0) / Math.max(codeMetrics.length, 1),
        qualityScore: codeMetrics.reduce((sum, m) => sum + m.qualityScore, 0) / Math.max(codeMetrics.length, 1),
      }
    };
  }

  /**
   * セキュリティエージェントを実行
   */
  private async runSecurityAgent(prInfo: PRInfo): Promise<AgentResult> {
    const startTime = Date.now();

    // セキュリティスキャン実行
    const securityResults = SecurityScannerTool.scanFiles(prInfo.files);
    const securitySummary = SecurityScannerTool.generateSecuritySummary(securityResults);

    const analysisData = {
      files: prInfo.files,
      securityScan: securityResults,
      securitySummary,
      prInfo: {
        title: prInfo.title,
        body: prInfo.body,
      }
    };

    const response = await this.securityAgent.generateText(JSON.stringify(analysisData));
    const comments = this.parseAgentResponse(response.text, 'security');

    return {
      agentName: 'security',
      executionTimeMs: Date.now() - startTime,
      success: true,
      comments,
      metadata: {
        filesScanned: securityResults.length,
        totalSecurityIssues: securitySummary.totalIssues,
        riskLevel: securitySummary.riskLevel,
        riskScore: securityResults.reduce((sum, r) => sum + r.riskScore, 0) / Math.max(securityResults.length, 1),
      }
    };
  }

  /**
   * スタイルエージェントを実行
   */
  private async runStyleAgent(prInfo: PRInfo): Promise<AgentResult> {
    const startTime = Date.now();

    // ファイル解析（スタイル観点）
    const fileAnalysisResults = await FileAnalyzerTool.analyzeFiles(prInfo.files);

    const analysisData = {
      files: prInfo.files,
      fileAnalysis: fileAnalysisResults,
      prInfo: {
        title: prInfo.title,
        body: prInfo.body,
      }
    };

    const response = await this.styleAgent.generateText(JSON.stringify(analysisData));
    const comments = this.parseAgentResponse(response.text, 'style');

    return {
      agentName: 'style',
      executionTimeMs: Date.now() - startTime,
      success: true,
      comments,
      metadata: {
        filesAnalyzed: fileAnalysisResults.length,
        styleIssues: comments.filter(c => c.category === 'style').length,
      }
    };
  }

  /**
   * サマリーエージェントで結果を統合
   */
  private async generateSummary(agentResults: AgentResult[]) {
    const consolidatedData = SummaryAgentHelpers.consolidateResults(agentResults);
    const response = await this.summaryAgent.generateText(consolidatedData);
    return SummaryAgentHelpers.parseSummaryResult(response.text, agentResults);
  }

  /**
   * エージェントのレスポンスをパース
   */
  private parseAgentResponse(response: string, agentName: string): ReviewComment[] {
    try {
      // JSON部分を抽出
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        const parsed = JSON.parse(jsonMatch[1]);

        if (parsed.issues && Array.isArray(parsed.issues)) {
          return parsed.issues.map((issue: any, index: number) => ({
            id: `${agentName}-${index}`,
            filename: issue.filename || 'unknown',
            line: issue.line,
            category: issue.category || 'codeQuality',
            severity: issue.severity || 'info',
            title: issue.title || '問題が検出されました',
            description: issue.description || '',
            suggestion: issue.suggestion,
            codeSnippet: issue.evidence,
          }));
        }
      }

      return [];
    } catch (error) {
      logger.error('PRReviewWorkflow', `${agentName}のレスポンス解析エラー: ${error}`);
      return [];
    }
  }

  /**
   * エラー結果を作成
   */
  private createErrorResult(agentName: string, error: any): AgentResult {
    return {
      agentName,
      executionTimeMs: 0,
      success: false,
      errorMessage: String(error),
      comments: [],
      metadata: {}
    };
  }

  /**
   * GitHub PRにレビューコメントを投稿
   */
  private async postReviewToGitHub(prInfo: PRInfo, reviewResult: ReviewResult, summaryResult: any): Promise<void> {
    try {
      // 主要なコメントを抽出（重要度順）
      const allComments = reviewResult.agentResults.flatMap(result => result.comments);
      const prioritizedComments = allComments
        .sort((a, b) => this.getSeverityPriority(b.severity) - this.getSeverityPriority(a.severity))
        .slice(0, 10); // 最大10件まで

      // 要約コメントを作成
      const summaryComment = this.createSummaryComment(reviewResult, summaryResult);

      // 行単位のコメント
      const lineComments = prioritizedComments
        .filter(comment => comment.line)
        .map(comment => ({
          path: comment.filename,
          line: comment.line!,
          body: this.formatReviewComment(comment),
        }));

      // レビューを投稿
      await this.githubAPI.createReview(
        prInfo.owner,
        prInfo.repo,
        prInfo.number,
        summaryComment,
        reviewResult.summary.recommendation === 'approve' ? 'APPROVE' :
        reviewResult.summary.recommendation === 'requestChanges' ? 'REQUEST_CHANGES' : 'COMMENT',
        lineComments
      );

      logger.info('PRReviewWorkflow', `GitHub PRにレビューコメントを投稿しました`);
    } catch (error) {
      logger.error('PRReviewWorkflow', `GitHub投稿エラー: ${error}`);
      throw error;
    }
  }

  /**
   * 要約コメントを作成
   */
  private createSummaryComment(reviewResult: ReviewResult, summaryResult: any): string {
    const { summary } = reviewResult;

    let comment = `## 🤖 AIレビュー結果\n\n`;

    // 全体スコア
    comment += `**全体スコア**: ${(summary.overallScore * 10).toFixed(1)}/100\n\n`;

    // 問題の要約
    comment += `**検出された問題**: ${summary.totalComments}件\n`;
    if (summary.bySeverity.critical > 0) comment += `- 🔴 重大: ${summary.bySeverity.critical}件\n`;
    if (summary.bySeverity.error > 0) comment += `- 🟠 エラー: ${summary.bySeverity.error}件\n`;
    if (summary.bySeverity.warning > 0) comment += `- 🟡 警告: ${summary.bySeverity.warning}件\n`;
    if (summary.bySeverity.info > 0) comment += `- ℹ️ 情報: ${summary.bySeverity.info}件\n`;

    comment += `\n`;

    // 主要な発見
    if (summaryResult.keyFindings?.length > 0) {
      comment += `**主要な発見**:\n`;
      summaryResult.keyFindings.forEach((finding: string) => {
        comment += `- ${finding}\n`;
      });
      comment += `\n`;
    }

    // 推奨事項
    if (summaryResult.nextSteps?.length > 0) {
      comment += `**推奨事項**:\n`;
      summaryResult.nextSteps.forEach((step: string) => {
        comment += `- ${step}\n`;
      });
    }

    return comment;
  }

  /**
   * レビューコメントをフォーマット
   */
  private formatReviewComment(comment: ReviewComment): string {
    const severityEmoji = {
      critical: '🔴',
      error: '🟠',
      warning: '🟡',
      info: 'ℹ️'
    };

    let formatted = `${severityEmoji[comment.severity]} **${comment.title}**\n\n`;
    formatted += `${comment.description}\n`;

    if (comment.suggestion) {
      formatted += `\n**💡 修正提案**:\n${comment.suggestion}`;
    }

    return formatted;
  }

  /**
   * 重要度の優先度を取得
   */
  private getSeverityPriority(severity: string): number {
    const priorities = { critical: 4, error: 3, warning: 2, info: 1 };
    return priorities[severity as keyof typeof priorities] || 0;
  }

  /**
   * 推奨事項をマッピング
   */
  private mapRecommendation(recommendation: string): 'approve' | 'requestChanges' | 'comment' {
    switch (recommendation) {
      case 'approve':
        return 'approve';
      case 'request_changes':
        return 'requestChanges';
      default:
        return 'comment';
    }
  }
}

/**
 * CLIまたはテスト用のエントリーポイント
 */
export async function main() {
  try {
    logger.info('Main', 'PRレビューエージェントを開始');

    // 環境変数の確認
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN環境変数が設定されていません');
    }

    const workflow = new PRReviewWorkflow();

    // CLIの場合はここでPRイベントを処理
    logger.info('Main', 'PRレビューエージェントの準備完了');

  } catch (error) {
    logger.error('Main', `初期化エラー: ${error}`);
    process.exit(1);
  }
}

// ES moduleのトップレベルでの実行チェック
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
