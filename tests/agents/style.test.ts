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
import { StyleHelpers, createStyleAgent } from '../../src/agents/style';

describe('StyleAgent', () => {
  describe('createStyleAgent', () => {
    it('正常にStyleAgentを作成できる', () => {
      const agent = createStyleAgent();
      expect(agent).toBeDefined();
    });

    it('エージェントの指示に必要なキーワードが含まれている', () => {
      const agent = createStyleAgent();
      expect(vi.mocked(Agent)).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'style-agent',
          instructions: expect.stringContaining('コーディングスタイル')
        })
      );
    });
  });
});

describe('StyleHelpers', () => {
  describe('detectNamingIssues', () => {
    it.skip('スネークケースの変数名を検出する', () => {
      const snakeCasePatch = `@@ -1,3 +1,5 @@
+const user_name = "john";
+let api_key = process.env.API_KEY;
+var total_count = 0;`;

      const issues = StyleHelpers.detectNamingIssues(snakeCasePatch, 'test.ts');

      expect(issues).toHaveLength(3);
      issues.forEach(issue => {
        expect(issue.category).toBe('style');
        expect(issue.severity).toBe('info');
        expect(issue.title).toContain('キャメルケース命名規則推奨');
        expect(issue.suggestion).toContain('キャメルケース');
        expect(issue.suggestedFix).not.toContain('_');
      });
    });

    it('短すぎる変数名を検出する', () => {
      const shortNamePatch = `@@ -1,3 +1,5 @@
+const a = "test";
+let b = 123;
+var c = getData();`;

      const issues = StyleHelpers.detectNamingIssues(shortNamePatch, 'test.ts');

      expect(issues).toHaveLength(3);
      issues.forEach(issue => {
        expect(issue.category).toBe('style');
        expect(issue.severity).toBe('info');
        expect(issue.title).toContain('意味のある変数名推奨');
        expect(issue.suggestion).toContain('具体的な名前');
      });
    });

    it('許可される短い変数名は検出しない', () => {
      const acceptableShortPatch = `@@ -1,3 +1,5 @@
+for (let i = 0; i < 10; i++) {}
+const id = user.id;
+let x = 0, y = 0;`;

      const issues = StyleHelpers.detectNamingIssues(acceptableShortPatch, 'test.ts');

      expect(issues).toHaveLength(0);
    });

    it('const以外での大文字のみ変数名を検出する', () => {
      const upperCasePatch = `@@ -1,3 +1,5 @@
+let MAX_SIZE = 100;
+var API_URL = "https://api.example.com";`;

      const issues = StyleHelpers.detectNamingIssues(upperCasePatch, 'test.ts');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('style');
        expect(issue.severity).toBe('info');
        expect(issue.title).toContain('大文字定数の適切な使用');
        expect(issue.suggestion).toContain('constで定義された定数');
      });
    });

    it('関数名のスネークケースを検出する', () => {
      const functionNamePatch = `@@ -1,3 +1,5 @@
+function get_user_data() {}
+function calculate_total_price() {}`;

      const issues = StyleHelpers.detectNamingIssues(functionNamePatch, 'test.ts');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('style');
        expect(issue.severity).toBe('info');
        expect(issue.title).toContain('関数名キャメルケース推奨');
        expect(issue.suggestedFix).not.toContain('_');
      });
    });

    it('ファイル名のアンダースコア使用を検出する', () => {
      const issues = StyleHelpers.detectNamingIssues('', 'user_profile.ts');

      expect(issues).toHaveLength(1);
      expect(issues[0].category).toBe('style');
      expect(issues[0].severity).toBe('info');
      expect(issues[0].title).toContain('ファイル名ケバブケース推奨');
      expect(issues[0].suggestion).toContain('ケバブケース');
    });

    it('テストファイルのアンダースコアは検出しない', () => {
      const issues = StyleHelpers.detectNamingIssues('', 'user_profile.test.ts');

      expect(issues).toHaveLength(0);
    });

    it('定数とプライベート変数のアンダースコアは検出しない', () => {
      const validPatch = `@@ -1,3 +1,5 @@
+const MAX_RETRIES = 3;
+const _privateVar = "internal";
+let userName = "john";`;

      const issues = StyleHelpers.detectNamingIssues(validPatch, 'test.ts');

      expect(issues).toHaveLength(0);
    });
  });

  describe('detectFormattingIssues', () => {
    it('行末の余分な空白を検出する', () => {
      const trailingSpacePatch = `@@ -1,3 +1,5 @@
+const test = "hello";
+let value = 123;  `;

      const issues = StyleHelpers.detectFormattingIssues(trailingSpacePatch, 'test.ts');

      expect(issues).toHaveLength(1);
      expect(issues[0].category).toBe('style');
      expect(issues[0].severity).toBe('info');
      expect(issues[0].title).toContain('行末の余分な空白');
      expect(issues[0].suggestion).toContain('空白を削除');
    });

    it('インデントの一貫性問題を検出する', () => {
      const inconsistentIndentPatch = `@@ -1,5 +1,10 @@
+function test() {
+ if (condition) {   // 1スペース
+   return true;     // 3スペース
+ }
+}`;

      const issues = StyleHelpers.detectFormattingIssues(inconsistentIndentPatch, 'test.ts');

      expect(issues).toHaveLength(3); // 1スペース、3スペース、1スペースのインデント
      issues.forEach(issue => {
        expect(issue.category).toBe('style');
        expect(issue.severity).toBe('info');
        expect(issue.title).toContain('インデント一貫性');
        expect(issue.suggestion).toContain('一貫したインデント');
      });
    });

    it('長すぎる行を検出する', () => {
      const longLinePatch = `@@ -1,3 +1,5 @@
+const veryLongVariableNameThatExceedsTheRecommendedLineLengthOfOneHundredAndTwentyCharactersAndShouldBeRefactored = "test";`;

      const issues = StyleHelpers.detectFormattingIssues(longLinePatch, 'test.ts');

      expect(issues).toHaveLength(1);
      expect(issues[0].category).toBe('style');
      expect(issues[0].severity).toBe('info');
      expect(issues[0].title).toContain('行の長さ超過');
      expect(issues[0].suggestion).toContain('行を分割');
    });

    it('セミコロンの一貫性問題を検出する', () => {
      const semicolonPatch = `@@ -1,3 +1,5 @@
+const test = "hello"
+let value = 123`;

      const issues = StyleHelpers.detectFormattingIssues(semicolonPatch, 'test.ts');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('style');
        expect(issue.severity).toBe('info');
        expect(issue.title).toContain('セミコロン一貫性');
        expect(issue.suggestedFix).toContain(';');
      });
    });

    it.skip('括弧前のスペース問題を検出する', () => {
      const spacePatch = `@@ -1,3 +1,5 @@
+if(condition) {}
+for(let i = 0; i < 10; i++) {}
+function test(){}`;

      const issues = StyleHelpers.detectFormattingIssues(spacePatch, 'test.ts');

      expect(issues).toHaveLength(3);
      issues.forEach(issue => {
        expect(issue.category).toBe('style');
        expect(issue.severity).toBe('info');
        expect(issue.title).toContain('括弧前のスペース推奨');
        expect(issue.suggestedFix).toContain(' (');
      });
    });

    it('正しいフォーマットは検出しない', () => {
      const cleanPatch = `@@ -1,5 +1,10 @@
+function test() {
+  if (condition) {
+    return true;
+  }
+}`;

      const issues = StyleHelpers.detectFormattingIssues(cleanPatch, 'test.ts');

      expect(issues).toHaveLength(0);
    });
  });

  describe('detectBestPracticeIssues', () => {
    it('varの使用を検出する', () => {
      const varPatch = `@@ -1,3 +1,5 @@
+var userName = "john";
+var count = 0;`;

      const issues = StyleHelpers.detectBestPracticeIssues(varPatch, 'test.ts');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('style');
        expect(issue.severity).toBe('warning');
        expect(issue.title).toContain('var使用非推奨');
        expect(issue.suggestion).toContain('let');
        expect(issue.suggestedFix).toContain('const');
      });
    });

    it('console.logの残存を検出する', () => {
      const consolePatch = `@@ -1,3 +1,5 @@
+console.log("debug info");
+console.error("test error");`;

      const issues = StyleHelpers.detectBestPracticeIssues(consolePatch, 'service.ts');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('style');
        expect(issue.severity).toBe('warning');
        expect(issue.title).toContain('console.logの残存');
        expect(issue.suggestion).toContain('ロガー');
      });
    });

    it('テストファイルのconsole.logは検出しない', () => {
      const testConsolePatch = `@@ -1,3 +1,5 @@
+console.log("test output");`;

      const issues = StyleHelpers.detectBestPracticeIssues(testConsolePatch, 'test.test.ts');

      expect(issues).toHaveLength(0);
    });

    it('TODO/FIXMEコメントを検出する', () => {
      const todoPatch = `@@ -1,3 +1,5 @@
+// TODO: implement this feature
+// FIXME: fix this bug`;

      const issues = StyleHelpers.detectBestPracticeIssues(todoPatch, 'service.ts');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('style');
        expect(issue.severity).toBe('info');
        expect(issue.title).toContain('TODO/FIXMEコメント');
        expect(issue.suggestion).toContain('課題管理システム');
      });
    });

    it('複雑な三項演算子を検出する', () => {
      const complexTernaryPatch = `@@ -1,3 +1,5 @@
+const result = condition1 ? (condition2 ? value1 : value2) : (condition3 ? value3 : value4);`;

      const issues = StyleHelpers.detectBestPracticeIssues(complexTernaryPatch, 'service.ts');

      expect(issues).toHaveLength(1);
      expect(issues[0].category).toBe('style');
      expect(issues[0].severity).toBe('info');
      expect(issues[0].title).toContain('複雑な三項演算子');
      expect(issues[0].suggestion).toContain('if-else文');
    });

    it('深いネスト構造を検出する', () => {
      const deepNestPatch = `@@ -1,3 +1,5 @@
+if (a) { if (b) { if (c) { return true; } } }`;

      const issues = StyleHelpers.detectBestPracticeIssues(deepNestPatch, 'service.ts');

      expect(issues).toHaveLength(1);
      expect(issues[0].category).toBe('style');
      expect(issues[0].severity).toBe('info');
      expect(issues[0].title).toContain('深いネスト構造');
      expect(issues[0].suggestion).toContain('早期リターン');
    });

    it('適切なコードは検出しない', () => {
      const cleanPatch = `@@ -1,5 +1,10 @@
+const userName = "john";
+let count = 0;
+
+function getUserName() {
+  return userName;
+}`;

      const issues = StyleHelpers.detectBestPracticeIssues(cleanPatch, 'service.ts');

      expect(issues).toHaveLength(0);
    });
  });

  describe('detectTypeScriptIssues', () => {
    it('any型の使用を検出する', () => {
      const anyTypePatch = `@@ -1,3 +1,5 @@
+const data: any = getData();
+function process(item: any): any {}`;

      const issues = StyleHelpers.detectTypeScriptIssues(anyTypePatch, 'service.ts');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('style');
        expect(issue.severity).toBe('warning');
        expect(issue.title).toContain('any型の使用');
        expect(issue.suggestion).toContain('具体的な型定義');
      });
    });

    it('型アサーションの使用を検出する', () => {
      const assertionPatch = `@@ -1,3 +1,5 @@
+const value = data as string;
+const element = document.getElementById('test') as HTMLElement;`;

      const issues = StyleHelpers.detectTypeScriptIssues(assertionPatch, 'service.ts');

      expect(issues).toHaveLength(2);
      issues.forEach(issue => {
        expect(issue.category).toBe('style');
        expect(issue.severity).toBe('info');
        expect(issue.title).toContain('型アサーションの使用');
        expect(issue.suggestion).toContain('型ガード');
      });
    });

    it('const assertionは検出しない', () => {
      const constAssertionPatch = `@@ -1,3 +1,5 @@
+const config = { name: 'test' } as const;`;

      const issues = StyleHelpers.detectTypeScriptIssues(constAssertionPatch, 'service.ts');

      expect(issues).toHaveLength(0);
    });

    it('type alias vs interface提案を検出する', () => {
      const typeAliasPatch = `@@ -1,3 +1,5 @@
+type User = {
+  name: string;
+  age: number;
+};`;

      const issues = StyleHelpers.detectTypeScriptIssues(typeAliasPatch, 'types.ts');

      expect(issues).toHaveLength(1);
      expect(issues[0].category).toBe('style');
      expect(issues[0].severity).toBe('info');
      expect(issues[0].title).toContain('interface vs type alias');
      expect(issues[0].suggestion).toContain('interface');
    });

    it('非TypeScriptファイルは検査しない', () => {
      const anyTypePatch = `@@ -1,3 +1,5 @@
+const data: any = getData();`;

      const issues = StyleHelpers.detectTypeScriptIssues(anyTypePatch, 'service.js');

      expect(issues).toHaveLength(0);
    });

    it('union型などの適切な型定義は検出しない', () => {
      const goodTypePatch = `@@ -1,5 +1,10 @@
+interface User {
+  name: string;
+  age: number;
+}
+const users: User[] = [];`;

      const issues = StyleHelpers.detectTypeScriptIssues(goodTypePatch, 'service.ts');

      expect(issues).toHaveLength(0);
    });
  });

  describe('formatFilesForStyleAnalysis', () => {
    const mockFiles: FileChange[] = [
      {
        sha: 'abc123',
        filename: 'src/components/Button.tsx',
        status: 'modified',
        additions: 50,
        deletions: 10,
        changes: 60,
        blobUrl: 'https://github.com/test/test/blob/abc123/src/components/Button.tsx',
        patch: 'const user_name = "john";'
      },
      {
        sha: 'def456',
        filename: 'src/utils/helper.js',
        status: 'added',
        additions: 20,
        deletions: 0,
        changes: 20,
        blobUrl: 'https://github.com/test/test/blob/def456/src/utils/helper.js',
        patch: 'function helper() { return "test"; }'
      },
      {
        sha: 'ghi789',
        filename: 'styles/main.css',
        status: 'modified',
        additions: 5,
        deletions: 2,
        changes: 7,
        blobUrl: 'https://github.com/test/test/blob/ghi789/styles/main.css',
        patch: '.button { color: red; }'
      }
    ];

    it('スタイル分析用形式に正しく変換する', () => {
      const result = StyleHelpers.formatFilesForStyleAnalysis(mockFiles);
      const parsed = JSON.parse(result);

      expect(parsed.totalFiles).toBe(3);
      expect(parsed.filesByExtension).toEqual({
        'tsx': 1,
        'js': 1,
        'css': 1
      });
      expect(parsed.codeFiles).toHaveLength(2); // tsx, js
      expect(parsed.files).toHaveLength(3);
    });

    it('各ファイルの情報が正しく設定される', () => {
      const result = StyleHelpers.formatFilesForStyleAnalysis(mockFiles);
      const parsed = JSON.parse(result);

      expect(parsed.files[0].filename).toBe('src/components/Button.tsx');
      expect(parsed.files[0].fileType).toBe('TypeScript React');
      expect(parsed.files[1].fileType).toBe('JavaScript');
      expect(parsed.files[2].fileType).toBe('Other');
    });

    it('パッチを2000文字に制限する', () => {
      const longPatchFile: FileChange = {
        ...mockFiles[0],
        patch: 'a'.repeat(3000)
      };
      const filesWithLongPatch = [longPatchFile];

      const result = StyleHelpers.formatFilesForStyleAnalysis(filesWithLongPatch);
      const parsed = JSON.parse(result);

      expect(parsed.files[0].patch).toHaveLength(2000);
    });

    it('コードファイルのフィルタリングが正しく動作する', () => {
      const mixedFiles: FileChange[] = [
        { ...mockFiles[0], filename: 'code.ts' },
        { ...mockFiles[0], filename: 'code.tsx' },
        { ...mockFiles[0], filename: 'code.js' },
        { ...mockFiles[0], filename: 'code.jsx' },
        { ...mockFiles[0], filename: 'code.vue' },
        { ...mockFiles[0], filename: 'README.md' },
        { ...mockFiles[0], filename: 'config.json' }
      ];

      const result = StyleHelpers.formatFilesForStyleAnalysis(mixedFiles);
      const parsed = JSON.parse(result);

      expect(parsed.codeFiles).toHaveLength(5); // ts, tsx, js, jsx, vue
    });

    it('ファイルタイプマッピングが正しく動作する', () => {
      const typedFiles: FileChange[] = [
        { ...mockFiles[0], filename: 'test.ts' },
        { ...mockFiles[0], filename: 'test.tsx' },
        { ...mockFiles[0], filename: 'test.js' },
        { ...mockFiles[0], filename: 'test.jsx' },
        { ...mockFiles[0], filename: 'test.vue' },
        { ...mockFiles[0], filename: 'test.py' },
        { ...mockFiles[0], filename: 'test.java' },
        { ...mockFiles[0], filename: 'test.json' },
        { ...mockFiles[0], filename: 'test.md' },
        { ...mockFiles[0], filename: 'test.yml' },
        { ...mockFiles[0], filename: 'unknown' }
      ];

      const result = StyleHelpers.formatFilesForStyleAnalysis(typedFiles);
      const parsed = JSON.parse(result);

      const expectedTypes = [
        'TypeScript', 'TypeScript React', 'JavaScript', 'JavaScript React',
        'Vue', 'Python', 'Java', 'JSON', 'Markdown', 'YAML', 'Other'
      ];

      parsed.files.forEach((file: any, index: number) => {
        expect(file.fileType).toBe(expectedTypes[index]);
      });
    });
  });

  describe('toCamelCase (private method functionality)', () => {
    it('スネークケースをキャメルケースに変換する', () => {
      const snakeCasePatch = `@@ -1,3 +1,5 @@
+const user_name = "john";
+let user_id = 123;`;

      const issues = StyleHelpers.detectNamingIssues(snakeCasePatch, 'test.ts');

      expect(issues[0].suggestedFix).toContain('userName');
      expect(issues[1].suggestedFix).toContain('userId');
    });

    it('複数のアンダースコアを正しく変換する', () => {
      const multiUnderscorePatch = `@@ -1,3 +1,5 @@
+const user_profile_data = {};`;

      const issues = StyleHelpers.detectNamingIssues(multiUnderscorePatch, 'test.ts');

      expect(issues[0].suggestedFix).toContain('userProfileData');
    });
  });
});
