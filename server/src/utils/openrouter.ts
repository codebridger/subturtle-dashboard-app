const fetch = require("node-fetch");
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Interface for OpenRouter chat completion request
 */
export interface OpenRouterRequestOptions {
  model?: string;
  models?: string[];
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
  provider?: { [key: string]: any };
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
        throw new Error(JSON.stringify(errorData.error));
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(JSON.stringify(data.error));
      }

      return data as OpenRouterResponse;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("OpenRouter service error:", errorMessage);
      throw error;
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
      console.error("Failed to parse structured output");
      throw error;
    }
  }

  /**
   * Create a chat completion with structured JSON output using a Zod schema.
   *
   * This converts the Zod schema to a JSON schema for the request, then
   * validates the model's reply against the same Zod schema. Free/flash models
   * intermittently fail structured output (truncated or malformed JSON, missing
   * fields), so on a parse/validation/transport failure we retry a few times
   * before giving up — each retry nudges the temperature up so a deterministic
   * model doesn't simply repeat the same broken completion.
   *
   * @param context.retries Extra attempts after the first (default 2 -> up to 3
   *   total). Set to 0 to disable retrying.
   * @returns Promise with the validated structured response of type T
   */
  async createStructuredOutputWithZod<T>(context: {
    options: Omit<OpenRouterRequestOptions, "response_format">;
    zodSchema: z.ZodType<T>;
    schemaName: string;
    strict: boolean;
    retries?: number;
  }): Promise<T> {
    const { options, zodSchema, schemaName, strict, retries = 2 } = context;
    // Convert Zod schema to JSON schema
    const jsonSchema = zodToJsonSchema(zodSchema, {
      target: "openApi3",
      $refStrategy: "none",
    });

    const totalAttempts = Math.max(1, retries + 1);
    let lastError: unknown;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      // On retries, raise the temperature a little so a temperature-0 model
      // returns a fresh sample instead of repeating the same malformed JSON.
      const attemptOptions =
        attempt === 1
          ? options
          : {
              ...options,
              temperature: Math.min(
                1,
                (options.temperature ?? 0) + 0.3 * (attempt - 1)
              ),
            };

      try {
        // Get raw result using standard method
        const rawResult = await this.createStructuredOutput<unknown>(
          attemptOptions,
          jsonSchema,
          schemaName,
          strict
        );

        // Validate against the Zod schema so malformed structured output is
        // caught here (and retried) rather than slipping through to callers.
        const parsed = zodSchema.safeParse(rawResult);
        if (parsed.success) {
          return parsed.data;
        }

        lastError = new Error(
          `Structured output failed schema validation: ${parsed.error.message}`
        );
      } catch (error: unknown) {
        lastError = error;
      }

      if (attempt < totalAttempts) {
        const message =
          lastError instanceof Error ? lastError.message : String(lastError);
        console.warn(
          `Structured output attempt ${attempt}/${totalAttempts} failed, retrying: ${message}`
        );
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
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
