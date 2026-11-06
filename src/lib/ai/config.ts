import "server-only";

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function getAiConfig(): AiConfig | null {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl = (process.env.AI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta/openai/")
    .replace(/\/+$/, "");
  return {
    apiKey,
    baseUrl,
    model: process.env.AI_MODEL?.trim() || "gemini-3.1-flash-lite",
  };
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY?.trim());
}
