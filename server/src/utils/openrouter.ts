const fetch = require("node-fetch");

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

  // Good for translation tasks
  TRANSLATION: "meta-llama/llama-4-maverick:free",

  // For large context tasks
  LARGE_CONTEXT: "anthropic/claude-3-opus",

  // For efficient processing
  EFFICIENT: "openai/gpt-3.5-turbo",
};
