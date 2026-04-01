import { estimateCostUsd, resolvePricing } from "../../pricing/resolver";
import { LLMChunk, LLMMessage, LLMProvider, LLMRequest, LLMResponse, LLMUsage } from "../types";

interface ClaudeMessageResponse {
  id?: string;
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string | null;
}

interface ClaudeContent {
  type: "text" | "image";
  text?: string;
  source?: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;
  };
}

interface ClaudePayload {
  model: string;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string | ClaudeContent[] }>;
}

export function splitSystemPrompt(messages: LLMMessage[]): { systemPrompt: string; conversation: LLMMessage[] } {
  const systemParts: string[] = [];
  const conversation: LLMMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      const content = message.content;
      if (typeof content === "string" && content.trim()) {
        systemParts.push(content.trim());
      }
      continue;
    }

    conversation.push(message);
  }

  return {
    systemPrompt: systemParts.join("\n\n"),
    conversation,
  };
}

function translateImageToAnthropic(imageUrl: string): ClaudeContent | null {
  // Translate data URI to Anthropic's base64 format
  if (!imageUrl.startsWith("data:")) {
    // For non-data URIs, return null (fallback to first text)
    return null;
  }

  const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    return null;
  }

  const [, mediaType, base64Data] = matches;

  // Map MIME types to Anthropic's supported types
  let claudeMediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/png";
  if (mediaType.includes("jpeg")) claudeMediaType = "image/jpeg";
  else if (mediaType.includes("png")) claudeMediaType = "image/png";
  else if (mediaType.includes("gif")) claudeMediaType = "image/gif";
  else if (mediaType.includes("webp")) claudeMediaType = "image/webp";

  return {
    type: "image",
    source: {
      type: "base64",
      media_type: claudeMediaType,
      data: base64Data,
    },
  };
}

export function toClaudePayload(request: LLMRequest): ClaudePayload {
  const { systemPrompt, conversation } = splitSystemPrompt(request.messages);

  const normalizedMessages: Array<{ role: "user" | "assistant"; content: string | ClaudeContent[] }> = [];

  for (const message of conversation) {
    if (message.role === "user" || message.role === "assistant") {
      const content = message.content;
      
      // Handle string content as-is
      if (typeof content === "string") {
        normalizedMessages.push({
          role: message.role,
          content,
        });
      } else {
        // Handle ContentPart[] content
        const claudeContent: ClaudeContent[] = [];
        
        for (const part of content) {
          if (part.type === "text") {
            claudeContent.push({ type: "text", text: part.text });
          } else if (part.type === "image_url") {
            const translated = translateImageToAnthropic(part.image_url.url);
            if (translated) {
              claudeContent.push(translated);
            }
          }
        }

        normalizedMessages.push({
          role: message.role,
          content: claudeContent.length > 0 ? claudeContent : "Invalid image content",
        });
      }
    }
  }

  const payload: ClaudePayload = {
    model: request.model,
    max_tokens: request.maxTokens ?? 1024,
    temperature: request.temperature,
    top_p: request.topP,
    messages: normalizedMessages,
  };

  if (systemPrompt) {
    payload.system = systemPrompt;
  }

  return payload;
}

export class ClaudeAdapter implements LLMProvider {
  private readonly endpoint = "https://api.anthropic.com/v1/messages";

  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    const payload = toClaudePayload(request);

    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`ClaudeAdapter request failed (${response.status})`);
    }

    const body = (await response.json()) as ClaudeMessageResponse;

    const content = (body.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("");

    const usage: LLMUsage = {
      promptTokens: body.usage?.input_tokens ?? 0,
      completionTokens: body.usage?.output_tokens ?? 0,
      totalTokens: (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0),
    };

    const estimatedCostUsd = await this.estimateCost(usage.promptTokens, usage.completionTokens, request.model);

    return {
      id: body.id ?? crypto.randomUUID(),
      model: body.model ?? request.model,
      usage: {
        ...usage,
        estimatedCostUsd,
      },
      choices: [
        {
          index: 0,
          finishReason: body.stop_reason ?? null,
          message: {
            role: "assistant",
            content,
          } as LLMMessage,
        },
      ],
    };
  }

  public async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const response = await this.complete(request);
    const msgContent = response.choices[0]?.message.content ?? "";
    const content = typeof msgContent === "string" ? msgContent : "";

    yield {
      id: response.id,
      model: response.model,
      index: 0,
      delta: content,
      finishReason: response.choices[0]?.finishReason ?? "stop",
      usage: response.usage,
    };
  }

  public async estimateCost(inputTokens: number, outputTokens: number, model: string): Promise<number> {
    const pricing = resolvePricing("claude", model) ?? resolvePricing("claude", "default");
    return estimateCostUsd(inputTokens, outputTokens, pricing ?? { inputPer1MTokens: 3, outputPer1MTokens: 15 });
  }
}
