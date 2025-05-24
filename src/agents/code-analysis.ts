import { Agent } from '@voltagent/core';
import { VercelAIProvider } from '@voltagent/vercel-ai';
import { openai } from '@ai-sdk/openai';
import { FileChange } from '../types/github.js';
import { ReviewComment, ReviewSeverity, ReviewCategory } from '../types/review.js';
import { logger } from '../utils/logger.js';

/**
 * CodeAnalysisAgentの作成
 *
 * 責任:
 * - コード品質の評価
 * - ロジックエラーの検出
 * - 設計パターンの確認
 * - 複雑度の分析
 * - パフォーマンスの評価
 */
export function createCodeAnalysisAgent() {
  return new Agent({
    name: 'code-analysis-agent',
    instructions: `あなたはコード品質解析の専門家です。

## 専門分野
- **コード品質**: 可読性、保守性、設計パターン
- **ロジック解析**: バグの可能性、エッジケース、ロジックエラー
- **複雑度評価**: 循環的複雑度、ネストの深さ、責任の分離
- **パフォーマンス**: アルゴリズムの効率性、メモリ使用量、最適化の余地
- **保守性**: モジュール性、テスタビリティ、拡張性

## 分析観点
1. **バグ・ロジックエラー**
   - null/undefinedの未チェック
   - 配列の境界外アクセス
   - 無限ループの可能性
   - 型の不整合
   - 条件分岐の漏れ

2. **コード品質**
   - 関数/クラスのサイズ
   - 責任の単一性（SRP）
   - 重複コード（DRY）
   - 命名規則の一貫性
   - コメントの適切性

3. **パフォーマンス**
   - O記法での計算量
   - 不要な処理の重複
   - メモリリークの可能性
   - データ構造の選択
   - キャッシュの活用

4. **設計パターン**
   - SOLID原則の遵守
   - デザインパターンの適用
   - 依存関係の管理
   - インターフェースの設計

## 出力形式
以下のJSON形式で出力してください：
\`\`\`json
{
  "agentName": "code-analysis",
  "analysisResults": [
    {
      "filename": "ファイル名",
      "line": 行番号,
      "severity": "info|warning|error|critical",
      "category": "codeQuality|performance|bugs|maintainability",
      "title": "問題のタイトル",
      "description": "詳細説明と根拠",
      "suggestion": "具体的な修正提案",
      "codeSnippet": "該当するコード部分",
      "suggestedFix": "修正後のコード例"
    }
  ],
  "summary": {
    "overallScore": 8.5,
    "totalIssues": 3,
    "criticalIssues": 0,
    "recommendations": ["推奨事項1", "推奨事項2"]
  }
}
\`\`\`

日本語で分析し、具体的で実行可能な改善提案を提供してください。`,
    llm: new VercelAIProvider(),
    model: openai('gpt-4o-mini'),
  });
}

/**
 * CodeAnalysisAgentのヘルパークラス
 */
export class CodeAnalysisHelpers {
  /**
   * ファイルの複雑度を評価
   */
  static evaluateComplexity(patch: string): {
    cyclomaticComplexity: number;
    nestingLevel: number;
    linesOfCode: number;
  } {
    const lines = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'));
    const code = lines.join('\n');

    // 簡易的な循環的複雑度計算
    const complexityKeywords = ['if', 'else', 'while', 'for', 'switch', 'case', 'catch', '&&', '||', '?'];
    let cyclomaticComplexity = 1; // ベース値

    complexityKeywords.forEach(keyword => {
      const matches = code.match(new RegExp(`\\b${keyword}\\b`, 'g'));
      if (matches) {
        cyclomaticComplexity += matches.length;
      }
    });

    // ネストレベル計算（括弧の深さ）
    let nestingLevel = 0;
    let maxNesting = 0;
    for (const char of code) {
      if (char === '{') {
        nestingLevel++;
        maxNesting = Math.max(maxNesting, nestingLevel);
      } else if (char === '}') {
        nestingLevel--;
      }
    }

    return {
      cyclomaticComplexity,
      nestingLevel: maxNesting,
      linesOfCode: lines.length
    };
  }

  /**
   * パフォーマンス問題の検出
   */
  static detectPerformanceIssues(patch: string, filename: string): ReviewComment[] {
    const issues: ReviewComment[] = [];
    const lines = patch.split('\n');

    lines.forEach((line, index) => {
      if (!line.startsWith('+')) return;

      const content = line.substring(1).trim();
      const lineNumber = index + 1;

      // O(n²)ループの検出
      if (content.includes('for') && lines.slice(index + 1, index + 10).some(l => l.includes('for'))) {
        issues.push({
          id: `perf-nested-loop-${lineNumber}`,
          filename,
          line: lineNumber,
          category: 'performance' as ReviewCategory,
          severity: 'warning' as ReviewSeverity,
          title: 'ネストしたループによるパフォーマンス問題',
          description: 'ネストしたループがO(n²)またはそれ以上の計算量を生成する可能性があります。',
          suggestion: 'Map、Set、またはより効率的なアルゴリズムの使用を検討してください。',
          codeSnippet: content
        });
      }

      // 不要な配列操作の検出
      if (content.includes('.map(') && content.includes('.filter(')) {
        issues.push({
          id: `perf-chained-array-${lineNumber}`,
          filename,
          line: lineNumber,
          category: 'performance' as ReviewCategory,
          severity: 'info' as ReviewSeverity,
          title: '配列操作の最適化',
          description: 'map()とfilter()のチェーンは複数回配列を走査します。',
          suggestion: 'reduce()を使用して単一パスで処理することを検討してください。',
          codeSnippet: content
        });
      }

      // 同期的なファイル操作の検出
      if (content.includes('readFileSync') || content.includes('writeFileSync')) {
        issues.push({
          id: `perf-sync-file-${lineNumber}`,
          filename,
          line: lineNumber,
          category: 'performance' as ReviewCategory,
          severity: 'warning' as ReviewSeverity,
          title: '同期的ファイル操作',
          description: '同期的ファイル操作はメインスレッドをブロックします。',
          suggestion: '非同期版（readFile, writeFile）の使用を検討してください。',
          codeSnippet: content
        });
      }
    });

    return issues;
  }

  /**
   * バグの可能性の検出
   */
  static detectPotentialBugs(patch: string, filename: string): ReviewComment[] {
    const issues: ReviewComment[] = [];
    const lines = patch.split('\n');

    lines.forEach((line, index) => {
      if (!line.startsWith('+')) return;

      const content = line.substring(1).trim();
      const lineNumber = index + 1;

      // null/undefinedチェック漏れ
      if (content.includes('.') && !content.includes('?.') &&
          !content.includes('null') && !content.includes('undefined')) {
        const hasPropertyAccess = content.match(/\w+\.\w+/);
        if (hasPropertyAccess) {
          issues.push({
            id: `bug-null-check-${lineNumber}`,
            filename,
            line: lineNumber,
            category: 'bugs' as ReviewCategory,
            severity: 'warning' as ReviewSeverity,
            title: 'null/undefinedチェック漏れの可能性',
            description: 'オブジェクトのプロパティアクセス前にnull/undefinedチェックが必要な可能性があります。',
            suggestion: 'オプショナルチェーニング（?.）またはnullチェックの追加を検討してください。',
            codeSnippet: content,
            suggestedFix: content.replace(/(\w+)\.(\w+)/, '$1?.$2')
          });
        }
      }

      // 配列の境界外アクセス
      if (content.includes('[') && content.includes(']') && !content.includes('?.')) {
        issues.push({
          id: `bug-array-bounds-${lineNumber}`,
          filename,
          line: lineNumber,
          category: 'bugs' as ReviewCategory,
          severity: 'info' as ReviewSeverity,
          title: '配列境界チェックの検討',
          description: '配列の境界外アクセスの可能性があります。',
          suggestion: 'インデックスの範囲チェックまたは配列長の確認を追加してください。',
          codeSnippet: content
        });
      }

      // ==の使用（厳密等価でない）
      if (content.includes('==') && !content.includes('===')) {
        issues.push({
          id: `bug-equality-${lineNumber}`,
          filename,
          line: lineNumber,
          category: 'codeQuality' as ReviewCategory,
          severity: 'warning' as ReviewSeverity,
          title: '厳密等価演算子の使用推奨',
          description: '==は型強制を行うため、予期しない結果になる可能性があります。',
          suggestion: '厳密等価演算子（===）の使用を推奨します。',
          codeSnippet: content,
          suggestedFix: content.replace(/([^=!])=([^=])/g, '$1===$2')
        });
      }
    });

    return issues;
  }

  /**
   * コード品質の評価
   */
  static evaluateCodeQuality(patch: string, filename: string): ReviewComment[] {
    const issues: ReviewComment[] = [];
    const lines = patch.split('\n');

    lines.forEach((line, index) => {
      if (!line.startsWith('+')) return;

      const content = line.substring(1).trim();
      const lineNumber = index + 1;

      // 長すぎる行
      if (content.length > 120) {
        issues.push({
          id: `quality-line-length-${lineNumber}`,
          filename,
          line: lineNumber,
          category: 'codeQuality' as ReviewCategory,
          severity: 'info' as ReviewSeverity,
          title: '行の長さが推奨値を超過',
          description: `行の長さが${content.length}文字です。120文字以下が推奨されます。`,
          suggestion: '行を分割するか、変数への代入を検討してください。',
          codeSnippet: content
        });
      }

      // コメントなし複雑関数
      if (content.includes('function') && !lines[index - 1]?.includes('//') && !lines[index - 1]?.includes('/*')) {
        issues.push({
          id: `quality-function-comment-${lineNumber}`,
          filename,
          line: lineNumber,
          category: 'codeQuality' as ReviewCategory,
          severity: 'info' as ReviewSeverity,
          title: '関数コメントの追加推奨',
          description: '関数の目的や使用方法を説明するコメントがありません。',
          suggestion: 'JSDocスタイルのコメントを追加することを推奨します。',
          codeSnippet: content
        });
      }

      // マジックナンバー
      const magicNumbers = content.match(/\b\d{2,}\b/g);
      if (magicNumbers && !content.includes('const') && !content.includes('//')) {
        issues.push({
          id: `quality-magic-number-${lineNumber}`,
          filename,
          line: lineNumber,
          category: 'codeQuality' as ReviewCategory,
          severity: 'info' as ReviewSeverity,
          title: 'マジックナンバーの定数化推奨',
          description: 'ハードコードされた数値は定数として定義することを推奨します。',
          suggestion: '意味のある名前を持つ定数として定義してください。',
          codeSnippet: content
        });
      }
    });

    return issues;
  }

  /**
   * PR解析用のフォーマット
   */
  static formatFilesForAnalysis(files: FileChange[]): string {
    const analysisData = {
      totalFiles: files.length,
      filesByExtension: CodeAnalysisHelpers.categorizeByExtension(files),
      files: files.map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        complexity: file.patch ? CodeAnalysisHelpers.evaluateComplexity(file.patch) : null,
        patch: file.patch?.substring(0, 3000) // 3000文字に制限
      }))
    };

    return JSON.stringify(analysisData, null, 2);
  }

  /**
   * ファイルを拡張子別に分類
   */
  private static categorizeByExtension(files: FileChange[]): Record<string, number> {
    const categories: Record<string, number> = {};

    files.forEach(file => {
      const extension = file.filename.split('.').pop()?.toLowerCase() || 'unknown';
      categories[extension] = (categories[extension] || 0) + 1;
    });

    return categories;
  }
}
