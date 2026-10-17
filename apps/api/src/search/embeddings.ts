import crypto from 'node:crypto';
import { env } from '../config/env.js';

export class EmbeddingError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = 'EmbeddingError'; }
}

export interface EmbeddingProvider {
  /** Stable identifier. It is part of the Chroma collection name so vectors from different models never mix. */
  readonly id: string;
  /** Whether vectors capture meaning (openai/ollama) or only lexical overlap (hash). */
  readonly kind: 'semantic' | 'lexical';
  embed(texts: string[]): Promise<number[][]>;
}

const safeId = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

async function postJson(url: string, body: unknown, headers: Record<string, string>, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) throw new EmbeddingError(`Embedding request failed with HTTP ${response.status}`, response.status);
    return await response.json();
  } catch (error) {
    if (error instanceof EmbeddingError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new EmbeddingError('Embedding request timed out');
    throw new EmbeddingError('Embedding request failed');
  } finally { clearTimeout(timer); }
}

function assertVectors(vectors: unknown, expected: number): number[][] {
  if (!Array.isArray(vectors) || vectors.length !== expected) throw new EmbeddingError('Embedding provider returned an unexpected number of vectors');
  const dimension = Array.isArray(vectors[0]) ? vectors[0].length : 0;
  for (const vector of vectors) {
    if (!Array.isArray(vector) || vector.length === 0 || vector.length !== dimension || vector.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new EmbeddingError('Embedding provider returned an invalid vector');
  }
  return vectors as number[][];
}

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly kind = 'semantic' as const;
  readonly id: string;
  constructor(private readonly apiKey: string, private readonly baseUrl: string, private readonly model: string, private readonly dimensions: number, private readonly timeoutMs: number) {
    this.id = `openai-${safeId(model)}-${dimensions}`;
  }
  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 64) {
      const batch = texts.slice(i, i + 64);
      // `dimensions` is only accepted by the text-embedding-3 family.
      const body: Record<string, unknown> = { model: this.model, input: batch, encoding_format: 'float', ...(this.model.startsWith('text-embedding-3') ? { dimensions: this.dimensions } : {}) };
      const json = await postJson(`${this.baseUrl.replace(/\/$/, '')}/embeddings`, body, { Authorization: `Bearer ${this.apiKey}` }, this.timeoutMs) as { data?: Array<{ index: number; embedding: number[] }> };
      if (!json.data || json.data.length !== batch.length) throw new EmbeddingError('Embedding provider returned an unexpected response');
      out.push(...assertVectors([...json.data].sort((a, b) => a.index - b.index).map(item => item.embedding), batch.length));
    }
    return out;
  }
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly kind = 'semantic' as const;
  readonly id: string;
  constructor(private readonly baseUrl: string, private readonly model: string, private readonly timeoutMs: number) { this.id = `ollama-${safeId(model)}`; }
  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 16) {
      const batch = texts.slice(i, i + 16);
      const json = await postJson(`${this.baseUrl.replace(/\/$/, '')}/api/embed`, { model: this.model, input: batch }, {}, this.timeoutMs) as { embeddings?: number[][] };
      out.push(...assertVectors(json.embeddings, batch.length));
    }
    return out;
  }
}

const STOPWORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'for', 'with', 'in', 'on', 'to', 'is', 'it', 'this', 'that', 'by', 'at', 'as', 'from', 'be', 'are', 'was', 'your', 'you', 'we', 'our']);
// Small domain thesaurus so the offline fallback behaves sensibly for common shopper wording.
const SYNONYMS: Record<string, string[]> = {
  automatic: ['mechanical', 'selfwinding'], mechanical: ['automatic', 'selfwinding'], quartz: ['battery'], formal: ['dress', 'elegant'], dress: ['formal', 'elegant'],
  elegant: ['dress', 'formal'], sport: ['sports', 'active'], sports: ['sport', 'active'], diver: ['dive', 'diving', 'waterproof'], diving: ['dive', 'diver', 'waterproof'],
  waterproof: ['water', 'resistant', 'dive'], leather: ['strap'], steel: ['stainless', 'metal'], stainless: ['steel', 'metal'], gold: ['golden'], men: ['mens', 'male'], women: ['womens', 'ladies', 'female'],
  ladies: ['women', 'womens'], smart: ['smartwatch', 'digital'], solar: ['lightpowered', 'ecodrive'], minimal: ['minimalist', 'slim', 'simple'], slim: ['thin', 'minimal'], gift: ['present']
};

function tokenize(text: string): string[] {
  const raw = text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) ?? [];
  const tokens: string[] = [];
  for (const token of raw) {
    if (STOPWORDS.has(token) || token.length < 2) continue;
    tokens.push(token.length > 4 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token);
  }
  return tokens;
}

function fnv1a(value: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash >>> 0;
}

/** Deterministic signed feature hashing. Lexical + thesaurus only: good enough for dev, tests and offline fallback, NOT true semantic search. */
export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly kind = 'lexical' as const;
  readonly id: string;
  constructor(private readonly dimensions = 256) { this.id = `hash-v1-${dimensions}`; }
  private vectorFor(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const add = (feature: string, weight: number) => {
      const hash = fnv1a(feature);
      const index = hash % this.dimensions;
      vector[index] = (vector[index] ?? 0) + (fnv1a(feature, 0x9747b28c) & 1 ? weight : -weight);
    };
    const tokens = tokenize(text);
    tokens.forEach((token, position) => {
      add(`u:${token}`, 1);
      for (const synonym of SYNONYMS[token] ?? []) add(`u:${synonym}`, 0.6);
      if (position > 0) add(`b:${tokens[position - 1]}_${token}`, 0.7);
      if (token.length >= 4) for (let i = 0; i <= token.length - 3; i++) add(`c:${token.slice(i, i + 3)}`, 0.15);
    });
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    return norm === 0 ? vector.map((_, i) => (i === 0 ? 1 : 0)) : vector.map(value => value / norm);
  }
  async embed(texts: string[]): Promise<number[][]> { return texts.map(text => this.vectorFor(text)); }
}

let cached: EmbeddingProvider | undefined;
export function getEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;
  if (env.EMBEDDING_PROVIDER === 'openai') cached = new OpenAiEmbeddingProvider(env.OPENAI_API_KEY!, env.OPENAI_BASE_URL, env.OPENAI_EMBEDDING_MODEL, env.OPENAI_EMBEDDING_DIMENSIONS, env.EMBEDDING_TIMEOUT_MS);
  else if (env.EMBEDDING_PROVIDER === 'ollama') cached = new OllamaEmbeddingProvider(env.OLLAMA_URL, env.OLLAMA_EMBEDDING_MODEL, env.EMBEDDING_TIMEOUT_MS);
  else cached = new HashEmbeddingProvider();
  return cached;
}
export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
