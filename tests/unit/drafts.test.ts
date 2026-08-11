import { describe, expect, it } from 'vitest';
import rawDrafts from '@/data/news/drafts.json';
import rawVerification from '@/data/news/verification.json';
import { Drafts, checkDraft, gateDrafts } from '../../scripts/draft/drafts.mjs';
import type { DraftShape } from '../../scripts/draft/drafts.d.mts';
import type { VerificationRecordShape } from '../../scripts/verify/verification.d.mts';
import { NewsItem, isPublishable } from '@lib/domain/news';
import { getTool } from '@lib/data/catalog';

/**
 * The last gate before prose reaches a reader.
 *
 * Everything below exists to make one failure impossible: a sentence that reads
 * like a fact and is not one. The tests are mostly *negative* on purpose — a
 * gate that has only ever been watched passing is indistinguishable from an
 * empty function, and this one guards the claim ("it's free") that would cost
 * the project its only real asset.
 */

const drafts = rawDrafts as DraftShape[];
const verification = rawVerification as VerificationRecordShape[];
const byCandidate = new Map(verification.map((record) => [record.candidateId, record]));

const nano = drafts.find((d) => d.slug.startsWith('nano-banana'))!;
const record = byCandidate.get(nano.candidateId)!;

function mutate(overrides: Partial<DraftShape>): DraftShape {
  return { ...nano, ...overrides };
}

describe('a draft only exists downstream of a verified record', () => {
  it('refuses to draft from an insufficient verification', () => {
    const blocked = verification.find((r) => r.decision === 'insufficient')!;
    const result = checkDraft(mutate({ candidateId: blocked.candidateId }), blocked);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('sólo "verified" puede redactarse');
  });

  it('refuses a draft with no verification behind it at all', () => {
    expect(checkDraft(nano, undefined).ok).toBe(false);
  });

  it('lets the two real drafts through', () => {
    for (const result of gateDrafts(drafts, verification)) {
      expect(result.ok, `${result.slug}: ${result.reasons.join('; ')}`).toBe(true);
    }
  });
});

describe('every factual claim is traceable', () => {
  it('refuses a trace citing a quote nobody verified', () => {
    const result = checkDraft(
      mutate({
        factTrace: { ...nano.factTrace, summary: ['Una frase que la fuente nunca dijo'] },
      }),
      record
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('no está en los hechos verificados');
  });

  it('refuses a price that no quote supports', () => {
    const result = checkDraft(
      mutate({
        summary: `${nano.summary} Cuesta 99,00 dólares al mes.`,
        factTrace: { ...nano.factTrace, pricing: [] },
      }),
      record
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('precio que ningún hecho verificado respalda');
  });

  it('refuses a licence or open-weights claim the source never made', () => {
    const result = checkDraft(
      mutate({ impact: 'Publica sus pesos abiertos bajo licencia Apache, así que puedes descargarlo.' }),
      record
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('licencia o pesos');
  });

  it('allows saying the source is silent about weights', () => {
    /*
     * The difference between "it has no open weights" and "the page does not
     * mention weights" is the whole editorial policy in one sentence.
     */
    const result = checkDraft(
      mutate({ impact: 'El anuncio no menciona pesos abiertos ni ninguna licencia de descarga.' }),
      record
    );
    expect(result.ok, result.reasons.join('; ')).toBe(true);
  });

  it('refuses a regional limit the source never mentions', () => {
    const result = checkDraft(
      mutate({ impact: 'De momento sólo en Estados Unidos, según lo previsto por la compañía.' }),
      record
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('región');
  });
});

describe('the writer cannot supply what the evidence lacks', () => {
  it('refuses superlatives', () => {
    const result = checkDraft(mutate({ title: 'El mejor modelo de imagen que existe' }), record);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('superlativo');
  });

  it('refuses comparisons that appear in no quote', () => {
    const result = checkDraft(
      mutate({ impact: 'Es más barato que Midjourney y más rápido que Stable Diffusion.' }),
      record
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('compara sin evidencia');
  });
});

describe('the free plan, which is the claim that matters most here', () => {
  it('refuses "gratis" as a fact when the verification could not establish it', () => {
    const result = checkDraft(
      mutate({ impact: 'Puedes generar imágenes gratis desde la API sin poner tarjeta.' }),
      record
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('el coste como hecho');
  });

  it('refuses "de pago" just as firmly: silence is not a denial either', () => {
    const result = checkDraft(
      mutate({ impact: 'Es un servicio de pago y no hay forma de usarlo sin abonar la cuota.' }),
      record
    );
    expect(result.ok).toBe(false);
  });

  it('allows discussing the free plan as the source’s silence', () => {
    const result = checkDraft(
      mutate({
        impact: 'Sobre si hay una capa gratuita, la página no dice nada, ni para confirmarlo ni para descartarlo.',
      }),
      record
    );
    expect(result.ok, result.reasons.join('; ')).toBe(true);
  });

  it('refuses a draft that disagrees with the verification about the free plan', () => {
    const result = checkDraft(mutate({ affectsFreePlan: 'yes' }), record);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('plan gratuito');
  });
});

describe('availability has to match the quote behind it', () => {
  it('refuses "available" backed by a sentence that says preview', () => {
    const result = checkDraft(
      mutate({
        availability: 'available',
        factTrace: {
          ...nano.factTrace,
          availability: ['Gemini Omni is available in public preview starting today'],
        },
      }),
      record
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('preview o beta');
  });

  it('refuses "preview" with no quote that says so', () => {
    const result = checkDraft(mutate({ availability: 'preview' }), record);
    expect(result.ok).toBe(false);
  });

  it('the preview draft declares preview and cites the sentence that says it', () => {
    const omni = drafts.find((d) => d.slug.startsWith('gemini-omni'))!;
    expect(omni.availability).toBe('preview');
    expect(omni.eventType).toBe('preview-beta');
    expect(omni.factTrace.availability.join(' ')).toContain('public preview');
  });

  it('the two drafts from one source do not both claim general availability', () => {
    const availabilities = drafts.map((d) => d.availability);
    expect(new Set(availabilities).size).toBe(2);
  });
});

describe('the link and the evidence lead to the same page', () => {
  it('refuses an officialUrl that was never read', () => {
    const result = checkDraft(
      mutate({ officialUrl: 'https://deepmind.google/blog/start-building-with-nano-banana-2-lite-and-gemini-omni-flash/' }),
      record
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('fuentes primarias que se pudieron leer');
  });

  it('refuses citing a source the verification does not list', () => {
    const result = checkDraft(
      mutate({
        sources: [
          {
            url: 'https://example.invalid/nota',
            label: 'Una nota de prensa',
            kind: 'official',
            publisher: 'example.invalid',
            checkedAt: '2026-08-11',
          },
        ],
      }),
      record
    );
    expect(result.ok).toBe(false);
  });
});

describe('the real drafts', () => {
  it('validate against the draft schema', () => {
    expect(() => Drafts.parse(drafts)).not.toThrow();
  });

  it('are two independent pieces, each with its own identity', () => {
    expect(drafts).toHaveLength(2);
    expect(new Set(drafts.map((d) => d.slug)).size).toBe(2);
    expect(new Set(drafts.map((d) => d.id)).size).toBe(2);
    expect(new Set(drafts.map((d) => d.title)).size).toBe(2);
  });

  it('link only to tools that exist in the catalogue', () => {
    for (const draft of drafts) {
      for (const slug of draft.relatedTools) {
        expect(getTool(slug), `${draft.slug} → ${slug}`).toBeDefined();
      }
    }
  });

  it('would satisfy the editorial schema and its publication gate', () => {
    /*
     * The drafts are not published, but they have to be publishable — a draft
     * that could never pass `isPublishable` is a draft that will be rewritten
     * from scratch later, which is when the untraced sentences creep back in.
     */
    for (const draft of drafts) {
      const asNews = {
        id: draft.id,
        slug: draft.slug,
        title: draft.title,
        summary: draft.summary,
        impact: draft.impact,
        category: draft.category,
        eventType: draft.eventType,
        availability: draft.availability,
        publishedAt: '2026-06-30',
        checkedAt: '2026-08-11',
        sources: draft.sources,
        officialUrl: draft.officialUrl,
        relatedTools: draft.relatedTools,
        affectsFreePlan: draft.affectsFreePlan,
        verification: 'verified',
        status: 'draft',
        author: 'Redacción de Free AI Radar',
        unconfirmed: [],
      };

      const parsed = NewsItem.safeParse(asNews);
      expect(parsed.success, `${draft.slug}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);

      const check = isPublishable(parsed.data!);
      expect(check.ok, `${draft.slug}: ${check.reasons.join('; ')}`).toBe(true);
    }
  });

  it('are still drafts: nothing here is published', () => {
    for (const draft of drafts) {
      expect(draft.status).toBe('draft');
    }
  });
});
