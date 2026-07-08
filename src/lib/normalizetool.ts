import { calculateScore, getRiskLevel, generateTags, type Tool } from "./scoring";

export function normalizeTool(raw: Partial<Tool>): Tool {
  const score_total = calculateScore(raw);
  const risk_level = getRiskLevel(score_total);
  const tags = generateTags({ ...raw, score_total, risk_level });

  return {
    id: raw.id || crypto.randomUUID(),
    name: raw.name || "Sin nombre",
    slug: raw.slug || raw.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "unknown",
    official_url: raw.official_url || "",
    category: raw.category || "Sin categoría",
    subcategory: raw.subcategory || "",
    description_short: raw.description_short || "",
    description_long: raw.description_long || "",
    free_type: raw.free_type || "No confirmado",
    free_plan_summary: raw.free_plan_summary || "No confirmado",
    requires_signup: raw.requires_signup ?? "no_confirmado",
    requires_credit_card: raw.requires_credit_card ?? "no_confirmado",
    has_watermark: raw.has_watermark ?? "no_confirmado",
    commercial_use: raw.commercial_use ?? "no_confirmado",
    open_source: raw.open_source ?? "no_confirmado",
    local_install: raw.local_install ?? "no_confirmado",
    github_url: raw.github_url || "",
    pricing_url: raw.pricing_url || "",
    docs_url: raw.docs_url || "",
    source_urls: raw.source_urls || [],
    detected_at: raw.detected_at || new Date().toISOString().split("T")[0],
    last_checked_at: raw.last_checked_at || new Date().toISOString().split("T")[0],
    novelty_summary: raw.novelty_summary || "",
    use_cases: raw.use_cases || [],
    limitations: raw.limitations || [],
    alternatives: raw.alternatives || [],
    verdict: raw.verdict || "Sin veredicto",
    score_total,
    score_free_real: raw.score_free_real || 0,
    score_usefulness: raw.score_usefulness || 0,
    score_ease: raw.score_ease || 0,
    score_creator_potential: raw.score_creator_potential || 0,
    score_transparency: raw.score_transparency || 0,
    risk_level,
    tags,
    status: raw.status || "needs_review",
  };
}

export function normalizeAllTools(tools: Partial<Tool>[]): Tool[] {
  return tools.map(normalizeTool);
}
