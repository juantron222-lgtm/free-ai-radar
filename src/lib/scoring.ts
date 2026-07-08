export interface Tool {
  id: string;
  name: string;
  slug: string;
  official_url: string;
  category: string;
  subcategory: string;
  description_short: string;
  description_long: string;
  free_type: string;
  free_plan_summary: string;
  requires_signup: boolean | "no_confirmado";
  requires_credit_card: boolean | "no_confirmado";
  has_watermark: boolean | "no_confirmado";
  commercial_use: boolean | "no_confirmado" | "parcial";
  open_source: boolean | "no_confirmado";
  local_install: boolean | "no_confirmado";
  github_url: string;
  pricing_url: string;
  docs_url: string;
  source_urls: string[];
  detected_at: string;
  last_checked_at: string;
  novelty_summary: string;
  use_cases: string[];
  limitations: string[];
  alternatives: string[];
  verdict: string;
  score_total: number;
  score_free_real: number;
  score_usefulness: number;
  score_ease: number;
  score_creator_potential: number;
  score_transparency: number;
  risk_level: "bajo" | "medio" | "alto";
  tags: string[];
  status: "active" | "needs_review" | "outdated" | "rejected" | "duplicate";
}

export function calculateScore(tool: Partial<Tool>): number {
  const freeReal = (tool.score_free_real || 0) * 2.5;
  const usefulness = (tool.score_usefulness || 0) * 2.5;
  const ease = (tool.score_ease || 0) * 1.5;
  const transparency = (tool.score_transparency || 0) * 1.5;
  const creator = (tool.score_creator_potential || 0) * 1.0;
  const novelty = 10;

  let score = freeReal + usefulness + ease + transparency + creator + novelty;

  if (tool.requires_credit_card === true) score -= 15;
  if (tool.free_type === "Trial útil" || tool.free_type === "Demo limitada") score -= 10;
  if (tool.has_watermark === true) score -= 10;
  if (tool.free_plan_summary && tool.free_plan_summary.toLowerCase().includes("confuso")) score -= 10;
  if (tool.score_transparency && tool.score_transparency < 4) score -= 15;
  if (tool.free_type === "Humo probable") score -= 20;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getRiskLevel(score: number): "bajo" | "medio" | "alto" {
  if (score >= 75) return "bajo";
  if (score >= 45) return "medio";
  return "alto";
}

export function generateTags(tool: Partial<Tool>): string[] {
  const tags: string[] = [];
  const score = tool.score_total || 0;

  if (score >= 75) tags.push("Merece probar");
  if (score >= 55 && score < 75) tags.push("Prometedor");
  if (tool.free_type === "Gratis real" && score >= 60) tags.push("Gratis limitado");
  if (tool.free_type === "Demo limitada") tags.push("Solo demo");
  if (tool.requires_credit_card === true) tags.push("Cuidado: requiere tarjeta");
  if (tool.risk_level === "alto") tags.push("Humo probable");
  if ((tool.score_creator_potential || 0) >= 7) tags.push("Ideal para creadores");
  if (tool.category === "Vídeo IA") tags.push("Bueno para vídeo");
  if (tool.local_install === true || tool.open_source === true) tags.push("Bueno para uso local");
  if (tool.tags && tool.tags.includes("Bueno para RTX 4060")) tags.push("Bueno para RTX 4060");
  if (tool.open_source === true) tags.push("Open-source");
  if (tool.free_type === "Gratis real" && tool.requires_signup === false) tags.push("Sin registro");
  if (tool.free_type === "Gratis real" && tool.requires_credit_card === false) tags.push("Sin tarjeta");
  if ((tool.score_ease || 0) >= 8) tags.push("Fácil de usar");

  return [...new Set(tags)];
}

export function getScoreColor(score: number): string {
  if (score >= 75) return "text-green-400";
  if (score >= 45) return "text-yellow-400";
  return "text-red-400";
}

export function getScoreBgColor(score: number): string {
  if (score >= 75) return "bg-green-500/20";
  if (score >= 45) return "bg-yellow-500/20";
  return "bg-red-500/20";
}
