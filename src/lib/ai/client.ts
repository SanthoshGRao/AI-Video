import { createOpenAI } from "@ai-sdk/openai";
import { createGroq } from "@ai-sdk/groq";

// Ensure environment variables are loaded
const groqApiKey = process.env.GROQ_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

// Create OpenAI provider (Active — GPT models)
const openai = createOpenAI({
  apiKey: openaiApiKey || "mock-key-for-build",
});

// Create Groq provider (available if needed)
const groq = createGroq({
  apiKey: groqApiKey || "mock-key-for-build",
});

/**
 * AI Provider Configuration
 * 
 * Currently using OpenAI GPT models.
 * Groq models: 'llama3-8b-8192', 'llama3-70b-8192', 'mixtral-8x7b-32768'
 * OpenAI models: 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'
 */

// OpenAI GPT models (active)
export const defaultModel = openai("gpt-4o");
export const fastModel = openai("gpt-4o-mini");

/** Vision model for property photo analysis. */
export const visionModel = openai("gpt-4o");

// To switch back to Groq, comment out the lines above and uncomment:
// export const defaultModel = groq("llama-3.3-70b-versatile");
// export const fastModel = groq("llama-3.1-8b-instant");
// export const visionModel = groq("llama-3.2-90b-vision-preview");
