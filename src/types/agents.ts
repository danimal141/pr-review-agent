import type { LanguageModelV1 } from "@ai-sdk/provider";
import type { Agent } from "@voltagent/core";
import type { VercelAIProvider } from "@voltagent/vercel-ai";

/**
 * エージェント設定の基本型
 */
export interface AgentConfig {
  name: string;
  instructions: string;
  llm: VercelAIProvider;
  model: LanguageModelV1;
}

/**
 * PR Review Agentの型定義
 */
export type PRReviewAgent = Agent<AgentConfig>;

/**
 * 各専門エージェントの型定義
 */
export type CodeAnalysisAgent = PRReviewAgent;
export type SecurityAgent = PRReviewAgent;
export type StyleAgent = PRReviewAgent;
export type SummaryAgent = PRReviewAgent;
export type SupervisorAgent = PRReviewAgent;
