import "server-only";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/supabase/config";
import { openAIProvider } from "./provider";
import { geminiProvider } from "./gemini";
export function aiReady() {
  return Boolean(
    supabaseConfig() &&
    (process.env.AI_PROVIDER === "gemini"
      ? process.env.GEMINI_API_KEY && process.env.OPENAI_MODEL?.startsWith("gemini-")
      : process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
export function workerClient() {
  const config = supabaseConfig();
  if (!config || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("AI_NOT_CONFIGURED");
  return createClient(config.url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function productionProvider() {
  if (!aiReady()) throw new Error("AI_NOT_CONFIGURED");
  if (process.env.AI_PROVIDER === "gemini") {
    return geminiProvider(process.env.GEMINI_API_KEY!);
  }
  return openAIProvider(
    new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 0,
      timeout: 90000,
    }),
  );
}
