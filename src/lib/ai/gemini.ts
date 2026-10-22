import "server-only";
import { z } from "zod";
import { analysisSchema, translationSchema } from "./schema";
import {
  GenerationError,
  instructions,
  requestData,
  type Provider,
} from "./provider";

/**
 * Server-only Gemini Developer API adapter for existing SermonBridge provider.
 * DB schema, human review, RLS and per-job cost reservations remain unchanged.
 */
export function geminiProvider(apiKey: string): Provider {
  if (!apiKey) throw new Error("GEMINI_NOT_CONFIGURED");
  return async (plan, maxOutput) => {
    // Never accept a URL or host from user input.
    if (!/^gemini-[a-z0-9][a-z0-9.-]{0,79}$/i.test(plan.model)) {
      throw new GenerationError("INVALID_MODEL");
    }
    const schema = z.toJSONSchema(
      plan.kind === "analysis" ? analysisSchema : translationSchema,
    );
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(plan.model) + ":generateContent";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents: [
            { role: "user", parts: [{ text: JSON.stringify(requestData(plan)) }] },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: schema,
            maxOutputTokens: maxOutput,
          },
        }),
        cache: "no-store",
      });
    } catch {
      // Do not leak network errors, keys or request body.
      throw new GenerationError("PROVIDER_NETWORK_ERROR");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      // Avoid echoing provider error text, which may contain request details.
      throw new GenerationError(
        response.status === 429 ? "PROVIDER_RATE_LIMIT" : "PROVIDER_HTTP_ERROR",
      );
    }
    let result: {
      responseId?: string;
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
        totalTokenCount?: number;
      };
    };
    try {
      result = await response.json();
    } catch {
      throw new GenerationError("INVALID_PROVIDER_RESPONSE");
    }
    const meta = result.usageMetadata;
    const usage = meta && Number.isFinite(meta.promptTokenCount) &&
      Number.isFinite(meta.totalTokenCount)
      ? {
          input_tokens: meta.promptTokenCount as number,
          // Output tokens can include thinking tokens; account conservatively.
          output_tokens: Math.max(0, (meta.totalTokenCount as number) -
            (meta.promptTokenCount as number)),
        }
      : null;
    const candidate = result.candidates?.[0];
    if (!candidate || candidate.finishReason !== "STOP") {
      throw new GenerationError("INCOMPLETE_RESPONSE", usage);
    }
    if (!usage) throw new GenerationError("MISSING_USAGE");
    const text = candidate.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    try {
      const value = JSON.parse(text);
      // Structural validation and existing grounding checks are performed
      // again by the application's generation pipeline.
      return {
        value,
        usage,
        response_id: result.responseId ?? "gemini-no-response-id",
      };
    } catch {
      throw new GenerationError("INVALID_JSON", usage);
    }
  };
}
