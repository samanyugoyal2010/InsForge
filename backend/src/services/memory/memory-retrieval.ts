import { ERROR_CODES } from '@insforge/shared-schemas';
import { AppError } from '@/utils/errors.js';

export const DEFAULT_EMBED_MODEL = 'openai/text-embedding-3-small';
export const DEFAULT_EMBED_DIMENSIONS = 1536;
// Shipped default from in-repo eval (text-embedding-3-small, limit=5): see
// ./eval/results/baseline-limit5.json and ./eval/README.md. Override via MEMORY_RECALL_THRESHOLD.
export const DEFAULT_RECALL_THRESHOLD = 0.35;

export interface MemoryRetrievalConfig {
  embedModel: string;
  embedDimensions: number;
  defaultRecallThreshold: number;
}

function envString(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key]?.trim();
  return raw ? raw : undefined;
}

export function resolveEmbedModel(env: NodeJS.ProcessEnv = process.env): string {
  return envString(env, 'MEMORY_EMBED_MODEL') ?? DEFAULT_EMBED_MODEL;
}

export function resolveEmbedDimensions(env: NodeJS.ProcessEnv = process.env): number {
  const raw = envString(env, 'MEMORY_EMBED_DIMENSIONS');
  if (!raw) {
    return DEFAULT_EMBED_DIMENSIONS;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError(
      `MEMORY_EMBED_DIMENSIONS must be a positive integer, got "${raw}"`,
      500,
      ERROR_CODES.INTERNAL_ERROR
    );
  }
  return n;
}

export function resolveRecallThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const raw = envString(env, 'MEMORY_RECALL_THRESHOLD');
  if (!raw) {
    return DEFAULT_RECALL_THRESHOLD;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new AppError(
      `MEMORY_RECALL_THRESHOLD must be a number between 0 and 1, got "${raw}"`,
      500,
      ERROR_CODES.INTERNAL_ERROR
    );
  }
  return n;
}

/** Read retrieval knobs from env. Call per request so eval sweeps do not need a source edit. */
export function getMemoryRetrievalConfig(
  env: NodeJS.ProcessEnv = process.env
): MemoryRetrievalConfig {
  return {
    embedModel: resolveEmbedModel(env),
    embedDimensions: resolveEmbedDimensions(env),
    defaultRecallThreshold: resolveRecallThreshold(env),
  };
}
