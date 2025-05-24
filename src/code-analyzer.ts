import 'dotenv/config';
import { logger } from './utils/logger.js';
import { createCodeAnalysisAgent } from './agents/code-analysis.js';
import { createSecurityAgent } from './agents/security.js';
import { createStyleAgent } from './agents/style.js';

export interface CodeFile {
  filename: string;
  content: string;
  language?: string;
}

export interface AnalysisResult {
  agentName: string;
  executionTimeMs: number;
  success: boolean;
  comments: Array<{
    line: number;
    message: string;
    severity: 'critical' | 'error' | 'warning' | 'info';
    category: string;
    suggestion?: string;
  }>;
  metadata: Record<string, any>;
}

export interface CodeAnalysisReport {
  analysisId: string;
  createdAt: string;
  agentResults: AnalysisResult[];
  summary: {
    totalComments: number;
    overallScore: number; // 0-1 scale
    recommendation: 'approve' | 'requestChanges' | 'comment';
  };
  executionStats: {
    totalTimeMs: number;
    filesAnalyzed: number;
  };
}

/**
 * 純粋なコード分析ツール（GitHub非依存）
 */
export class CodeAnalyzer {
  private codeAnalysisAgent: ReturnType<typeof createCodeAnalysisAgent>;
  private securityAgent: ReturnType<typeof createSecurityAgent>;
  private styleAgent: ReturnType<typeof createStyleAgent>;

  constructor() {
    this.codeAnalysisAgent = createCodeAnalysisAgent();
    this.securityAgent = createSecurityAgent();
    this.styleAgent = createStyleAgent();
  }

  /**
   * コードを分析して問題を検出
   */
  async analyzeCode(code: string, filename: string = 'code.js'): Promise<CodeAnalysisReport> {
    const startTime = Date.now();
    const analysisId = `analysis-${Date.now()}`;

    logger.info('CodeAnalyzer', 'コード分析を開始');

    try {
      // ファイル情報を構造化
      const fileData = {
        filename,
        content: code,
        language: this.detectLanguage(filename),
        lines: code.split('\n').length,
        size: code.length
      };

      // 各エージェントを並行実行
      const agentResults = await Promise.all([
        this.runCodeAnalysis(fileData),
        this.runSecurityAnalysis(fileData),
        this.runStyleAnalysis(fileData)
      ]);

      const totalComments = agentResults.reduce((sum, result) => sum + result.comments.length, 0);
      const criticalIssues = agentResults.reduce((sum, result) =>
        sum + result.comments.filter(c => c.severity === 'critical').length, 0);

      const overallScore = this.calculateOverallScore(totalComments, criticalIssues);

      const report: CodeAnalysisReport = {
        analysisId,
        createdAt: new Date().toISOString(),
        agentResults,
        summary: {
          totalComments,
          overallScore,
          recommendation: this.determineRecommendation(overallScore, criticalIssues)
        },
        executionStats: {
          totalTimeMs: Date.now() - startTime,
          filesAnalyzed: 1
        }
      };

      logger.info('CodeAnalyzer', `コード分析完了: ${totalComments}件の問題を検出`);
      return report;

    } catch (error) {
      logger.error('CodeAnalyzer', `分析エラー: ${error}`);
      throw error;
    }
  }

  /**
   * コード品質分析
   */
  private async runCodeAnalysis(fileData: any): Promise<AnalysisResult> {
    const startTime = Date.now();

    try {
      const analysisData = {
        files: [fileData],
        prInfo: {
          title: 'Code Analysis',
          body: 'Automated code quality analysis',
          totalFiles: 1,
          totalAdditions: fileData.lines,
          totalDeletions: 0,
        }
      };

      const response = await this.codeAnalysisAgent.generateText(JSON.stringify(analysisData));
      const comments = this.parseAgentResponse(response.text, 'codeQuality');

      return {
        agentName: 'code-analysis',
        executionTimeMs: Date.now() - startTime,
        success: true,
        comments,
        metadata: {
          filesAnalyzed: 1,
          language: fileData.language
        }
      };
    } catch (error) {
      return this.createErrorResult('code-analysis', error, startTime);
    }
  }

  /**
   * セキュリティ分析
   */
  private async runSecurityAnalysis(fileData: any): Promise<AnalysisResult> {
    const startTime = Date.now();

    try {
      const analysisData = {
        files: [fileData],
        prInfo: {
          title: 'Security Analysis',
          body: 'Automated security vulnerability scan',
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
          filesAnalyzed: 1,
          securityChecks: ['injection', 'xss', 'hardcoded_secrets', 'unsafe_functions']
        }
      };
    } catch (error) {
      return this.createErrorResult('security', error, startTime);
    }
  }

  /**
   * スタイル分析
   */
  private async runStyleAnalysis(fileData: any): Promise<AnalysisResult> {
    const startTime = Date.now();

    try {
      const analysisData = {
        files: [fileData],
        prInfo: {
          title: 'Style Analysis',
          body: 'Automated code style and convention check',
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
          filesAnalyzed: 1,
          styleChecks: ['naming', 'formatting', 'complexity', 'best_practices']
        }
      };
    } catch (error) {
      return this.createErrorResult('style', error, startTime);
    }
  }

  /**
   * 言語検出
   */
  private detectLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust'
    };
    return languageMap[ext || ''] || 'unknown';
  }

  /**
   * エージェント応答の解析
   */
  private parseAgentResponse(response: string, defaultCategory: string): Array<{
    line: number;
    message: string;
    severity: 'critical' | 'error' | 'warning' | 'info';
    category: string;
    suggestion?: string;
  }> {
    try {
      // JSON形式の応答を解析
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const analysisResult = JSON.parse(jsonMatch[1]);
        return (analysisResult.analysisResults || []).map((item: any) => ({
          line: item.line || 1,
          message: item.description || item.title || 'Analysis result',
          severity: item.severity || 'info',
          category: item.category || defaultCategory,
          suggestion: item.suggestion
        }));
      }
    } catch (parseError) {
      logger.warn('CodeAnalyzer', `応答解析エラー: ${parseError}`);
    }

    // フォールバック: プレーンテキストから問題を抽出
    return [{
      line: 1,
      message: `${defaultCategory}分析完了: ${response.substring(0, 100)}...`,
      severity: 'info' as const,
      category: defaultCategory
    }];
  }

  /**
   * エラー結果の作成
   */
  private createErrorResult(agentName: string, error: any, startTime: number): AnalysisResult {
    return {
      agentName,
      executionTimeMs: Date.now() - startTime,
      success: false,
      comments: [{
        line: 1,
        message: `${agentName}分析エラー: ${error.message || error}`,
        severity: 'error' as const,
        category: 'system'
      }],
      metadata: {}
    };
  }

  /**
   * 総合スコア計算
   */
  private calculateOverallScore(totalComments: number, criticalIssues: number): number {
    if (criticalIssues > 0) return Math.max(0.3, 1 - (criticalIssues * 0.3));
    if (totalComments > 10) return 0.5;
    if (totalComments > 5) return 0.7;
    if (totalComments > 2) return 0.8;
    return 0.9;
  }

  /**
   * 推奨アクションの決定
   */
  private determineRecommendation(score: number, criticalIssues: number): 'approve' | 'requestChanges' | 'comment' {
    if (criticalIssues > 0 || score < 0.6) return 'requestChanges';
    if (score < 0.8) return 'comment';
    return 'approve';
  }
}
