import "server-only";

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function getAiConfig(): AiConfig | null {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.AI_API_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, ""),
    model: process.env.AI_MODEL?.trim() || "gpt-4o-mini",
  };
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY?.trim());
}
