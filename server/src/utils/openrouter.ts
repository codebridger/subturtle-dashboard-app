const fetch = require("node-fetch");
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Interface for OpenRouter chat completion request
 */
export interface OpenRouterRequestOptions {
  model: string;
  messages: {
    role: "system" | "user" | "assistant";
    content: string;
  }[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  stop?: string[];
  frequency_penalty?: number;
  presence_penalty?: number;
  response_format?: ResponseFormat;
}

/**
 * Interface for response format options
 */
export interface ResponseFormat {
  type: "text" | "json_object" | "json_schema";
  json_schema?: {
    name?: string;
    strict?: boolean;
    schema: Record<string, any>;
  };
}

/**
 * Interface for OpenRouter chat completion response
 */
export interface OpenRouterResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenRouter API service for AI completions and chat
 */
export class OpenRouterService {
  private apiKey: string;
  private baseUrl: string;
  private httpReferer: string;
  private appTitle: string;

  /**
   * Constructor for the OpenRouter service
   * @param options Optional configuration options
   */
  constructor(options?: {
    apiKey?: string;
    baseUrl?: string;
    httpReferer?: string;
    appTitle?: string;
  }) {
    this.apiKey = options?.apiKey || process.env.OPENROUTER_API_KEY || "";
    this.baseUrl = options?.baseUrl || "https://openrouter.ai/api/v1";
    this.httpReferer =
      options?.httpReferer ||
      process.env.API_BASE_URL ||
      "https://subturtle.app";
    this.appTitle = options?.appTitle || "Subturtle Language Learning";

    if (!this.apiKey) {
      console.warn(
        "OpenRouter API key not provided. Set OPENROUTER_API_KEY in your environment."
      );
    }
  }

  /**
   * Validate that the API key is configured
   * @throws Error if API key is not configured
   */
  private validateApiKey(): void {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key is not configured");
    }
  }

  /**
   * Get headers for OpenRouter API request
   * @returns Headers object for fetch request
   */
  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "HTTP-Referer": this.httpReferer,
      "X-Title": this.appTitle,
    };
  }

  /**
   * Create a chat completion using OpenRouter API
   * @param options Request options for the chat completion
   * @returns Promise with OpenRouter response
   */
  async createChatCompletion(
    options: OpenRouterRequestOptions
  ): Promise<OpenRouterResponse> {
    this.validateApiKey();

    const url = `${this.baseUrl}/chat/completions`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("OpenRouter API error:", errorData);
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      return (await response.json()) as OpenRouterResponse;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("OpenRouter service error:", errorMessage);
      throw new Error(`OpenRouter service error: ${errorMessage}`);
    }
  }

  /**
   * Create a chat completion with structured JSON output using a JSON schema
   * @param options Base request options
   * @param schema JSON schema for the structured output
   * @returns Promise with the structured response of type T
   */
  async createStructuredOutput<T>(
    options: Omit<OpenRouterRequestOptions, "response_format">,
    schema: Record<string, any>,
    schemaName = "structured_output",
    strict = true
  ): Promise<T> {
    // Validate model compatibility - this is a simplified check
    // In a production environment, you would check against a list of supported models
    const supportedModels = [
      "openai/gpt-4o",
      "openai/gpt-4-turbo",
      "fireworks",
      "groq/llama-3",
      "meta-llama/llama-4",
    ];

    const modelPrefix = options.model.split("/")[0].toLowerCase();
    const isSupported = supportedModels.some((model) =>
      options.model.toLowerCase().includes(model.toLowerCase())
    );

    if (!isSupported && !options.model.includes("fireworks")) {
      console.warn(
        `Model ${options.model} may not support structured outputs. Supported models include OpenAI models (GPT-4o and later) and Fireworks models.`
      );
    }

    // Add response_format with the JSON schema
    const completeOptions: OpenRouterRequestOptions = {
      ...options,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: strict,
          schema: schema,
        },
      },
    };

    // Make the API call
    const response = await this.createChatCompletion(completeOptions);

    // Parse the response content - no need to extract JSON as the model should return proper JSON directly
    try {
      // Some models might still return JSON in a string format, so we handle both cases
      const content = response.choices[0].message.content;
      let result: T;

      try {
        // First try parsing as JSON
        result = JSON.parse(content);
      } catch (e) {
        // If direct parsing fails, try extracting JSON from text (fallback)
        result = this.extractJsonFromResponse<T>(content);
      }

      return result;
    } catch (error) {
      console.error("Failed to parse structured output:", error);
      throw new Error("Failed to parse structured output from model response");
    }
  }

  /**
   * Create a chat completion with structured JSON output using a Zod schema
   * This method takes a Zod schema, converts it to JSON schema, and validates the result
   * @param options Base request options
   * @param zodSchema Zod schema for the structured output
   * @returns Promise with the validated structured response of type T
   */
  async createStructuredOutputWithZod<T>(context: {
    options: Omit<OpenRouterRequestOptions, "response_format">;
    zodSchema: z.ZodType<T>;
    schemaName: string;
    strict: boolean;
  }): Promise<T> {
    const { options, zodSchema, schemaName, strict } = context;
    // Convert Zod schema to JSON schema
    const jsonSchema = zodToJsonSchema(zodSchema, {
      target: "openApi3",
      $refStrategy: "none",
    });

    // Get raw result using standard method
    const rawResult = await this.createStructuredOutput<unknown>(
      options,
      jsonSchema,
      schemaName,
      strict
    );

    // Validate with Zod schema
    try {
      return zodSchema.parse(rawResult);
    } catch (error) {
      console.error("Zod validation error:", error);
      throw new Error("Response failed Zod schema validation");
    }
  }

  /**
   * Helper method to extract JSON from LLM response text
   * Handles cases where the model returns JSON in markdown code blocks
   * @param content The content string from the LLM response
   * @returns Parsed JSON object
   */
  extractJsonFromResponse<T>(content: string): T {
    try {
      // Try to extract JSON from markdown code blocks first
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
        content.match(/```([\s\S]*?)```/) || [null, content];

      const jsonString = jsonMatch[1] || content;
      return JSON.parse(jsonString.trim());
    } catch (error) {
      console.error("Failed to parse JSON from LLM response:", error);
      throw new Error("Failed to parse JSON from LLM response");
    }
  }

  /**
   * Get available models from OpenRouter
   * @returns Promise with list of available models
   */
  async getModels(): Promise<any> {
    this.validateApiKey();

    const url = `${this.baseUrl}/models`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("OpenRouter API error:", errorData);
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      return await response.json();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("OpenRouter service error:", errorMessage);
      throw new Error(`OpenRouter service error: ${errorMessage}`);
    }
  }
}

/**
 * Create and export a default instance of the OpenRouter service
 */
export const openRouter = new OpenRouterService();

/**
 * Recommended models for different use cases
 */
export const OPENROUTER_MODELS = {
  // Anthropic models
  CLAUDE_HAIKU: "anthropic/claude-3-haiku",
  CLAUDE_SONNET: "anthropic/claude-3-sonnet",
  CLAUDE_OPUS: "anthropic/claude-3-opus",

  // OpenAI models
  GPT_3_5_TURBO: "openai/gpt-3.5-turbo",
  GPT_4: "openai/gpt-4",
  GPT_4_TURBO: "openai/gpt-4-turbo",
  GPT_4O: "openai/gpt-4o", // Supports structured outputs

  // Meta models
  LLAMA_4_MAV: "meta-llama/llama-4-maverick:free",

  // Good for translation tasks
  TRANSLATION: "google/gemini-2.0-flash-lite-001",

  // Models with structured output support
  STRUCTURED_OUTPUT: "openai/gpt-4o",

  // For large context tasks
  LARGE_CONTEXT: "anthropic/claude-3-opus",

  // For efficient processing
  EFFICIENT: "openai/gpt-3.5-turbo",
};
