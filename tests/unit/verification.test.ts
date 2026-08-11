import { describe, expect, it } from 'vitest';
import rawVerification from '@/data/news/verification.json';
import rawTriage from '@/data/news/triage.json';
import {
  AVAILABILITIES,
  EVENT_TYPES,
  FREE_PLAN_STATES,
  Verification,
  VerificationRecord,
  canBeWritten,
  summarizeVerification,
} from '../../scripts/verify/verification.mjs';
import type { VerificationRecordShape } from '../../scripts/verify/verification.d.mts';
import { NewsAvailability, NewsEventType } from '@lib/domain/news';

/**
 * The gate between a candidate and prose.
 *
 * Everything here defends one rule: nothing reaches writing that a reachable
 * primary source did not demonstrate. The schema enforces it, and these tests
 * check the schema actually bites — a validator nobody has watched fail is
 * indistinguishable from one that passes everything.
 */

const records = rawVerification as VerificationRecordShape[];

function base(overrides: Partial<VerificationRecordShape> = {}): VerificationRecordShape {
  return {
    candidateId: 'inbox-000000000001',
    title: 'Un anuncio cualquiera',
    checkedAt: '2026-08-11',
    decision: 'verified',
    primarySources: [
      {
        url: 'https://blog.google/algo/',
        label: 'Anuncio oficial',
        kind: 'official',
        publisher: 'blog.google',
        checkedAt: '2026-08-11',
        reachable: true,
        unreachableReason: null,
        redirectedTo: null,
      },
    ],
    verifiedFacts: [
      {
        fact: 'Está disponible desde hoy.',
        quote: 'available today',
        sourceUrl: 'https://blog.google/algo/',
      },
    ],
    unconfirmed: [],
    eventType: 'lanzamiento',
    availability: 'available',
    affectsFreePlan: 'unverified',
    verificationNotes: 'Comprobado contra la página oficial.',
    ...overrides,
  };
}

describe('the stage vocabulary matches the editorial schema', () => {
  it('uses exactly the same event types the newsroom publishes', () => {
    /*
     * The two lists are duplicated across a TypeScript/JavaScript boundary that
     * cannot be bridged on this Node version. Duplication is fine; drift is
     * not, because a verification could then declare an event type the
     * editorial schema would refuse, and the mismatch would only surface at the
     * moment someone tried to publish.
     */
    expect([...EVENT_TYPES]).toEqual([...NewsEventType.options]);
  });

  it('uses exactly the same availabilities', () => {
    expect([...AVAILABILITIES]).toEqual([...NewsAvailability.options]);
  });

  it('uses the same three free-plan states, with silence as its own answer', () => {
    expect([...FREE_PLAN_STATES]).toEqual(['yes', 'no', 'unverified']);
  });
});

describe('only a read source can verify anything', () => {
  it('refuses a "verified" whose sources were all unreachable', () => {
    const parsed = VerificationRecord.safeParse(
      base({
        primarySources: [
          {
            url: 'https://openai.com/index/algo',
            label: 'No se ha podido leer',
            kind: 'official',
            publisher: 'openai.com',
            checkedAt: '2026-08-11',
            reachable: false,
            unreachableReason: 'HTTP 403',
            redirectedTo: null,
          },
        ],
        verifiedFacts: [],
      })
    );
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('no se ha podido leer');
  });

  it('refuses a "verified" that demonstrates nothing', () => {
    expect(VerificationRecord.safeParse(base({ verifiedFacts: [] })).success).toBe(false);
  });

  it('refuses a fact attributed to a page that was never read', () => {
    const parsed = VerificationRecord.safeParse(
      base({
        verifiedFacts: [
          {
            fact: 'Algo',
            quote: 'algo',
            sourceUrl: 'https://otra-cosa.example/pagina',
          },
        ],
      })
    );
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('no consta entre las fuentes leídas');
  });

  it('refuses a "verified" that will not say what kind of event it was', () => {
    expect(VerificationRecord.safeParse(base({ eventType: null })).success).toBe(false);
  });

  it('refuses a "verified" that will not state availability, even as unknown', () => {
    expect(VerificationRecord.safeParse(base({ availability: null })).success).toBe(false);
    expect(VerificationRecord.safeParse(base({ availability: 'unknown' })).success).toBe(true);
  });
});

describe('the outcomes that stop a story', () => {
  it('requires an explanation when the outcome is not "verified"', () => {
    const parsed = VerificationRecord.safeParse(
      base({
        decision: 'insufficient',
        verifiedFacts: [],
        eventType: null,
        availability: null,
        verificationNotes: 'corto',
      })
    );
    expect(parsed.success).toBe(false);
  });

  it('requires a contradiction to name what the source contradicts', () => {
    const parsed = VerificationRecord.safeParse(
      base({
        decision: 'contradicted',
        verifiedFacts: [],
        eventType: null,
        availability: null,
        unconfirmed: [],
        verificationNotes: 'La fuente dice lo contrario que el titular del candidato.',
      })
    );
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('qué afirmación contradice');
  });

  it('accepts an unreadable source as a legitimate "insufficient"', () => {
    const parsed = VerificationRecord.safeParse(
      base({
        decision: 'insufficient',
        primarySources: [
          {
            url: 'https://openai.com/index/algo',
            label: 'No se ha podido leer',
            kind: 'official',
            publisher: 'openai.com',
            checkedAt: '2026-08-11',
            reachable: false,
            unreachableReason: 'HTTP 403',
            redirectedTo: null,
          },
        ],
        verifiedFacts: [],
        eventType: null,
        availability: null,
        unconfirmed: ['Todo el contenido del anuncio.'],
        verificationNotes: 'La página devuelve 403 a nuestro lector y no se ha podido comprobar nada.',
      })
    );
    expect(parsed.success).toBe(true);
  });

  it('only "verified" may proceed to writing', () => {
    expect(canBeWritten(base())).toBe(true);
    expect(canBeWritten(base({ decision: 'insufficient' }))).toBe(false);
    expect(canBeWritten(base({ decision: 'contradicted' }))).toBe(false);
  });
});

describe('silence is never converted into an answer', () => {
  it('a source that says nothing about the free plan leaves it unverified', () => {
    for (const record of records.filter((r) => r.affectsFreePlan !== 'unverified')) {
      const stated = record.verifiedFacts.some((fact) => /gratu|free|sin coste/i.test(fact.quote));
      expect(stated, `${record.candidateId} afirma "${record.affectsFreePlan}" sin cita`).toBe(true);
    }
  });

  it('no unreadable source produced a free-plan claim', () => {
    for (const record of records) {
      const anyRead = record.primarySources.some((s) => s.reachable);
      if (!anyRead) expect(record.affectsFreePlan, record.candidateId).toBe('unverified');
    }
  });

  it('nothing unread carries an event type or an availability', () => {
    for (const record of records) {
      if (record.primarySources.every((s) => !s.reachable)) {
        expect(record.eventType, record.candidateId).toBeNull();
        expect(record.availability, record.candidateId).toBeNull();
      }
    }
  });
});

describe('the real verification run', () => {
  it('validates against the schema', () => {
    expect(() => Verification.parse(records)).not.toThrow();
  });

  it('covers every candidate triage promoted, and only those', () => {
    const promoted = (rawTriage as Array<{ id: string; triageDecision: string }>)
      .filter((r) => r.triageDecision === 'promote')
      .map((r) => r.id)
      .sort();
    const verified = records.map((r) => r.candidateId).sort();
    expect(verified).toEqual(promoted);
  });

  it('every fact carries a literal quote, not a paraphrase', () => {
    for (const record of records) {
      for (const fact of record.verifiedFacts) {
        expect(fact.quote.length, `${record.candidateId}: ${fact.fact}`).toBeGreaterThan(0);
        expect(fact.quote, record.candidateId).not.toBe(fact.fact);
      }
    }
  });

  it('a redirected discovery url is recorded, not silently replaced', () => {
    const redirected = records.flatMap((r) =>
      r.primarySources.filter((s) => s.redirectedTo !== null)
    );
    for (const source of redirected) {
      expect(source.reachable).toBe(false);
      expect(source.redirectedTo).not.toBe(source.url);
    }
  });

  it('reports how much of the run was blocked rather than judged', () => {
    const stats = summarizeVerification(records);
    expect(stats.total).toBe(records.length);
    expect(stats.writable).toBe(records.filter(canBeWritten).length);
    expect(stats.unreachableSources).toBeGreaterThan(0);
  });
});
