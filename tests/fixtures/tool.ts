import { hydrateTool, type Tool, type ToolRecord } from '@lib/domain/tool';

/**
 * Builds a valid tool record with sensible defaults, so each test only states
 * the fields it actually cares about.
 */
export function makeToolRecord(overrides: Partial<ToolRecord> = {}): ToolRecord {
  return {
    id: 'tool_ejemplo',
    slug: 'ejemplo',
    name: 'Ejemplo',
    tagline: 'Una herramienta de ejemplo.',
    descriptionShort: 'Descripción corta de ejemplo.',
    descriptionLong: '',
    categorySlug: 'imagen',
    secondaryCategories: [],
    tags: [],
    useCases: [],
    freeModel: 'free_real',
    freePlan: {
      summary: 'Plan gratuito de ejemplo.',
      limits: [],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'no',
      commercialUse: 'yes',
      creditReset: 'none',
      verifiedAt: '2026-07-01',
    },
    kind: 'app',
    openSource: 'no',
    access: {
      chat: 'unverified',
      chatFree: 'unverified',
      api: 'unverified',
      apiFree: 'unverified',
      weights: 'unverified',
    },
    licences: {},
    hosting: 'cloud',
    platforms: ['web'],
    languages: [],
    skillLevel: 'beginner',
    startEffort: 'instant',
    startEffortReason: 'Fixture: se abre y se genera.',
    capabilities: [],
    privacy: {
      trainsOnUserData: 'unverified',
      optOutAvailable: 'unverified',
    },
    officialUrl: 'https://ejemplo.com',
    sources: [],
    evidence: [],
    scores: {
      freeReal: 8,
      usefulness: 8,
      ease: 8,
      transparency: 8,
      creatorValue: 8,
    },
    verdict: 'Veredicto de ejemplo.',
    pros: [],
    cons: [],
    bestFor: [],
    notFor: [],
    alternatives: [],
    alternativeNames: [],
    changelog: [],
    affiliation: { isAffiliate: false },
    sponsorship: { isSponsored: false, placementBoost: 0 },
    status: 'published',
    verification: 'pending_review',
    detectedAt: '2026-01-01',
    lastVerifiedAt: '2026-07-01',
    updatedAt: '2026-07-01',
    ...overrides,
  };
}

export function makeTool(overrides: Partial<ToolRecord> = {}, now = new Date('2026-08-03')): Tool {
  return hydrateTool(makeToolRecord(overrides), now);
}
