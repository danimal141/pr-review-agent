import { Octokit } from "@octokit/rest";
import { z } from "zod";
import type { FileChange, GitHubPREvent, PRInfo } from "../types/github.js";

/**
 * GitHub API操作ツール
 *
 * 機能:
 * - PR情報の取得
 * - ファイル差分の取得
 * - PRコメントの投稿
 * - ファイル内容の取得
 */
export class GitHubAPITool {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({
      auth: token,
    });
  }

  /**
   * PR情報を取得
   */
  async getPRInfo(owner: string, repo: string, prNumber: number): Promise<PRInfo> {
    try {
      const { data: pr } = await this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      const files = await this.getPRFiles(owner, repo, prNumber);

      return {
        owner,
        repo,
        number: prNumber,
        title: pr.title,
        body: pr.body,
        headSha: pr.head.sha,
        baseSha: pr.base.sha,
        files,
      };
    } catch (error) {
      throw new Error(`PR情報の取得に失敗: ${error}`);
    }
  }

  /**
   * PRの変更ファイル一覧を取得
   */
  async getPRFiles(owner: string, repo: string, prNumber: number): Promise<FileChange[]> {
    try {
      const { data: files } = await this.octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100, // 最大100ファイル
      });

      return files.map((file) => ({
        filename: file.filename,
        status: this.mapFileStatus(file.status),
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
        sha: file.sha,
        blobUrl: file.blob_url,
      }));
    } catch (error) {
      throw new Error(`PRファイル情報の取得に失敗: ${error}`);
    }
  }

  /**
   * ファイルの内容を取得
   */
  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if ("content" in data && data.content) {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }
      throw new Error("ファイル内容が見つかりません");
    } catch (error) {
      throw new Error(`ファイル内容の取得に失敗: ${error}`);
    }
  }

  /**
   * PRにレビューコメントを投稿
   */
  async createReviewComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    commitId?: string,
    path?: string,
    line?: number,
    side: "LEFT" | "RIGHT" = "RIGHT"
  ): Promise<void> {
    try {
      if (path && line && commitId) {
        // 特定の行にコメント（commit_idが必要）
        await this.octokit.rest.pulls.createReviewComment({
          owner,
          repo,
          pull_number: prNumber,
          body,
          commit_id: commitId,
          path,
          line,
          side,
        });
      } else {
        // 一般的なコメント
        await this.octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body,
        });
      }
    } catch (error) {
      throw new Error(`コメントの投稿に失敗: ${error}`);
    }
  }

  /**
   * PRにレビューを投稿（複数コメントを一度に）
   */
  async createReview(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT" = "COMMENT",
    comments: Array<{
      path: string;
      line: number;
      body: string;
      side?: "LEFT" | "RIGHT";
    }> = []
  ): Promise<void> {
    try {
      await this.octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        body,
        event,
        comments: comments.map((comment) => ({
          path: comment.path,
          line: comment.line,
          body: comment.body,
          side: comment.side || "RIGHT",
        })),
      });
    } catch (error) {
      throw new Error(`レビューの投稿に失敗: ${error}`);
    }
  }

  /**
   * PR差分を取得
   */
  async getPRDiff(owner: string, repo: string, prNumber: number): Promise<string> {
    try {
      const response = await this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: {
          format: "diff",
        },
      });

      return response.data as unknown as string;
    } catch (error) {
      throw new Error(`PR差分の取得に失敗: ${error}`);
    }
  }

  /**
   * リポジトリの言語統計を取得
   */
  async getRepoLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    try {
      const { data } = await this.octokit.rest.repos.listLanguages({
        owner,
        repo,
      });
      return data;
    } catch (error) {
      throw new Error(`リポジトリ言語統計の取得に失敗: ${error}`);
    }
  }

  /**
   * PRの既存レビューコメントを取得
   */
  async getExistingReviewComments(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<
    Array<{
      id: number;
      body: string;
      path: string;
      line: number;
      user: string;
    }>
  > {
    try {
      const { data: comments } = await this.octokit.rest.pulls.listReviewComments({
        owner,
        repo,
        pull_number: prNumber,
      });

      return comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        path: comment.path,
        line: comment.line || 0,
        user: comment.user?.login || "unknown",
      }));
    } catch (error) {
      throw new Error(`既存レビューコメントの取得に失敗: ${error}`);
    }
  }

  /**
   * ファイルステータスをマッピング
   */
  private mapFileStatus(status: string): "added" | "modified" | "removed" | "renamed" {
    switch (status) {
      case "added":
        return "added";
      case "modified":
        return "modified";
      case "removed":
        return "removed";
      case "renamed":
        return "renamed";
      default:
        return "modified";
    }
  }
}

/**
 * GitHubAPIToolのファクトリー関数
 */
export function createGitHubAPITool(token?: string): GitHubAPITool {
  const githubToken = token || process.env.GITHUB_TOKEN;

  if (!githubToken) {
    throw new Error("GITHUB_TOKEN環境変数が設定されていません");
  }

  return new GitHubAPITool(githubToken);
}

/**
 * GitHub Webhook Event パーサー
 */
export class GitHubEventParser {
  /**
   * GitHub Webhookペイロードを解析してPRイベントを抽出
   */
  static parsePREvent(payload: any): GitHubPREvent {
    try {
      return {
        action: payload.action,
        number: payload.number,
        pullRequest: {
          id: payload.pull_request.id,
          number: payload.pull_request.number,
          title: payload.pull_request.title,
          body: payload.pull_request.body,
          head: {
            sha: payload.pull_request.head.sha,
            ref: payload.pull_request.head.ref,
          },
          base: {
            sha: payload.pull_request.base.sha,
            ref: payload.pull_request.base.ref,
          },
          changedFiles: payload.pull_request.changed_files,
          additions: payload.pull_request.additions,
          deletions: payload.pull_request.deletions,
        },
        repository: {
          id: payload.repository.id,
          name: payload.repository.name,
          fullName: payload.repository.full_name,
          owner: {
            login: payload.repository.owner.login,
          },
        },
      };
    } catch (error) {
      throw new Error(`PRイベントの解析に失敗: ${error}`);
    }
  }
}
