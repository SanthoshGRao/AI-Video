import { z } from "zod";

/** Strip markdown fences and parse JSON from LLM text output. */
export function parseJsonFromText<T>(text: string, schema: z.ZodType<T>): T {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  const parsed = JSON.parse(cleaned);
  return schema.parse(parsed);
}
