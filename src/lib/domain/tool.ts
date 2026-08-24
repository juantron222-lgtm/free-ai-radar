import { z } from 'zod';
import {
  EditorialStatus,
  HttpUrl,
  IsoDate,
  OptionalHttpUrl,
  Slug,
  Openness,
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

/**
 * Los campos cuya evidencia rastreamos uno a uno.
 *
 * No son todos: son los que deciden. Alguien elige entre dos herramientas por
 * si le piden la tarjeta, por si puede usar el resultado para trabajar y por
 * si le ponen una marca encima. Lo demás es contexto.
 */
export const EVIDENCE_FIELDS = [
  'freePlan.requiresCreditCard',
  'freePlan.requiresSignup',
  'freePlan.hasWatermark',
  'freePlan.commercialUse',
  'freePlan.creditReset',
  'freePlan.limits',
  'privacy.trainsOnUserData',
  'openSource',
  'hosting',
  'startEffort',
  'capabilities',
] as const;
export type EvidenceField = (typeof EVIDENCE_FIELDS)[number];

/**
 * Qué encontramos al abrir la fuente oficial.
 *
 * Las tres son respuestas distintas y hasta ahora las tres se guardaban igual:
 *
 *   `stated`        La página lo dice con todas las letras.
 *   `derived`       No lo dice, pero se sigue sin ambigüedad de algo que sí
 *                   dice —una licencia MIT permite uso comercial—. Obliga a
 *                   escribir de qué se deriva: sin eso es una suposición.
 *   `not_published` Miramos donde había que mirar y el fabricante no lo dice.
 *
 * `not_published` es la que faltaba, y es una distinción editorial, no técnica.
 * «Todavía no lo hemos comprobado» y «lo comprobamos y no lo publican» son dos
 * cosas muy distintas para quien lee: la primera es deuda nuestra, la segunda
 * es opacidad suya. El catálogo las guardaba en el mismo `unverified` y la web
 * las enseñaba con las mismas dos palabras.
 */
export const EvidenceOutcome = z.enum(['stated', 'derived', 'not_published']);
export type EvidenceOutcome = z.infer<typeof EvidenceOutcome>;

export const FieldEvidence = z
  .object({
    field: z.enum(EVIDENCE_FIELDS),
    outcome: EvidenceOutcome,
    /** La página oficial que se abrió. Nunca un tercero. */
    sourceUrl: HttpUrl,
    sourceKind: z.enum(['pricing', 'docs', 'terms', 'privacy', 'repo', 'help', 'licence', 'official']),
    /** El día en que se abrió, no el día en que se escribió la ficha. */
    checkedAt: IsoDate,
    /**
     * De qué se deduce, cuando no está dicho. Obligatorio en `derived`: es la
     * diferencia entre una inferencia rastreable y uno de nuestros inventos.
     */
    basis: z.string().min(1).optional(),
    /** Qué se buscó y no estaba, cuando el resultado es `not_published`. */
    lookedFor: z.string().min(1).optional(),
    /**
     * La frase de la página, literal.
     *
     * Es lo que permite discutir el dato sin volver a abrir la fuente, y lo
     * que distingue «lo comprobamos» de «lo comprobamos y esto decía». El
     * catálogo ya guardaba citas así en noventa y tres fichas, en una forma
     * que el esquema no conocía y que por tanto no llegaba a la web.
     */
    quote: z.string().min(1).optional(),
  })
  .refine((e) => e.outcome !== 'derived' || Boolean(e.basis), {
    message: 'Una evidencia derivada tiene que decir de qué se deriva',
    path: ['basis'],
  });
export type FieldEvidence = z.infer<typeof FieldEvidence>;

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

  /**
   * Qué clase de producto es, cuando la vertical necesita distinguirlo.
   *
   * Opcional a propósito: la mayoría de las fichas no lo necesitan. En /codigo
   * sí, porque allí un editor, un autocompletado, un agente, una herramienta de
   * terminal y un constructor de aplicaciones son cinco cosas distintas que se
   * anuncian con las mismas dos palabras. Y no se puede inferir de las
   * capacidades: Cursor y Cline editan repositorios y usan la terminal
   * exactamente igual.
   */
  productType: z
    .enum(['ide', 'copilot', 'agent', 'cli', 'review', 'app-builder', 'platform', 'library'])
    .optional(),

  /**
   * Ruta a un logo servido desde nuestro propio dominio.
   *
   * Opcional y con una condición: `/logos/…`, nunca una URL externa. Enlazar
   * el favicon de un tercero rompería a la primera que cambien su web, llevaría
   * a nuestros lectores a un dominio ajeno sin decírselo y publicaría una
   * imagen cuyos derechos no hemos comprobado. Sin logo, la tarjeta dibuja un
   * monograma, que no es de nadie y por tanto no afirma nada.
   */
  logo: z
    .string()
    .regex(/^\/logos\/[a-z0-9-]+\.(svg|png|webp)$/, 'El logo debe servirse desde /logos/')
    .optional(),

  openSource: Openness.default('unverified'),

  /**
   * Las formas de acceso de un modelo, que son independientes entre sí.
   *
   * Es el campo que impide el error más común de esta vertical, y son cuatro
   * herencias falsas: que ChatGPT tenga plan gratuito no hace gratis la API de
   * GPT; que la API de Gemini tenga capa gratuita no significa que la tengan
   * todos sus modelos —`gemini-3.1-pro-preview` dice «Not available» en la
   * misma tabla donde Flash dice «Available»—; que los pesos sean abiertos no
   * hace gratis el endpoint alojado; y que exista una app de chat no dice nada
   * sobre si el modelo concreto está en su plan gratuito.
   *
   * Cinco preguntas, cinco respuestas, cada una con su propia cita.
   */
  access: z
    .object({
      /** ¿Existe una aplicación de chat donde una persona pueda usarlo? */
      chat: TriState.default('unverified'),
      /** ¿Y está incluido en el plan gratuito de esa aplicación? */
      chatFree: TriState.default('unverified'),
      /** ¿Se puede consumir por API? */
      api: TriState.default('unverified'),
      /** ¿Esa API tiene capa gratuita de verdad, no una promoción de alta? */
      apiFree: TriState.default('unverified'),
      /** ¿Se pueden descargar los pesos y ejecutarlo? */
      weights: TriState.default('unverified'),
      /** Dónde se usa en el navegador, cuando `chat` es `yes`. */
      chatWhere: z.string().max(80).optional(),
    })
    .default({}),
  /** Resumen legible de una línea, cuando las tres capas coinciden. */
  licence: z.string().optional(),

  /**
   * La licencia, por capas, porque no es una sola cosa.
   *
   * AudioCraft publica su código con licencia MIT y sus pesos con CC-BY-NC.
   * F5-TTS, igual. Las dos afirmaciones son ciertas por separado y juntas
   * engañan: quien lee «open source» y va a usarlo en un encargo se lleva la
   * sorpresa después de haberlo integrado, que es el peor momento.
   *
   * `outputs` existe aunque casi nadie lo documente. Que sea un hueco explícito
   * es mejor que darlo por hecho: lo que puedes hacer con lo que generas es una
   * pregunta distinta de bajo qué licencia se publicó el modelo.
   *
   * Cada capa se rellena sólo si una fuente oficial la declara.
   */
  licences: z
    .object({
      code: z.string().optional(),
      weights: z.string().optional(),
      outputs: z.string().optional(),
    })
    .default({}),
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

  /**
   * La evidencia de los hechos que deciden, campo a campo.
   *
   * `sources[]` dice qué páginas se abrieron para la ficha entera; esto dice
   * qué página sostiene *qué dato*, qué día y si lo afirma o se deduce. Sin
   * ello, «uso comercial: sí» y «uso comercial: sí porque la licencia es MIT»
   * eran indistinguibles, y la segunda es la única que se puede rebatir.
   */
  evidence: z.array(FieldEvidence).default([]),

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
