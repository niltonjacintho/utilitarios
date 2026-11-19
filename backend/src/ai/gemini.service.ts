import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  GeminiGenerateJsonOptions,
  GeminiGenerateTextOptions,
  GeminiJsonResult,
  GeminiStatusResponse,
  GeminiTextResult,
  GeminiTranslateOptions,
  GeminiUsageMetadata,
  TranslationTargetType,
} from './gemini.types';

const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_FALLBACK_MODELS = [
  'gemini-3-flash-preview',
  'gemini-flash-lite-latest',
  'gemini-3.8-flash',
];
const DEFAULT_GEMINI_TEMPERATURE = 0.2;
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

const TARGET_SYSTEM_INSTRUCTIONS: Record<
  Exclude<TranslationTargetType, 'custom'>,
  string
> = {
  mindmap:
    'Você é um especialista em mapas mentais. Traduza o texto de entrada em uma estrutura hierárquica clara de nós (nó raiz e subnós organizados por tema), preservando o idioma do usuário.',
  flowchart:
    'Você é um especialista em fluxogramas. Traduza o texto de entrada em etapas, decisões (condições sim/não) e transições lógicas claras para composição de um fluxograma.',
  bpmn:
    'Você é um especialista em modelagem de processos BPMN 2.0. Traduza o texto de entrada identificando participantes/raias, eventos de início/fim, tarefas, gateways e fluxos de sequência.',
  'er-studio':
    'Você é um especialista em modelagem entidade-relacionamento (DER). Traduza o texto de entrada identificando entidades, atributos, chaves primárias/estrangeiras e relacionamentos com cardinalidades.',
};

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly fallbackModels: string[];
  private readonly defaultTemperature: number;
  private readonly requestTimeoutMs: number;
  private client: GoogleGenAI | null = null;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = (this.configService.get<string>('GEMINI_API_KEY') ?? '').trim();
    this.defaultModel =
      (this.configService.get<string>('GEMINI_MODEL') ?? '').trim() ||
      DEFAULT_GEMINI_MODEL;

    const rawFallbacks = (
      this.configService.get<string>('GEMINI_FALLBACK_MODELS') ?? ''
    ).trim();
    this.fallbackModels = rawFallbacks
      ? rawFallbacks
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean)
      : DEFAULT_FALLBACK_MODELS;

    const rawTemp = this.configService.get<string>('GEMINI_TEMPERATURE');
    const parsedTemp = rawTemp !== undefined ? Number(rawTemp) : NaN;
    this.defaultTemperature = Number.isFinite(parsedTemp)
      ? parsedTemp
      : DEFAULT_GEMINI_TEMPERATURE;

    const rawTimeout = Number(
      this.configService.get<string>('GEMINI_TIMEOUT_MS') ??
        DEFAULT_REQUEST_TIMEOUT_MS,
    );
    this.requestTimeoutMs =
      Number.isFinite(rawTimeout) && rawTimeout >= 3000
        ? rawTimeout
        : DEFAULT_REQUEST_TIMEOUT_MS;

    if (this.apiKey) {
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
      this.logger.log(
        `Gemini SDK inicializado (modelo padrão: ${this.defaultModel}, fallbacks: ${this.fallbackModels.join(', ')})`,
      );
    } else {
      this.logger.warn(
        'GEMINI_API_KEY não configurada. Defina a variável no arquivo backend/.env para habilitar chamadas à LLM.',
      );
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getStatus(): GeminiStatusResponse {
    return {
      provider: 'gemini',
      configured: this.isConfigured(),
      defaultModel: this.defaultModel,
      defaultTemperature: this.defaultTemperature,
    };
  }

  async generateText(
    options: GeminiGenerateTextOptions,
  ): Promise<GeminiTextResult> {
    const prompt = options.prompt?.trim();
    if (!prompt) {
      throw new BadRequestException('O campo "prompt" é obrigatório.');
    }

    const temperature =
      options.temperature !== undefined
        ? options.temperature
        : this.defaultTemperature;

    const { response, model } = await this.callWithFallback(
      options.model,
      (client, candidateModel) =>
        client.models.generateContent({
          model: candidateModel,
          contents: prompt,
          config: {
            systemInstruction: options.systemInstruction,
            temperature,
            maxOutputTokens: options.maxOutputTokens,
            abortSignal: AbortSignal.timeout(this.requestTimeoutMs),
          },
        }),
    );

    const text = response.text ?? '';
    return {
      text,
      model,
      usage: this.extractUsage(response.usageMetadata),
    };
  }

  async generateJson<T = unknown>(
    options: GeminiGenerateJsonOptions,
  ): Promise<GeminiJsonResult<T>> {
    const prompt = options.prompt?.trim();
    if (!prompt) {
      throw new BadRequestException('O campo "prompt" é obrigatório.');
    }

    const temperature =
      options.temperature !== undefined
        ? options.temperature
        : this.defaultTemperature;

    const { response, model } = await this.callWithFallback(
      options.model,
      (client, candidateModel) =>
        client.models.generateContent({
          model: candidateModel,
          contents: prompt,
          config: {
            systemInstruction: options.systemInstruction,
            temperature,
            maxOutputTokens: options.maxOutputTokens,
            responseMimeType: 'application/json',
            abortSignal: AbortSignal.timeout(this.requestTimeoutMs),
            ...(options.responseSchema
              ? { responseSchema: options.responseSchema }
              : {}),
          },
        }),
    );

    const rawText = response.text ?? '';
    const data = this.parseJsonResponse<T>(rawText);

    return {
      data,
      rawText,
      model,
      usage: this.extractUsage(response.usageMetadata),
    };
  }

  async translateText(
    options: GeminiTranslateOptions,
  ): Promise<GeminiTextResult | GeminiJsonResult> {
    const text = options.text?.trim();
    if (!text) {
      throw new BadRequestException('O campo "text" é obrigatório.');
    }

    const targetType = options.targetType ?? 'custom';
    const outputFormat = options.outputFormat ?? 'text';

    const systemInstruction = this.resolveTranslationInstruction(
      targetType,
      options.customInstruction,
      outputFormat,
    );

    if (outputFormat === 'json') {
      return this.generateJson({
        prompt: text,
        systemInstruction,
        model: options.model,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
      });
    }

    return this.generateText({
      prompt: text,
      systemInstruction,
      model: options.model,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
    });
  }

  private async callWithFallback<T>(
    requestedModel: string | undefined,
    invoker: (client: GoogleGenAI, model: string) => Promise<T>,
  ): Promise<{ response: T; model: string }> {
    const client = this.ensureClient();
    const primary = requestedModel?.trim() || this.defaultModel;
    const candidates = Array.from(new Set([primary, ...this.fallbackModels]));

    let lastError: unknown;

    for (let i = 0; i < candidates.length; i++) {
      const candidateModel = candidates[i];
      try {
        const response = await invoker(client, candidateModel);
        if (i > 0) {
          this.logger.warn(
            `Modelo "${primary}" indisponível; resposta obtida via fallback "${candidateModel}".`,
          );
        }
        return { response, model: candidateModel };
      } catch (error) {
        lastError = error;
        const shouldRetryWithNext =
          i < candidates.length - 1 && this.isRetriableModelError(error);

        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Falha no modelo "${candidateModel}": ${errMsg.slice(0, 220)}`,
        );

        if (!shouldRetryWithNext) {
          break;
        }
      }
    }

    this.handleGeminiError(lastError);
  }

  private isRetriableModelError(error: unknown): boolean {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
      message.includes('503') ||
      message.includes('unavailable') ||
      message.includes('high demand') ||
      message.includes('429') ||
      message.includes('resource_exhausted') ||
      message.includes('404') ||
      message.includes('not_found') ||
      message.includes('aborted') ||
      message.includes('timeout')
    );
  }

  private resolveTranslationInstruction(
    targetType: TranslationTargetType,
    customInstruction?: string,
    outputFormat: 'text' | 'json' = 'text',
  ): string {
    const parts: string[] = [];

    if (targetType !== 'custom') {
      parts.push(TARGET_SYSTEM_INSTRUCTIONS[targetType]);
    }

    if (customInstruction?.trim()) {
      parts.push(customInstruction.trim());
    }

    if (parts.length === 0) {
      parts.push(
        'Traduza e estruture o texto de entrada de forma clara, objetiva e fiel ao conteúdo fornecido.',
      );
    }

    if (outputFormat === 'json') {
      parts.push('Retorne exclusivamente um objeto JSON válido, sem texto extra.');
    }

    return parts.join('\n\n');
  }

  private ensureClient(): GoogleGenAI {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Integração com a API do Gemini não configurada. Defina GEMINI_API_KEY no arquivo backend/.env.',
      );
    }
    return this.client;
  }

  private extractUsage(
    usage?: GeminiUsageMetadata,
  ): GeminiUsageMetadata | undefined {
    if (!usage) {
      return undefined;
    }
    return {
      promptTokenCount: usage.promptTokenCount,
      candidatesTokenCount: usage.candidatesTokenCount,
      totalTokenCount: usage.totalTokenCount,
    };
  }

  private parseJsonResponse<T>(rawText: string): T {
    const cleaned = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new InternalServerErrorException(
        'A resposta da API do Gemini não pôde ser interpretada como JSON válido.',
      );
    }
  }

  private handleGeminiError(error: unknown): never {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro desconhecido ao chamar Gemini.';
    this.logger.error(`Falha na chamada à API do Gemini: ${message}`);
    throw new InternalServerErrorException(
      `Falha ao comunicar com a API do Gemini: ${message}`,
    );
  }
}
