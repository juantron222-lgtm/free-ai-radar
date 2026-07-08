export interface CrawlerConfig {
  enabled: boolean;
  schedule: string;
  maxItemsPerSource: number;
  minDaysBetweenChecks: number;
  respectRobotsTxt: boolean;
  userAgent: string;
  requestDelayMs: number;
  timeoutSeconds: number;
  extractionRules: ExtractionRule[];
}

export interface ExtractionRule {
  field: string;
  selector: string;
  type: "css" | "regex" | "api";
  fallback: string;
  required: boolean;
}

export const crawlerConfig: CrawlerConfig = {
  enabled: false,
  schedule: "0 */6 * * *",
  maxItemsPerSource: 10,
  minDaysBetweenChecks: 1,
  respectRobotsTxt: true,
  userAgent: "FreeAIRadar/1.0 (research bot; contact@freeradar.ai)",
  requestDelayMs: 2000,
  timeoutSeconds: 30,
  extractionRules: [
    {
      field: "name",
      selector: "h1, [data-testid='product-name'], .product-name",
      type: "css",
      fallback: "No detectado",
      required: true,
    },
    {
      field: "description",
      selector: "meta[name='description'], .description, [data-testid='product-description']",
      type: "css",
      fallback: "",
      required: false,
    },
    {
      field: "url",
      selector: "link[rel='canonical'], meta[property='og:url']",
      type: "css",
      fallback: "",
      required: true,
    },
    {
      field: "pricing",
      selector: ".pricing, #pricing, [data-section='pricing']",
      type: "css",
      fallback: "",
      required: false,
    },
    {
      field: "free_tier_info",
      selector: "text containing 'free', 'gratis', 'no credit card'",
      type: "regex",
      fallback: "No confirmado",
      required: false,
    },
    {
      field: "github_url",
      selector: "a[href*='github.com']",
      type: "css",
      fallback: "",
      required: false,
    },
  ],
};

export function getExtractionRule(field: string): ExtractionRule | undefined {
  return crawlerConfig.extractionRules.find((r) => r.field === field);
}

export const FIELD_MAPPING: Record<string, string> = {
  name: "name",
  official_url: "url",
  description_short: "description",
  pricing_url: "pricing",
  github_url: "github_url",
  free_plan_summary: "free_tier_info",
};
