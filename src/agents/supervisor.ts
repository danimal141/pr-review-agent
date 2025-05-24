import { Agent } from '@voltagent/core';
import { VercelAIProvider } from '@voltagent/vercel-ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { GitHubPREvent, FileChange } from '../types/github.js';
import { ReviewCategory, ReviewResult, AgentResult } from '../types/review.js';
import { logger } from '../utils/logger.js';

/**
 * SupervisorAgentの作成
 *
 * 責任:
 * - PR情報の解析
 * - 専門エージェントの起動と協調
 * - レビュー結果の統合
 * - フィードバックの生成
 */
export function createSupervisorAgent() {
  return new Agent({
    name: 'supervisor-agent',
    instructions: `あなたはPRレビューを統括するSupervisorAgentです。

役割:
- プルリクエストの変更内容を分析
- 専門エージェント（コード解析、セキュリティ、スタイル）の作業を協調
- 総合的なレビュー結果の生成

分析観点:
1. 変更の影響範囲と重要度
2. ファイル間の依存関係
3. 各専門領域での問題の重要度
4. ユーザーにとって最も価値のあるフィードバック

出力は必ず日本語で、建設的で具体的な改善提案を含めてください。

## 入力形式
PRの変更情報をJSON形式で受け取り、レビューコメントを生成してください。

## 出力形式
以下のJSON形式で出力してください：
\`\`\`json
{
  "prNumber": 123,
  "summary": "レビューの要約",
  "issues": [
    {
      "filename": "ファイル名",
      "line": 行番号,
      "severity": "warning|error|critical|info",
      "category": "codeQuality|security|performance|style|bestPractices|bugs|maintainability",
      "title": "問題のタイトル",
      "description": "詳細説明",
      "suggestion": "修正提案"
    }
  ],
  "recommendations": ["推奨事項1", "推奨事項2"],
  "overallScore": 8.5
}
\`\`\``,
    llm: new VercelAIProvider(),
    model: openai('gpt-4o-mini'),
  });
}

/**
 * SupervisorAgentのヘルパークラス
 */
export class SupervisorAgentHelpers {

  /**
   * ファイルをタイプ別に分類
   */
  static categorizeFilesByType(files: FileChange[]): Record<string, number> {
    const categories: Record<string, number> = {};

    files.forEach(file => {
      const extension = file.filename.split('.').pop()?.toLowerCase() || 'unknown';
      categories[extension] = (categories[extension] || 0) + 1;
    });

    return categories;
  }

  /**
   * 変更の影響レベルを計算
   */
  static calculateImpactLevel(files: FileChange[]): 'low' | 'medium' | 'high' | 'critical' {
    const totalChanges = files.reduce((sum, file) => sum + file.changes, 0);
    const hasConfigChanges = files.some(file =>
      file.filename.includes('config') ||
      file.filename.includes('package.json') ||
      file.filename.includes('.env')
    );

    if (totalChanges > 1000 || hasConfigChanges) return 'critical';
    if (totalChanges > 500) return 'high';
    if (totalChanges > 100) return 'medium';
    return 'low';
  }

  /**
   * レビュー優先度を計算
   */
  static calculateReviewPriority(files: FileChange[]): 'low' | 'medium' | 'high' | 'critical' {
    const hasSecurityFiles = files.some(file =>
      file.filename.includes('auth') ||
      file.filename.includes('security') ||
      file.filename.includes('password')
    );

    if (hasSecurityFiles) return 'critical';
    return SupervisorAgentHelpers.calculateImpactLevel(files);
  }

  /**
   * PRデータを解析用フォーマットに変換
   */
  static formatPRForAnalysis(prEvent: GitHubPREvent, files: FileChange[]): string {
    const analysis = {
      prNumber: prEvent.number,
      title: prEvent.pullRequest.title,
      body: prEvent.pullRequest.body || '',
      totalFiles: files.length,
      totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
      totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
      filesByType: SupervisorAgentHelpers.categorizeFilesByType(files),
      impactLevel: SupervisorAgentHelpers.calculateImpactLevel(files),
      reviewPriority: SupervisorAgentHelpers.calculateReviewPriority(files),
      files: files.map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch?.substring(0, 2000) // パッチを2000文字に制限
      }))
    };

    return JSON.stringify(analysis, null, 2);
  }

  /**
   * レビュー結果をパース
   */
  static parseReviewResult(response: string): ReviewResult | null {
    try {
      // JSON部分を抽出
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          prNumber: parsed.prNumber,
          repository: '', // TODO: リポジトリ情報を追加
          reviewId: `review-${Date.now()}`,
          createdAt: new Date().toISOString(),
          agentResults: [{
            agentName: 'supervisor',
            executionTimeMs: 0,
            success: true,
            comments: parsed.issues || [],
            metadata: { overallScore: parsed.overallScore }
          }],
          summary: {
            totalComments: parsed.issues?.length || 0,
            bySeverity: {
              info: parsed.issues?.filter((i: any) => i.severity === 'info').length || 0,
              warning: parsed.issues?.filter((i: any) => i.severity === 'warning').length || 0,
              error: parsed.issues?.filter((i: any) => i.severity === 'error').length || 0,
              critical: parsed.issues?.filter((i: any) => i.severity === 'critical').length || 0,
            },
            byCategory: {},
            overallScore: parsed.overallScore || 0,
            recommendation: 'comment' as const
          },
          executionStats: {
            totalTimeMs: 0,
            filesAnalyzed: 0,
            linesAnalyzed: 0
          }
        };
      }
      return null;
    } catch (error) {
      logger.error('SupervisorAgent', `レビュー結果のパースに失敗: ${error}`);
      return null;
    }
  }
}
