import { z } from 'zod';
import { FileChange } from '../types/github.js';

/**
 * セキュリティ問題の型定義
 */
export interface SecurityIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'injection' | 'authentication' | 'authorization' | 'cryptography' | 'sensitive-data' | 'configuration' | 'dependencies' | 'general';
  title: string;
  description: string;
  filename: string;
  line: number;
  evidence: string;
  recommendation: string;
  cweId?: string;
  owasp?: string;
}

/**
 * セキュリティスキャン結果の型定義
 */
export interface SecurityScanResult {
  filename: string;
  totalIssues: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  issues: SecurityIssue[];
  riskScore: number; // 0-100のリスクスコア
}

/**
 * セキュリティルールの定義
 */
interface SecurityRule {
  id: string;
  name: string;
  pattern: RegExp;
  severity: SecurityIssue['severity'];
  category: SecurityIssue['category'];
  description: string;
  recommendation: string;
  cweId?: string;
  owasp?: string;
  languages?: string[];
}

/**
 * セキュリティスキャナーツール
 *
 * 機能:
 * - コードパターンマッチング
 * - 脆弱性の検出
 * - セキュリティベストプラクティスの確認
 * - リスクスコアの計算
 */
export class SecurityScannerTool {

  /**
   * セキュリティルールの定義
   */
  private static readonly SECURITY_RULES: SecurityRule[] = [
    // SQL Injection
    {
      id: 'sql-injection-1',
      name: 'SQL Injection Risk',
      pattern: /\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)/i,
      severity: 'critical',
      category: 'injection',
      description: 'SQL文に直接変数を埋め込んでいます',
      recommendation: 'パラメータ化クエリまたはORM を使用してください',
      cweId: 'CWE-89',
      owasp: 'A03:2021 – Injection',
    },
    {
      id: 'sql-injection-2',
      name: 'Dynamic SQL Construction',
      pattern: /(?:query|sql)\s*[+]=?\s*['"`].*(?:SELECT|INSERT|UPDATE|DELETE)/i,
      severity: 'high',
      category: 'injection',
      description: '動的にSQL文を構築しています',
      recommendation: 'プリペアドステートメントを使用してください',
      cweId: 'CWE-89',
      owasp: 'A03:2021 – Injection',
    },

    // XSS
    {
      id: 'xss-1',
      name: 'Potential XSS',
      pattern: /innerHTML\s*=\s*(?!['"`]static)/i,
      severity: 'high',
      category: 'injection',
      description: 'innerHTML に動的な値を設定しています',
      recommendation: 'textContent を使用するか、適切にサニタイズしてください',
      cweId: 'CWE-79',
      owasp: 'A03:2021 – Injection',
    },
    {
      id: 'xss-2',
      name: 'Dangerous HTML Method',
      pattern: /\.(?:outerHTML|insertAdjacentHTML)\s*\(/i,
      severity: 'medium',
      category: 'injection',
      description: '危険なHTML挿入メソッドを使用しています',
      recommendation: '適切にサニタイズするか、より安全な方法を使用してください',
      cweId: 'CWE-79',
      owasp: 'A03:2021 – Injection',
    },

    // Command Injection
    {
      id: 'command-injection-1',
      name: 'Command Injection Risk',
      pattern: /(?:exec|system|shell_exec|passthru|eval)\s*\(\s*(?:\$|.*input|.*request)/i,
      severity: 'critical',
      category: 'injection',
      description: 'ユーザー入力をコマンド実行に使用している可能性があります',
      recommendation: 'ユーザー入力をコマンド実行に使用しないでください',
      cweId: 'CWE-78',
      owasp: 'A03:2021 – Injection',
    },

    // Hardcoded Credentials
    {
      id: 'hardcoded-password-1',
      name: 'Hardcoded Password',
      pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"`][^'"`\s]{8,}/i,
      severity: 'critical',
      category: 'sensitive-data',
      description: 'パスワードがハードコードされています',
      recommendation: '環境変数やシークレット管理システムを使用してください',
      cweId: 'CWE-798',
      owasp: 'A07:2021 – Identification and Authentication Failures',
    },
    {
      id: 'hardcoded-key-1',
      name: 'Hardcoded API Key',
      pattern: /(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"`][a-zA-Z0-9+/]{20,}/i,
      severity: 'critical',
      category: 'sensitive-data',
      description: 'APIキーがハードコードされています',
      recommendation: '環境変数を使用してください',
      cweId: 'CWE-798',
      owasp: 'A02:2021 – Cryptographic Failures',
    },

    // Weak Cryptography
    {
      id: 'weak-crypto-1',
      name: 'Weak Hash Algorithm',
      pattern: /(?:md5|sha1)\s*\(/i,
      severity: 'medium',
      category: 'cryptography',
      description: '弱いハッシュアルゴリズムを使用しています',
      recommendation: 'SHA-256以上の強力なハッシュアルゴリズムを使用してください',
      cweId: 'CWE-327',
      owasp: 'A02:2021 – Cryptographic Failures',
    },
    {
      id: 'weak-crypto-2',
      name: 'Insecure Random',
      pattern: /Math\.random\(\)/i,
      severity: 'medium',
      category: 'cryptography',
      description: 'セキュリティ用途に適さない乱数生成を使用しています',
      recommendation: 'crypto.randomBytes() などの暗号学的に安全な乱数生成器を使用してください',
      cweId: 'CWE-338',
      owasp: 'A02:2021 – Cryptographic Failures',
      languages: ['javascript', 'typescript'],
    },

    // Path Traversal
    {
      id: 'path-traversal-1',
      name: 'Path Traversal Risk',
      pattern: /(?:readFile|writeFile|createReadStream|createWriteStream)\s*\([^)]*\.\.\/[^)]*\)/i,
      severity: 'high',
      category: 'injection',
      description: 'パストラバーサル攻撃の可能性があります',
      recommendation: 'ファイルパスを適切に検証してください',
      cweId: 'CWE-22',
      owasp: 'A01:2021 – Broken Access Control',
    },

    // Debug/Console Logs
    {
      id: 'debug-info-1',
      name: 'Debug Information Exposure',
      pattern: /console\.(?:log|info|warn|error)\s*\([^)]*(?:password|token|key|secret)/i,
      severity: 'medium',
      category: 'sensitive-data',
      description: '機密情報がログに出力される可能性があります',
      recommendation: 'プロダクション環境では機密情報をログに出力しないでください',
      cweId: 'CWE-532',
      owasp: 'A09:2021 – Security Logging and Monitoring Failures',
    },

    // Insecure Protocols
    {
      id: 'insecure-protocol-1',
      name: 'Insecure HTTP',
      pattern: /['"`]http:\/\/(?!(?:localhost|127\.0\.0\.1|0\.0\.0\.0))/i,
      severity: 'medium',
      category: 'configuration',
      description: '安全でないHTTPプロトコルを使用しています',
      recommendation: 'HTTPSを使用してください',
      cweId: 'CWE-319',
      owasp: 'A02:2021 – Cryptographic Failures',
    },

    // CORS Issues
    {
      id: 'cors-wildcard-1',
      name: 'CORS Wildcard',
      pattern: /['"`]\*['"`]/,
      severity: 'medium',
      category: 'configuration',
      description: 'CORSでワイルドカードを使用しています',
      recommendation: '特定のオリジンを指定してください',
      cweId: 'CWE-942',
      owasp: 'A05:2021 – Security Misconfiguration',
    },

    // Authentication Issues
    {
      id: 'weak-session-1',
      name: 'Weak Session Configuration',
      pattern: /(?:httpOnly|secure|sameSite)\s*:\s*false/i,
      severity: 'medium',
      category: 'authentication',
      description: 'セッションのセキュリティ設定が不適切です',
      recommendation: 'httpOnly, secure, sameSite属性を適切に設定してください',
      cweId: 'CWE-614',
      owasp: 'A07:2021 – Identification and Authentication Failures',
    },

    // NoSQL Injection
    {
      id: 'nosql-injection-1',
      name: 'NoSQL Injection Risk',
      pattern: /\$where.*\$\{.*\}/i,
      severity: 'high',
      category: 'injection',
      description: 'NoSQLインジェクションの可能性があります',
      recommendation: 'パラメータ化クエリを使用してください',
      cweId: 'CWE-943',
      owasp: 'A03:2021 – Injection',
    },
  ];

  /**
   * ファイルをスキャンしてセキュリティ問題を検出
   */
  static scanFile(content: string, filename: string): SecurityScanResult {
    const lines = content.split('\n');
    const issues: SecurityIssue[] = [];
    const language = this.getFileLanguage(filename);

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      this.SECURITY_RULES.forEach(rule => {
        // 言語固有のルールをチェック
        if (rule.languages && !rule.languages.includes(language)) {
          return;
        }

        if (rule.pattern.test(line)) {
          issues.push({
            severity: rule.severity,
            category: rule.category,
            title: rule.name,
            description: rule.description,
            filename,
            line: lineNumber,
            evidence: line.trim(),
            recommendation: rule.recommendation,
            cweId: rule.cweId,
            owasp: rule.owasp,
          });
        }
      });
    });

    // 重要度別の集計
    const bySeverity = {
      critical: issues.filter(i => i.severity === 'critical').length,
      high: issues.filter(i => i.severity === 'high').length,
      medium: issues.filter(i => i.severity === 'medium').length,
      low: issues.filter(i => i.severity === 'low').length,
    };

    // リスクスコアを計算
    const riskScore = this.calculateRiskScore(bySeverity);

    return {
      filename,
      totalIssues: issues.length,
      bySeverity,
      issues,
      riskScore,
    };
  }

  /**
   * 複数ファイルを一括スキャン
   */
  static scanFiles(files: FileChange[]): SecurityScanResult[] {
    const results: SecurityScanResult[] = [];

    files.forEach(file => {
      if (!file.patch) return;

      // パッチから新しく追加された行のみを抽出
      const addedLines = this.extractAddedLines(file.patch);
      if (addedLines.length === 0) return;

      const addedContent = addedLines.join('\n');
      const scanResult = this.scanFile(addedContent, file.filename);

      if (scanResult.totalIssues > 0) {
        results.push(scanResult);
      }
    });

    return results;
  }

  /**
   * セキュリティ問題の優先度を決定
   */
  static prioritizeIssues(issues: SecurityIssue[]): SecurityIssue[] {
    const priorityOrder = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    return issues.sort((a, b) => {
      // 重要度で並び替え
      const severityDiff = priorityOrder[b.severity] - priorityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;

      // カテゴリで並び替え（injection系を優先）
      const categoryPriority = {
        'injection': 5,
        'sensitive-data': 4,
        'authentication': 3,
        'authorization': 3,
        'cryptography': 2,
        'configuration': 1,
        'dependencies': 1,
        'general': 0,
      };

      return (categoryPriority[b.category] || 0) - (categoryPriority[a.category] || 0);
    });
  }

  /**
   * セキュリティサマリーを生成
   */
  static generateSecuritySummary(results: SecurityScanResult[]): {
    totalFiles: number;
    totalIssues: number;
    bySeverity: { critical: number; high: number; medium: number; low: number };
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    topIssues: SecurityIssue[];
  } {
    const totalFiles = results.length;
    const allIssues = results.flatMap(r => r.issues);

    const bySeverity = {
      critical: allIssues.filter(i => i.severity === 'critical').length,
      high: allIssues.filter(i => i.severity === 'high').length,
      medium: allIssues.filter(i => i.severity === 'medium').length,
      low: allIssues.filter(i => i.severity === 'low').length,
    };

    // 全体のリスクレベルを決定
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (bySeverity.critical > 0) riskLevel = 'critical';
    else if (bySeverity.high > 2) riskLevel = 'high';
    else if (bySeverity.high > 0 || bySeverity.medium > 5) riskLevel = 'medium';

    // 上位の問題を抽出
    const topIssues = this.prioritizeIssues(allIssues).slice(0, 5);

    return {
      totalFiles,
      totalIssues: allIssues.length,
      bySeverity,
      riskLevel,
      topIssues,
    };
  }

  /**
   * ファイル言語を取得
   */
  private static getFileLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'java': 'java',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'cs': 'csharp',
    };
    return languageMap[ext || ''] || 'unknown';
  }

  /**
   * パッチから追加された行を抽出
   */
  private static extractAddedLines(patch: string): string[] {
    const lines = patch.split('\n');
    return lines
      .filter(line => line.startsWith('+') && !line.startsWith('+++'))
      .map(line => line.substring(1));
  }

  /**
   * リスクスコアを計算（0-100）
   */
  private static calculateRiskScore(bySeverity: { critical: number; high: number; medium: number; low: number }): number {
    const weights = {
      critical: 25,
      high: 10,
      medium: 5,
      low: 1,
    };

    const score = (
      bySeverity.critical * weights.critical +
      bySeverity.high * weights.high +
      bySeverity.medium * weights.medium +
      bySeverity.low * weights.low
    );

    // 0-100の範囲に正規化
    return Math.min(100, score);
  }
}
