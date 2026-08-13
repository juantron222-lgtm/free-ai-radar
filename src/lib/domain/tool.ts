import { z } from 'zod';
import {
  EditorialStatus,
  HttpUrl,
  IsoDate,
  OptionalHttpUrl,
  Slug,
  TriState,
} from './primitives';
import {
  CAPABILITIES,
  CATEGORY_SLUGS,
  CREDIT_RESET,
  START_EFFORT,
  HOSTING,
  PLATFORMS,
  SKILL_LEVELS,
} from './taxonomy';
import {
  computeScoreBreakdown,
  daysBetween,
  deriveTags,
  freshnessOf,
  scoreBand,
  type Freshness,
  type ScoreBand,
  type ScoreBreakdown,
} from './scoring';

/**
 * Editorial score components, each 0–10.
 *
 * These are the only numbers a human editor sets by hand. The total is always
 * derived (see `scoring.ts`) so a published score can never disagree with the
 * evidence shown next to it.
 */
export const ScoreComponents = z.object({
  /** How genuinely free the free tier is, in practice, for real work. */
  freeReal: z.number().min(0).max(10),
  /** How useful the tool is at what it claims to do. */
  usefulness: z.number().min(0).max(10),
  /** How easy it is to get a first useful result. */
  ease: z.number().min(0).max(10),
  /** How clearly the vendor documents limits, pricing and rights. */
  transparency: z.number().min(0).max(10),
  /** How well it serves independent creators specifically. */
  creatorValue: z.number().min(0).max(10),
});
export type ScoreComponents = z.infer<typeof ScoreComponents>;

export const FreePlan = z.object({
  /** One-paragraph human summary of what the free tier actually gives you. */
  summary: z.string().min(1),
  /** Concrete limits, one per line: "3 vídeos/día", "512×512 px", "10k tokens". */
  limits: z.array(z.string()).default([]),
  requiresSignup: TriState.default('unverified'),
  requiresCreditCard: TriState.default('unverified'),
  hasWatermark: TriState.default('unverified'),
  commercialUse: TriState.default('unverified'),
  creditsAmount: z.string().optional(),
  creditReset: z.enum(CREDIT_RESET).default('none'),
  /** Date the free plan itself was last confirmed against the vendor's page. */
  verifiedAt: IsoDate,
});
export type FreePlan = z.infer<typeof FreePlan>;

export const ToolPrivacy = z.object({
  /** Does the vendor train on your inputs by default on the free tier? */
  trainsOnUserData: TriState.default('unverified'),
  /** Can you opt out of training without paying? */
  optOutAvailable: TriState.default('unverified'),
  dataRetention: z.string().optional(),
  /** ISO 3166-1 alpha-2, e.g. "US", "ES", "FR". */
  companyCountry: z.string().length(2).optional(),
  privacyPolicyUrl: OptionalHttpUrl,
  gdprNotes: z.string().optional(),
});
export type ToolPrivacy = z.infer<typeof ToolPrivacy>;

export const ToolSource = z.object({
  url: HttpUrl,
  label: z.string().min(1),
  /** `official` sources are the only ones we cite for pricing claims. */
  kind: z.enum(['official', 'pricing', 'docs', 'repo', 'community', 'press']).default('official'),
  checkedAt: IsoDate,
});
export type ToolSource = z.infer<typeof ToolSource>;

export const ToolChange = z.object({
  date: IsoDate,
  /** What kind of change this was — drives alert routing and Pro filters. */
  kind: z.enum([
    'free_plan_reduced',
    'free_plan_improved',
    'price_change',
    'card_now_required',
    'card_no_longer_required',
    'watermark_added',
    'watermark_removed',
    'licence_change',
    'shutdown',
    'launch',
    'other',
  ]),
  summary: z.string().min(1),
  sourceUrl: OptionalHttpUrl,
});
export type ToolChange = z.infer<typeof ToolChange>;

export const Affiliation = z.object({
  /** True when the outbound link earns the site a commission. Always disclosed. */
  isAffiliate: z.boolean().default(false),
  programName: z.string().optional(),
  /** Overrides `officialUrl` on the visit button when affiliate is active. */
  affiliateUrl: OptionalHttpUrl,
});
export type Affiliation = z.infer<typeof Affiliation>;

export const Sponsorship = z.object({
  isSponsored: z.boolean().default(false),
  sponsorLabel: z.string().optional(),
  /** Sponsorship never touches the score. It only affects placement. */
  placementBoost: z.number().min(0).max(0).default(0),
  startsAt: IsoDate.optional(),
  endsAt: IsoDate.optional(),
});
export type Sponsorship = z.infer<typeof Sponsorship>;

/**
 * `ToolRecord` is the *stored* shape — what lives in Postgres, in the seed
 * JSON and in the admin form. It deliberately has no `scoreTotal`: derived
 * values are computed on read by `hydrateTool` so a stored number can never
 * drift away from the evidence that produced it.
 */
export const ToolRecord = z.object({
  id: z.string().min(1),
  slug: Slug,
  name: z.string().min(1).max(120),
  tagline: z.string().min(1).max(200),
  descriptionShort: z.string().min(1).max(400),
  descriptionLong: z.string().default(''),

  /**
   * What this entry actually *is*.
   *
   * A base model and a commercial app that serves it are different things and
   * must not share a ficha. Powers /modelos and /agentes, and stops the
   * category "Modelos open-source" from quietly meaning "anything vaguely
   * model-shaped".
   */
  kind: z
    .enum(['model', 'app', 'platform', 'framework', 'agent', 'api', 'interface', 'oss_project'])
    .default('app'),

  /**
   * How much of this ficha we have actually confirmed, and when it is due for
   * another look. `pending_review` is the honest default for anything new.
   */
  verification: z
    .enum(['verified', 'partially_verified', 'pending_review', 'outdated', 'discontinued'])
    .default('pending_review'),
  nextReviewAt: IsoDate.optional(),
  /** Literal release tag, when the vendor publishes one. */
  version: z.string().max(40).optional(),

  categorySlug: z.enum(CATEGORY_SLUGS as [string, ...string[]]),
  secondaryCategories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  useCases: z.array(z.string()).default([]),

  freeModel: z.enum([
    'free_real',
    'freemium',
    'credits',
    'trial',
    'open_source',
    'local',
    'demo',
    'paid_only',
    'unknown',
  ]),
  freePlan: FreePlan,

  /**
   * Qué sabe hacer, separado de dónde vive.
   *
   * Vacío por defecto y sin rellenar salvo que una página oficial lo nombre.
   * Un array de capacidades es tan fácil de rellenar a ojo como lo fue
   * `requiresCreditCard: no`, y acabaría igual.
   */
  capabilities: z.array(z.enum(CAPABILITIES)).default([]),

  /**
   * Cuánto hay entre abrir la página y obtener un resultado.
   *
   * Distinto de `skillLevel`, que describe al usuario. Esto describe la
   * herramienta, y es lo que impide volver a presentar Fooocus y un generador
   * web como si fueran el mismo recado.
   */
  startEffort: z.enum(START_EFFORT).default('signup'),

  /**
   * Por qué esta ficha tiene ese `startEffort`.
   *
   * `startEffort` es el único campo del catálogo exento de cita, porque
   * describe lo que cuesta empezar y eso lo observamos nosotros. Esa exención
   * lo vuelve el más fácil de rellenar a ojo y el más difícil de discutir
   * después. Esto es el rastro: una línea con lo que se observó, para que quien
   * revise dentro de seis meses pueda contradecirla sin rehacer el argumento.
   */
  startEffortReason: z.string().max(160).default(''),

  openSource: TriState.default('unverified'),
  licence: z.string().optional(),
  hosting: z.enum(HOSTING).default('cloud'),
  platforms: z.array(z.enum(PLATFORMS)).default([]),
  languages: z.array(z.string()).default([]),
  hardwareRequirements: z.string().optional(),
  skillLevel: z.enum(SKILL_LEVELS).default('beginner'),

  privacy: ToolPrivacy.default({}),

  officialUrl: HttpUrl,
  pricingUrl: OptionalHttpUrl,
  docsUrl: OptionalHttpUrl,
  repoUrl: OptionalHttpUrl,
  sources: z.array(ToolSource).default([]),

  scores: ScoreComponents,

  verdict: z.string().default(''),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  bestFor: z.array(z.string()).default([]),
  notFor: z.array(z.string()).default([]),
  /** Slugs of alternatives we have reviewed. Validated for existence on load. */
  alternatives: z.array(z.string()).default([]),
  /**
   * Alternatives we mention but have not reviewed yet. Kept as plain names so
   * editorial context survives, and shown without a link so we never imply a
   * verification that does not exist.
   */
  alternativeNames: z.array(z.string()).default([]),

  changelog: z.array(ToolChange).default([]),

  affiliation: Affiliation.default({}),
  sponsorship: Sponsorship.default({}),

  status: EditorialStatus.default('draft'),
  reviewedBy: z.string().optional(),
  detectedAt: IsoDate,
  lastVerifiedAt: IsoDate,
  updatedAt: IsoDate,
});
export type ToolRecord = z.infer<typeof ToolRecord>;

/**
 * A hydrated tool: the stored record plus everything derived from it. This is
 * what pages and components consume; nothing in the UI recomputes scores.
 */
export const TOOL_KIND_LABEL: Record<ToolRecord['kind'], string> = {
  model: 'Modelo',
  app: 'Aplicación',
  platform: 'Plataforma',
  framework: 'Framework',
  agent: 'Agente',
  api: 'API',
  interface: 'Interfaz',
  oss_project: 'Proyecto open source',
};

export const VERIFICATION_LABEL: Record<ToolRecord['verification'], string> = {
  verified: 'Verificada',
  partially_verified: 'Parcialmente verificada',
  pending_review: 'Pendiente de revisión',
  outdated: 'Desactualizada',
  discontinued: 'Discontinuada',
};

/** Entries that belong on /modelos. */
export const MODEL_KINDS: ReadonlyArray<ToolRecord['kind']> = ['model', 'api'];

/** Entries that belong on /agentes. */
export const AGENT_KINDS: ReadonlyArray<ToolRecord['kind']> = ['agent', 'framework'];

export interface Tool extends ToolRecord {
  readonly scoreTotal: number;
  readonly scoreBreakdown: ScoreBreakdown;
  readonly band: ScoreBand;
  readonly freshness: Freshness;
  readonly daysSinceVerified: number;
  /** Editorial tags plus the ones derived from verified facts. */
  readonly badges: string[];
  /** Where the "visit" button should point, honouring affiliation. */
  readonly outboundUrl: string;
}

export function hydrateTool(record: ToolRecord, now: Date = new Date()): Tool {
  const scoreBreakdown = computeScoreBreakdown({
    scores: record.scores,
    freeModel: record.freeModel,
    freePlan: record.freePlan,
    openSource: record.openSource,
  });

  const scoreTotal = scoreBreakdown.total;

  const badges = [
    ...new Set([
      ...deriveTags({
        freeModel: record.freeModel,
        freePlan: record.freePlan,
        openSource: record.openSource,
        hosting: record.hosting,
        scoreTotal,
        scores: record.scores,
      }),
      ...record.tags,
    ]),
  ];

  return {
    ...record,
    scoreTotal,
    scoreBreakdown,
    band: scoreBand(scoreTotal),
    freshness: freshnessOf(record.lastVerifiedAt, now),
    daysSinceVerified: daysBetween(record.lastVerifiedAt, now),
    badges,
    outboundUrl:
      record.affiliation.isAffiliate && record.affiliation.affiliateUrl
        ? record.affiliation.affiliateUrl
        : record.officialUrl,
  };
}

/** Shape stored in the search index and sent to the client. Deliberately small. */
export interface ToolSummary {
  slug: string;
  name: string;
  tagline: string;
  categorySlug: string;
  freeModel: Tool['freeModel'];
  scoreTotal: number;
  requiresCreditCard: Tool['freePlan']['requiresCreditCard'];
  requiresSignup: Tool['freePlan']['requiresSignup'];
  hasWatermark: Tool['freePlan']['hasWatermark'];
  commercialUse: Tool['freePlan']['commercialUse'];
  openSource: Tool['openSource'];
  hosting: Tool['hosting'];
  platforms: Tool['platforms'];
  startEffort: Tool['startEffort'];
  tags: string[];
  lastVerifiedAt: string;
  isSponsored: boolean;
}

export function toSummary(tool: Tool): ToolSummary {
  return {
    slug: tool.slug,
    name: tool.name,
    tagline: tool.tagline,
    categorySlug: tool.categorySlug,
    freeModel: tool.freeModel,
    scoreTotal: tool.scoreTotal,
    requiresCreditCard: tool.freePlan.requiresCreditCard,
    requiresSignup: tool.freePlan.requiresSignup,
    hasWatermark: tool.freePlan.hasWatermark,
    commercialUse: tool.freePlan.commercialUse,
    openSource: tool.openSource,
    hosting: tool.hosting,
    platforms: tool.platforms,
    startEffort: tool.startEffort,
    tags: tool.tags,
    lastVerifiedAt: tool.lastVerifiedAt,
    isSponsored: tool.sponsorship.isSponsored,
  };
}
