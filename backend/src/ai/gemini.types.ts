export type TranslationTargetType =
  | 'mindmap'
  | 'flowchart'
  | 'bpmn'
  | 'er-studio'
  | 'custom';

export type TranslationOutputFormat = 'text' | 'json';

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiGenerateTextOptions {
  prompt: string;
  systemInstruction?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiGenerateJsonOptions extends GeminiGenerateTextOptions {
  responseSchema?: Record<string, unknown>;
}

export interface GeminiTranslateOptions {
  text: string;
  targetType?: TranslationTargetType;
  outputFormat?: TranslationOutputFormat;
  customInstruction?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiTextResult {
  text: string;
  model: string;
  usage?: GeminiUsageMetadata;
}

export interface GeminiJsonResult<T = unknown> {
  data: T;
  rawText: string;
  model: string;
  usage?: GeminiUsageMetadata;
}

export interface GeminiStatusResponse {
  provider: 'gemini';
  configured: boolean;
  defaultModel: string;
  defaultTemperature: number;
}
