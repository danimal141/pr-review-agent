import { describe, it, expect, vi } from 'vitest';
import { FileChange } from '../../src/types/github';

// VoltAgent関連のモジュールをモック
vi.mock('@voltagent/core', () => ({
  Agent: vi.fn()
}));

vi.mock('@voltagent/vercel-ai', () => ({
  VercelAIProvider: vi.fn()
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn()
}));

import { Agent } from '@voltagent/core';

// モック後にインポート
import { SecurityHelpers, createSecurityAgent } from '../../src/agents/security';

describe('SecurityAgent', () => {
  describe('createSecurityAgent', () => {
    it('正常にSecurityAgentを作成できる', () => {
      const agent = createSecurityAgent();
      expect(agent).toBeDefined();
    });

    it('エージェントの指示に必要なキーワードが含まれている', () => {
      const agent = createSecurityAgent();
      expect(vi.mocked(Agent)).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'security-agent',
          instructions: expect.stringContaining('セキュリティ')
        })
      );
    });
  });
});

describe('SecurityHelpers', () => {
  describe('detectSQLInjection', () => {
    it('文字列連結によるSQLインジェクション脆弱性を検出する', () => {
      const sqlInjectionPatch = `@@ -1,3 +1,5 @@
+const query = "SELECT * FROM users WHERE id = " + userId;
+const sql = 'DELETE FROM posts WHERE author = ' + author;`;

      const issues = SecurityHelpers.detectSQLInjection(sqlInjectionPatch, 'database.ts');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('security');
        expect(issue.severity).toBe('critical');
        expect(issue.title).toContain('SQLインジェクション脆弱性');
        expect(issue.description).toContain('攻撃者は任意のSQLコード');
        expect(issue.suggestion).toContain('プリペアドステートメント');
      });
    });

    it('テンプレートリテラルによるSQLインジェクション脆弱性を検出する', () => {
      const templateLiteralPatch = `@@ -1,3 +1,5 @@
+const query = \`SELECT * FROM orders WHERE customer_id = \${customerId}\`;
+const updateSql = \`UPDATE users SET name = '\${name}' WHERE id = \${id}\`;`;

      const issues = SecurityHelpers.detectSQLInjection(templateLiteralPatch, 'database.ts');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('security');
        expect(issue.severity).toBe('critical');
        expect(issue.title).toContain('SQLインジェクション脆弱性');
      });
    });

    it('SQLキーワードを含まない文字列連結は検出しない', () => {
      const nonSqlPatch = `@@ -1,3 +1,5 @@
+const message = "Hello " + userName;
+const url = baseUrl + "/api/" + endpoint;`;

      const issues = SecurityHelpers.detectSQLInjection(nonSqlPatch, 'utils.ts');

      expect(issues).toHaveLength(0);
    });

    it('プリペアドステートメントは検出しない', () => {
      const safeSqlPatch = `@@ -1,3 +1,5 @@
+const result = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
+const query = "SELECT * FROM users WHERE id = $1";`;

      const issues = SecurityHelpers.detectSQLInjection(safeSqlPatch, 'database.ts');

      expect(issues).toHaveLength(0);
    });
  });

  describe('detectXSS', () => {
    it('innerHTML の不安全な使用を検出する', () => {
      const innerHTMLPatch = `@@ -1,3 +1,5 @@
+element.innerHTML = userInput;
+div.outerHTML = '<div>' + content + '</div>';`;

      const issues = SecurityHelpers.detectXSS(innerHTMLPatch, 'frontend.js');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('security');
        expect(issue.severity).toBe('error');
        expect(issue.title).toContain('XSS');
        expect(issue.description).toContain('攻撃者は任意のJavaScript');
        expect(issue.suggestion).toContain('textContent');
      });
    });

    it('React dangerouslySetInnerHTML の不安全な使用を検出する', () => {
      const dangerousPatch = `@@ -1,3 +1,5 @@
+<div dangerouslySetInnerHTML={{__html: userContent}} />
+const html = { __html: data.description };`;

      const issues = SecurityHelpers.detectXSS(dangerousPatch, 'component.tsx');

      expect(issues).toHaveLength(1);
      expect(issues[0].category).toBe('security');
      expect(issues[0].severity).toBe('error');
      expect(issues[0].title).toContain('dangerouslySetInnerHTML');
    });

    it('eval() の使用を検出する', () => {
      const evalPatch = `@@ -1,3 +1,5 @@
+const result = eval(userCode);
+const func = eval('(' + functionString + ')');`;

      const issues = SecurityHelpers.detectXSS(evalPatch, 'dynamic.js');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('security');
        expect(issue.severity).toBe('critical');
        expect(issue.title).toContain('コードインジェクション');
        expect(issue.suggestion).toContain('JSON.parse()');
      });
    });

    it('サニタイズ済みのinnerHTMLは検出しない', () => {
      const safePatch = `@@ -1,3 +1,5 @@
+element.innerHTML = DOMPurify.sanitize(userInput);
+div.textContent = userInput;`;

      const issues = SecurityHelpers.detectXSS(safePatch, 'frontend.js');

      expect(issues).toHaveLength(0);
    });
  });

  describe('detectAuthenticationIssues', () => {
    it('ハードコードされたパスワードを検出する', () => {
      const hardcodedPatch = `@@ -1,3 +1,5 @@
+const password = "mySecretPassword123";
+const apiKey = 'sk-1234567890abcdef';
+const secret = "jwt-secret-key-here";`;

      const issues = SecurityHelpers.detectAuthenticationIssues(hardcodedPatch, 'config.ts');

      expect(issues).toHaveLength(4);
      const criticalIssues = issues.filter(issue => issue.severity === 'critical');
      expect(criticalIssues).toHaveLength(3); // password, apiKey, secret
      criticalIssues.forEach(issue => {
        expect(issue.category).toBe('security');
        expect(issue.severity).toBe('critical');
        expect(issue.title).toContain('ハードコードされた認証情報');
        expect(issue.description).toContain('機密情報が漏洩');
        expect(issue.suggestion).toContain('環境変数');
        expect(issue.codeSnippet).toContain('***REDACTED***');
      });

      const warningIssues = issues.filter(issue => issue.severity === 'warning');
      expect(warningIssues).toHaveLength(1); // JWT weak secret
      expect(warningIssues[0].title).toContain('弱いJWT秘密鍵');
    });

    it('弱いハッシュアルゴリズムを検出する', () => {
      const weakHashPatch = `@@ -1,3 +1,5 @@
+const hash = crypto.createHash('md5').update(password).digest('hex');
+const sha1Hash = crypto.createHash('sha1').update(data).digest('hex');`;

      const issues = SecurityHelpers.detectAuthenticationIssues(weakHashPatch, 'auth.ts');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('security');
        expect(issue.severity).toBe('error');
        expect(issue.title).toContain('弱いハッシュアルゴリズム');
        expect(issue.suggestion).toContain('bcrypt');
      });
    });

    it('弱いJWT秘密鍵を検出する', () => {
      const weakJwtPatch = `@@ -1,3 +1,5 @@
+const jwt = require('jsonwebtoken');
+const token = jwt.sign(payload, 'secret');`;

      const issues = SecurityHelpers.detectAuthenticationIssues(weakJwtPatch, 'jwt.ts');

      expect(issues).toHaveLength(1);
      expect(issues[0].category).toBe('security');
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].title).toContain('弱いJWT秘密鍵');
      expect(issues[0].suggestion).toContain('256ビット');
    });

    it('環境変数の使用は検出しない', () => {
      const envVarPatch = `@@ -1,3 +1,5 @@
+const password = process.env.DB_PASSWORD;
+const apiKey = process.env.API_KEY;`;

      const issues = SecurityHelpers.detectAuthenticationIssues(envVarPatch, 'config.ts');

      expect(issues).toHaveLength(0);
    });
  });

  describe('detectDataExposure', () => {
    it('ログでの機密情報露出を検出する', () => {
      const logExposurePatch = `@@ -1,3 +1,5 @@
+console.log('User password:', user.password);
+console.error('API token failed:', apiToken);
+console.info('Secret key:', secretKey);`;

      const issues = SecurityHelpers.detectDataExposure(logExposurePatch, 'service.ts');

      expect(issues).toHaveLength(3);
      issues.forEach(issue => {
        expect(issue.category).toBe('security');
        expect(issue.severity).toBe('warning');
        expect(issue.title).toContain('ログでの機密情報露出');
        expect(issue.suggestion).toContain('マスキング処理');
      });
    });

    it('エラーメッセージでの情報露出を検出する', () => {
      const errorExposurePatch = `@@ -1,3 +1,5 @@
+throw new Error('Database connection failed: ' + password);
+throw new Error('Internal server error: ' + internalDetails);`;

      const issues = SecurityHelpers.detectDataExposure(errorExposurePatch, 'database.ts');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('security');
        expect(issue.severity).toBe('warning');
        expect(issue.title).toContain('エラーメッセージでの情報露出');
        expect(issue.suggestion).toContain('一般的なエラーメッセージ');
      });
    });

    it('HTTP経由での機密データ送信を検出する', () => {
      const httpExposurePatch = `@@ -1,3 +1,5 @@
+const response = await fetch('http://api.example.com/login', {
+  body: JSON.stringify({ password: userPassword })
+});`;

      const issues = SecurityHelpers.detectDataExposure(httpExposurePatch, 'api.ts');

      expect(issues).toHaveLength(1);
      expect(issues[0].category).toBe('security');
      expect(issues[0].severity).toBe('error');
      expect(issues[0].title).toContain('HTTP経由での機密データ送信');
      expect(issues[0].suggestion).toContain('HTTPS');
      expect(issues[0].suggestedFix).toContain('https://');
    });

    it('localhostのHTTPは検出しない', () => {
      const localhostPatch = `@@ -1,3 +1,5 @@
+const response = await fetch('http://localhost:3000/api', {
+  headers: { 'Authorization': 'Bearer ' + token }
+});`;

      const issues = SecurityHelpers.detectDataExposure(localhostPatch, 'test.ts');

      expect(issues).toHaveLength(0);
    });

    it('一般的なログは検出しない', () => {
      const normalLogPatch = `@@ -1,3 +1,5 @@
+console.log('Request processed successfully');
+console.info('User logged in:', user.email);`;

      const issues = SecurityHelpers.detectDataExposure(normalLogPatch, 'service.ts');

      expect(issues).toHaveLength(0);
    });
  });

  describe('detectConfigurationIssues', () => {
    it('過度に許可的なCORS設定を検出する', () => {
      const corsPatch = `@@ -1,3 +1,5 @@
+app.use(cors({ origin: '*' }));
+const corsOptions = { origin: '*', credentials: true };`;

      const issues = SecurityHelpers.detectConfigurationIssues(corsPatch, 'server.ts');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('security');
        expect(issue.severity).toBe('warning');
        expect(issue.title).toContain('CORS設定');
        expect(issue.suggestion).toContain('特定のオリジン');
      });
    });

    it('本番環境でのデバッグモードを検出する', () => {
      const debugProdPatch = `@@ -1,3 +1,5 @@
+const DEBUG = true;
+process.env.DEBUG = 'true';`;

      const issues = SecurityHelpers.detectConfigurationIssues(debugProdPatch, 'config.prod.ts');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('security');
        expect(issue.severity).toBe('error');
        expect(issue.title).toContain('本番環境でのデバッグモード');
        expect(issue.suggestion).toContain('デバッグモードを無効');
      });
    });

    it('弱い乱数生成を検出する', () => {
      const weakRandomPatch = `@@ -1,3 +1,5 @@
+const token = Math.random().toString(36);
+const sessionId = Math.random() * 1000000;`;

      const issues = SecurityHelpers.detectConfigurationIssues(weakRandomPatch, 'auth.ts');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('security');
        expect(issue.severity).toBe('warning');
        expect(issue.title).toContain('弱い乱数生成');
        expect(issue.suggestion).toContain('crypto.randomBytes');
        expect(issue.suggestedFix).toContain('crypto.randomBytes');
      });
    });

    it('セキュリティに関係ないMath.random()は検出しない', () => {
      const gameRandomPatch = `@@ -1,3 +1,5 @@
+const diceRoll = Math.floor(Math.random() * 6) + 1;
+const color = colors[Math.floor(Math.random() * colors.length)];`;

      const issues = SecurityHelpers.detectConfigurationIssues(gameRandomPatch, 'game.ts');

      expect(issues).toHaveLength(0);
    });
  });

  describe('formatFilesForSecurityAnalysis', () => {
    const mockFiles: FileChange[] = [
      {
        sha: 'abc123',
        filename: 'src/auth/login.ts',
        status: 'modified',
        additions: 50,
        deletions: 10,
        changes: 60,
        blobUrl: 'https://github.com/test/test/blob/abc123/src/auth/login.ts',
        patch: 'const password = "hardcoded";'
      },
      {
        sha: 'def456',
        filename: 'src/utils/helper.js',
        status: 'added',
        additions: 20,
        deletions: 0,
        changes: 20,
        blobUrl: 'https://github.com/test/test/blob/def456/src/utils/helper.js',
        patch: 'function helper() { return "safe"; }'
      },
      {
        sha: 'ghi789',
        filename: 'config/database.json',
        status: 'modified',
        additions: 5,
        deletions: 2,
        changes: 7,
        blobUrl: 'https://github.com/test/test/blob/ghi789/config/database.json',
        patch: '{ "host": "localhost" }'
      }
    ];

    it('セキュリティ分析用形式に正しく変換する', () => {
      const result = SecurityHelpers.formatFilesForSecurityAnalysis(mockFiles);
      const parsed = JSON.parse(result);

      expect(parsed.totalFiles).toBe(3);
      expect(parsed.filesByType).toEqual({
        'high-risk': 2,   // auth/login.ts, config/database.json
        'medium-risk': 1, // utils/helper.js
        'low-risk': 0
      });
      expect(parsed.highRiskFiles).toHaveLength(2);
      expect(parsed.files).toHaveLength(3);
    });

    it('各ファイルのセキュリティリスクレベルを正しく評価する', () => {
      const result = SecurityHelpers.formatFilesForSecurityAnalysis(mockFiles);
      const parsed = JSON.parse(result);

      expect(parsed.files[0].securityRisk).toBe('high-risk');   // auth
      expect(parsed.files[1].securityRisk).toBe('medium-risk'); // utils
      expect(parsed.files[2].securityRisk).toBe('high-risk');   // config
    });

    it('パッチを2500文字に制限する', () => {
      const longPatchFile: FileChange = {
        ...mockFiles[0],
        patch: 'a'.repeat(3000)
      };
      const filesWithLongPatch = [longPatchFile];

      const result = SecurityHelpers.formatFilesForSecurityAnalysis(filesWithLongPatch);
      const parsed = JSON.parse(result);

      expect(parsed.files[0].patch).toHaveLength(2500);
    });

    it('高リスクファイルの判定が正しく動作する', () => {
      const highRiskFiles: FileChange[] = [
        { ...mockFiles[0], filename: 'src/security/auth.ts' },
        { ...mockFiles[0], filename: 'middleware/authentication.js' },
        { ...mockFiles[0], filename: 'config/secrets.env' },
        { ...mockFiles[0], filename: 'database/admin.sql' },
        { ...mockFiles[0], filename: 'api/tokens.ts' }
      ];

      const result = SecurityHelpers.formatFilesForSecurityAnalysis(highRiskFiles);
      const parsed = JSON.parse(result);

      expect(parsed.highRiskFiles).toHaveLength(5);
      expect(parsed.filesByType['high-risk']).toBe(5);
    });

    it('中リスクファイルの判定が正しく動作する', () => {
      const mediumRiskFiles: FileChange[] = [
        { ...mockFiles[0], filename: 'src/user/profile.ts' },
        { ...mockFiles[0], filename: 'services/account.js' },
        { ...mockFiles[0], filename: 'utils/server.ts' },
        { ...mockFiles[0], filename: 'helpers/client.js' }
      ];

      const result = SecurityHelpers.formatFilesForSecurityAnalysis(mediumRiskFiles);
      const parsed = JSON.parse(result);

      expect(parsed.filesByType['medium-risk']).toBe(4);
      expect(parsed.filesByType['high-risk']).toBe(0);
    });

    it('低リスクファイルの判定が正しく動作する', () => {
      const lowRiskFiles: FileChange[] = [
        { ...mockFiles[0], filename: 'src/components/Button.tsx' },
        { ...mockFiles[0], filename: 'styles/main.css' },
        { ...mockFiles[0], filename: 'public/index.html' },
        { ...mockFiles[0], filename: 'docs/README.md' }
      ];

      const result = SecurityHelpers.formatFilesForSecurityAnalysis(lowRiskFiles);
      const parsed = JSON.parse(result);

      expect(parsed.filesByType['low-risk']).toBe(4);
      expect(parsed.filesByType['high-risk']).toBe(0);
      expect(parsed.filesByType['medium-risk']).toBe(0);
    });
  });
});
