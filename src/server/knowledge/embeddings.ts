import crypto from "node:crypto";
import { EMBEDDING_DIMENSIONS } from "../db/schema";
import { getSetting } from "../settings/service";
import { getIntegrationSecrets } from "../integrations/service";
import { openAIEmbed } from "../ai/providers/openai";

/**
 * Local embedding: signed feature hashing of word unigrams + bigrams, L2-normalised.
 * Runs offline at zero cost; good lexical-semantic recall for business documents.
 * Switch to OpenAI embeddings (Settings → AI) for deeper semantic matching.
 */
export const LOCAL_EMBEDDING_MODEL = "local-hash-v1";
export const OPENAI_EMBEDDING_MODEL = "openai-text-embedding-3-small-384";

const STOP = new Set("a an and are as at be by for from has have in is it its of on or that the to was were will with this you your we our".split(" "));

function tokens(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 ? t.replace(/(ing|ed|es|s)$/, "") : t));
}

export function localEmbed(text: string): number[] {
  const v = new Float64Array(EMBEDDING_DIMENSIONS);
  const toks = tokens(text);
  const feats: [string, number][] = toks.map((t) => [t, 1]);
  for (let i = 0; i < toks.length - 1; i++) feats.push([`${toks[i]}_${toks[i + 1]}`, 0.5]);
  for (const [f, w] of feats) {
    const h = crypto.createHash("md5").update(f).digest();
    const idx = h.readUInt32LE(0) % EMBEDDING_DIMENSIONS;
    const sign = h[4] & 1 ? 1 : -1;
    v[idx] += sign * w;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return Array.from(v, (x) => x / norm);
}

export async function activeEmbeddingModel() {
  const d = await getSetting("ai.defaults");
  if (d.embeddingProvider === "openai") {
    const s = await getIntegrationSecrets("openai");
    if (s.apiKey) return OPENAI_EMBEDDING_MODEL;
  }
  return LOCAL_EMBEDDING_MODEL;
}

export async function embedTexts(texts: string[]): Promise<{ model: string; vectors: number[][] }> {
  const model = await activeEmbeddingModel();
  if (model === OPENAI_EMBEDDING_MODEL) {
    const s = await getIntegrationSecrets("openai");
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 64) out.push(...(await openAIEmbed(s.apiKey!, texts.slice(i, i + 64), EMBEDDING_DIMENSIONS)));
    return { model, vectors: out };
  }
  return { model, vectors: texts.map(localEmbed) };
}

export function toVectorLiteral(v: number[]) {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : "0")).join(",")}]`;
}
