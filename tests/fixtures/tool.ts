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
    openSource: 'no',
    hosting: 'cloud',
    platforms: ['web'],
    languages: [],
    skillLevel: 'beginner',
    privacy: {
      trainsOnUserData: 'unverified',
      optOutAvailable: 'unverified',
    },
    officialUrl: 'https://ejemplo.com',
    sources: [],
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
    detectedAt: '2026-01-01',
    lastVerifiedAt: '2026-07-01',
    updatedAt: '2026-07-01',
    ...overrides,
  } as ToolRecord;
}

export function makeTool(overrides: Partial<ToolRecord> = {}, now = new Date('2026-08-03')): Tool {
  return hydrateTool(makeToolRecord(overrides), now);
}
