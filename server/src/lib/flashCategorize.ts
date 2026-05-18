import { GoogleGenAI, Type, ThinkingLevel, type Schema } from "@google/genai";
import db from "../db/connection.js";

interface CategoryRow {
  id: string;
  name: string;
}

interface SubcategoryRow {
  id: string;
  category_id: string;
  name: string;
}

export interface FlashSuggestion {
  category_id: string;
  subcategory_id: string;
  confidence: "low" | "medium" | "high";
  /**
   * Flash's guess at the canonical brand name (lowercase, brand-only —
   * "billa", "spar"). Used to auto-alias POS variants like "billa dankt"
   * onto the household's existing memory row. Null when Flash declines
   * (returns empty / same as input) — caller must not invent aliases.
   */
  canonical_merchant: string | null;
}

const MODEL = "gemini-3-flash-preview";
const REQUEST_TIMEOUT_MS = 8_000;

let ai: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

export function isFlashEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function buildTaxonomy(): {
  categories: CategoryRow[];
  subsByCategory: Map<string, SubcategoryRow[]>;
  formatted: string;
} {
  const categories = db
    .prepare(`SELECT id, name FROM categories ORDER BY sort_order`)
    .all() as CategoryRow[];
  const subs = db
    .prepare(`SELECT id, category_id, name FROM subcategories ORDER BY sort_order`)
    .all() as SubcategoryRow[];

  const subsByCategory = new Map<string, SubcategoryRow[]>();
  for (const s of subs) {
    const arr = subsByCategory.get(s.category_id) ?? [];
    arr.push(s);
    subsByCategory.set(s.category_id, arr);
  }

  const lines = categories.map((c) => {
    const list = (subsByCategory.get(c.id) ?? []).map((s) => s.name).join(", ");
    return `- ${c.name}: ${list}`;
  });

  return { categories, subsByCategory, formatted: lines.join("\n") };
}

const SYSTEM_PROMPT = `You categorize Apple Pay transactions for an Austrian household expense tracker. Transactions originate from Vienna, Austria.

Pick one (category, subcategory) pair from the taxonomy below. Return confidence as low / medium / high based on how confidently you can map the merchant from your knowledge. If you've never heard of the merchant, say low.

Also return canonical_merchant: a single lowercase brand name extracted from the input, with terminal IDs, POS politeness words (dankt, danke, bedankt sich), city names, and other receipt noise removed. Examples: "Billa Dankt 0000388" → "billa", "BIPA DANKT WIEN" → "bipa", "Der Mann 12 1010 Wien" → "der mann", "Starbucks Coffee 1234" → "starbucks". If the input is already the brand name unchanged, return it lowercased.`;

/**
 * Ask Gemini Flash to categorize an Apple Pay transaction. Returns null when:
 *  - GEMINI_API_KEY is unset (feature disabled)
 *  - the model returns confidence "low"
 *  - the model returns an unknown category or subcategory/category mismatch
 *  - the request times out or throws
 *
 * Never throws. Logs one line per call (success or failure).
 */
export async function categorizeWithFlash(
  merchant: string,
  amountCents: number,
): Promise<FlashSuggestion | null> {
  const client = getClient();
  if (!client) return null;

  const startedAt = Date.now();
  const { categories, subsByCategory, formatted } = buildTaxonomy();

  const categoryNames = categories.map((c) => c.name);
  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      confidence: {
        type: Type.STRING,
        format: "enum",
        enum: ["low", "medium", "high"],
      },
      category: {
        type: Type.STRING,
        format: "enum",
        enum: categoryNames,
      },
      subcategory: { type: Type.STRING },
      canonical_merchant: { type: Type.STRING },
    },
    required: ["confidence", "canonical_merchant"],
    propertyOrdering: ["confidence", "canonical_merchant", "category", "subcategory"],
  };

  const userPrompt = `Taxonomy:\n${formatted}\n\nMerchant: ${merchant}\nAmount: €${(amountCents / 100).toFixed(2)}`;

  let raw: string | null = null;
  try {
    const response = await Promise.race([
      client.models.generateContent({
        model: MODEL,
        contents: [
          { role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }] },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("flash timeout")), REQUEST_TIMEOUT_MS),
      ),
    ]);
    raw = response.text ?? null;
  } catch (err) {
    const ms = Date.now() - startedAt;
    console.warn(
      `[flash] failed merchant="${merchant}" reason="${(err as Error).message}" latency=${ms}ms`,
    );
    return null;
  }

  if (!raw) {
    console.warn(`[flash] empty response merchant="${merchant}"`);
    return null;
  }

  let parsed: {
    confidence?: string;
    category?: string;
    subcategory?: string;
    canonical_merchant?: string;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`[flash] non-JSON response merchant="${merchant}" raw=${raw.slice(0, 200)}`);
    return null;
  }

  const confidence = parsed.confidence;
  if (confidence !== "low" && confidence !== "medium" && confidence !== "high") {
    console.warn(`[flash] bad confidence merchant="${merchant}" raw=${raw.slice(0, 200)}`);
    return null;
  }

  const ms = Date.now() - startedAt;

  // Normalize canonical_merchant: empty string or same-as-input → null. We
  // never propagate ambiguous canonicalization downstream (alias auto-creation
  // refuses to alias a merchant to itself).
  let canonicalMerchant: string | null = null;
  if (typeof parsed.canonical_merchant === "string") {
    const trimmed = parsed.canonical_merchant.trim().toLowerCase();
    if (trimmed && trimmed !== merchant.toLowerCase().trim()) {
      canonicalMerchant = trimmed;
    }
  }

  if (confidence === "low") {
    console.log(
      `[flash] merchant="${merchant}" → confidence=low (suppressed) canonical="${canonicalMerchant ?? ""}" latency=${ms}ms`,
    );
    return null;
  }

  const category = categories.find((c) => c.name === parsed.category);
  if (!category) {
    console.warn(
      `[flash] unknown category="${parsed.category}" merchant="${merchant}" latency=${ms}ms`,
    );
    return null;
  }
  const subs = subsByCategory.get(category.id) ?? [];
  const subcategory = subs.find((s) => s.name === parsed.subcategory);
  if (!subcategory) {
    console.warn(
      `[flash] subcategory="${parsed.subcategory}" not in category="${category.name}" merchant="${merchant}" latency=${ms}ms`,
    );
    return null;
  }

  console.log(
    `[flash] merchant="${merchant}" → ${category.name}/${subcategory.name} canonical="${canonicalMerchant ?? ""}" confidence=${confidence} latency=${ms}ms`,
  );
  return {
    category_id: category.id,
    subcategory_id: subcategory.id,
    confidence,
    canonical_merchant: canonicalMerchant,
  };
}
