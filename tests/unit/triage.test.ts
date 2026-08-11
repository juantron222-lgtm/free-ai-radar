import { describe, expect, it } from 'vitest';
import rawInbox from '@/data/news/inbox.json';
import {
  THRESHOLDS,
  Triage,
  coverageGaps,
  detectEventClass,
  detectProduct,
  hardReject,
  readsAsCustomerStory,
  runTriage,
  sameEvent,
  scoreStory,
  summarizeTriage,
} from '../../scripts/triage/triage.mjs';
import type { InboxCandidateShape } from '../../scripts/radar/inbox.d.mts';

/**
 * Triage's test suite, and its regression net.
 *
 * The cases that matter most are the two the brief singled out: a product post
 * the radar rejected for starting with "How" must be recoverable, and a
 * customer story that starts the same way must not be. Those two are one
 * regex apart, so they are pinned here rather than left to judgement.
 */

function row(overrides: Partial<InboxCandidateShape> = {}): InboxCandidateShape {
  return {
    id: 'inbox-000000000001',
    title: 'Introducing a new model',
    url: 'https://openai.com/index/algo',
    canonicalUrl: 'openai.com/index/algo',
    publisher: 'openai.com',
    observedAt: '2026-08-11',
    publishedAt: '2026-08-10',
    discoveredVia: 's-005',
    vertical: 'sin-clasificar',
    status: 'discovered',
    reason: null,
    ...overrides,
  };
}

function judge(title: string, overrides: Partial<InboxCandidateShape> = {}) {
  const [record] = runTriage({ inbox: [row({ title, ...overrides })], triagedAt: '2026-08-11' });
  return record!;
}

describe('the "How" problem: one regex apart', () => {
  it('keeps a customer story rejected even though it names a product', () => {
    const record = judge('How Zapier transformed core marketing processes with ChatGPT Work');
    expect(record.triageDecision).toBe('reject');
    expect(readsAsCustomerStory(record.title)).toBe(true);
    expect(record.triageReasons.some((r) => r.reason.includes('caso de cliente'))).toBe(true);
  });

  it('rescues a product post the radar had rejected for starting with "How"', () => {
    const record = judge('How GPT-5.6 fuses frontier intelligence with frontier efficiency', {
      status: 'rejected',
      reason: 'caso de cliente',
    });
    expect(readsAsCustomerStory(record.title)).toBe(false);
    expect(record.triageDecision).not.toBe('reject');
    expect(record.overturnedRadar).toBe(true);
  });

  it('rejects the vendor narrating its own engineering', () => {
    expect(readsAsCustomerStory('How we built a realtime system for responsive voice AI')).toBe(
      true
    );
  });

  it('does not mistake a vendor imperative for a customer story', () => {
    /*
     * "Start building with X" and "<Company> moves faster with X" share a
     * shape and differ in voice. Getting this wrong would silently kill
     * genuine launches, which is the expensive direction of the mistake.
     */
    expect(readsAsCustomerStory('Start building with Nano Banana 2 Lite')).toBe(false);
    expect(readsAsCustomerStory('Deploy local agents everywhere with LFM2.5-2.6B')).toBe(false);
  });

  it('catches a customer story that never says "How"', () => {
    expect(readsAsCustomerStory('Australian Payments Plus moves faster with ChatGPT and Codex')).toBe(
      true
    );
    expect(judge('Model ML completes finance work more efficiently with GPT-5.6 Sol').triageDecision).toBe(
      'reject'
    );
  });
});

describe('events and products are not the same thing', () => {
  it('extracts the product a headline is about, normalised for grouping', () => {
    expect(detectProduct('GPT-5.6 is now the preferred model in Microsoft 365 Copilot')).toContain(
      'gpt-5.6'
    );
    expect(detectProduct('Introducing Claude Opus 5')).toContain('claude');
    /* No named product means nothing to group on, which must not become "". */
    expect(detectProduct('Our approach to bioresilience')).toBeNull();
  });

  it('keeps two different events about one product apart', () => {
    const launch = { product: 'gpt-5.6', eventClass: 'lanzamiento', publishedAt: '2026-07-01' };
    const arrival = { product: 'gpt-5.6', eventClass: 'disponibilidad', publishedAt: '2026-07-02' };
    expect(sameEvent(launch, arrival)).toBe(false);
  });

  it('does not converge a re-announcement weeks later', () => {
    expect(
      sameEvent(
        { product: 'gpt-5.6', eventClass: 'lanzamiento', publishedAt: '2026-07-01' },
        { product: 'gpt-5.6', eventClass: 'lanzamiento', publishedAt: '2026-07-20' }
      )
    ).toBe(false);
  });

  it('converges the same event reported by two sources', () => {
    const records = runTriage({
      inbox: [
        row({
          id: 'inbox-00000000000a',
          title: 'Introducing Gemini 3.5 Flash Cyber',
          canonicalUrl: 'blog.google/technology/gemini-35-flash',
          publisher: 'blog.google',
          publishedAt: '2026-07-10',
        }),
        row({
          id: 'inbox-00000000000b',
          title: 'Introducing Gemini 3.5 Flash Cyber for developers',
          canonicalUrl: 'developers.googleblog.com/gemini-35-flash',
          publisher: 'developers.googleblog.com',
          publishedAt: '2026-07-11',
        }),
      ],
      triagedAt: '2026-08-11',
    });

    const converged = records.filter((r) =>
      r.triageReasons.some((reason) => reason.axis === 'duplicidad')
    );
    expect(converged).toHaveLength(1);
    expect(converged[0]!.triageScore).toBeLessThan(records[0]!.triageScore);
  });

  it('does not converge two vendors announcing their own models', () => {
    const records = runTriage({
      inbox: [
        row({ id: 'inbox-00000000000c', title: 'Introducing Claude Opus 5', publishedAt: '2026-07-10' }),
        row({ id: 'inbox-00000000000d', title: 'Introducing Gemini 3.5 Flash', publishedAt: '2026-07-10' }),
      ],
      triagedAt: '2026-08-11',
    });
    expect(records.some((r) => r.triageReasons.some((x) => x.axis === 'duplicidad'))).toBe(false);
  });
});

describe('an announcement is not a launch', () => {
  it('scores availability below a shipped thing when the headline only announces', () => {
    const announced = scoreStory({
      title: 'Introducing Aurora, our new image model',
      canonicalUrl: 'openai.com/index/aurora',
    });
    const shipped = scoreStory({
      title: 'Aurora is now available to everyone',
      canonicalUrl: 'openai.com/index/aurora-ga',
    });

    const axis = (s: typeof announced, name: string) =>
      s.signals.find((x) => x.axis === name)!.points;

    expect(axis(announced, 'disponibilidad')).toBeLessThan(axis(shipped, 'disponibilidad'));
    expect(announced.eventClass).toBe('lanzamiento');
    expect(shipped.eventClass).toBe('disponibilidad');
  });

  it('treats a waitlist as the weakest availability there is', () => {
    const future = scoreStory({
      title: 'Aurora is coming soon — join the waitlist',
      canonicalUrl: 'openai.com/index/aurora-soon',
    });
    expect(future.eventClass).toBe('futuro');
    expect(future.signals.find((s) => s.axis === 'disponibilidad')!.points).toBeLessThanOrEqual(3);
  });

  it('reads a preview as a preview and not as general availability', () => {
    expect(detectEventClass('Aurora is available in research preview')).toBe('preview');
  });
});

describe('what gets refused outright', () => {
  it('refuses research with no usable product', () => {
    expect(hardReject('Towards a general intelligence for wearable health data')).toBe(
      'investigación sin producto utilizable'
    );
    expect(judge('Towards a general intelligence for wearable health data').triageDecision).toBe(
      'reject'
    );
  });

  it('refuses corporate positioning', () => {
    expect(judge('Our approach to government and national security partnerships').triageDecision).toBe(
      'reject'
    );
    expect(hardReject('We believe in a frontier company for America')).toBeTruthy();
  });

  it('refuses funding and alliances that ship nothing', () => {
    expect(hardReject('Anthropic raises Series F at a $600B valuation')).toBeTruthy();
    expect(hardReject('HP Inc. launches Frontier strategic partnership with OpenAI')).toBe(
      'alianza corporativa sin producto'
    );
  });

  it('refuses gaming and hardware marketing', () => {
    expect(hardReject('GeForce NOW Turns Up the Heat With New RTX 5080 Server')).toBeTruthy();
  });

  it('refuses programmes and contests', () => {
    expect(hardReject('GPT-5.5 Bio Bug Bounty')).toBeTruthy();
  });

  it('a refusal always carries its sentence, never only a number', () => {
    const record = judge('How Zapier transformed core marketing processes with ChatGPT Work');
    const refusal = record.triageReasons.find((r) => r.axis === 'descarte');
    expect(refusal).toBeDefined();
    expect(refusal!.reason.length).toBeGreaterThan(10);
  });
});

describe('what gets through', () => {
  it('promotes a real open-source launch', () => {
    const record = judge('Introducing Leanstral 1.5: open weights under Apache-2.0, available now', {
      canonicalUrl: 'mistral.ai/news/leanstral-1-5',
      publisher: 'mistral.ai',
    });
    expect(record.triageDecision).toBe('promote');
    expect(record.vertical).toBe('local-open-source');
  });

  it('promotes something that changes free access', () => {
    const record = judge('Claude Sonnet 5 is now the default model for the free plan', {
      canonicalUrl: 'anthropic.com/news/claude-sonnet-5',
      publisher: 'anthropic.com',
    });
    expect(record.triageDecision).toBe('promote');
    expect(record.triageReasons.find((r) => r.axis === 'plan-gratuito')!.points).toBeGreaterThan(10);
  });

  it('scores a minor patch below the hold threshold', () => {
    const record = judge('v0.32.7 bugfix release');
    expect(record.triageScore).toBeLessThan(THRESHOLDS.hold);
  });
});

describe('adoption statistics are not product news', () => {
  it('rejects a usage-growth story even when it names a product', () => {
    const record = judge('How ChatGPT adoption has expanded');
    expect(record.triageDecision).toBe('reject');
    expect(hardReject(record.title)).toContain('estadísticas de adopción');
  });

  it('does not confuse expanding access with expanding adoption', () => {
    /*
     * "Access" is a change to what a reader can do; "adoption" is a fact about
     * the vendor's business. The two words sit one letter apart in a headline
     * and a hundred points apart in what they are worth.
     */
    expect(hardReject('Expanding access to GPT-5.6 Luna for Plus and Pro')).toBeNull();
  });
});

describe('a vague promise is not a shipped change', () => {
  it('docks a headline that declares value without naming what changed', () => {
    const record = judge('ChatGPT is now a partner for your most ambitious work');
    expect(record.triageDecision).toBe('hold');
    const deduction = record.triageReasons.find((r) => r.axis === 'concreción');
    expect(deduction).toBeDefined();
    expect(deduction!.points).toBeLessThan(0);
  });

  it('leaves a concrete availability claim alone', () => {
    const record = judge('GPT-5.6 is now the preferred model in Microsoft 365 Copilot');
    expect(record.triageReasons.some((r) => r.axis === 'concreción')).toBe(false);
    expect(record.triageDecision).toBe('promote');
  });
});

describe('the release-artefact signal rescues without promoting', () => {
  it('lifts a real versioned open-source release out of the reject band', () => {
    const record = judge('LeRobot v0.6.0: Imagine, Evaluate, Improve');
    expect(record.triageDecision).toBe('hold');
    expect(record.triageReasons.find((r) => r.axis === 'artefacto')!.points).toBeGreaterThan(0);
  });

  it('credits official release notes from the url alone', () => {
    const record = judge('v0.32.6', {
      canonicalUrl: 'github.com/ollama/ollama/releases/tag/v0.32.6',
      publisher: 'github.com/ollama',
    });
    expect(record.triageReasons.find((r) => r.axis === 'artefacto')!.points).toBe(10);
  });

  it('never lets the artefact signal alone create a promote', () => {
    /*
     * The guard that matters: a routine point release must not outrank real
     * news just because it carries a tag. Anything that only clears 80 thanks
     * to this axis is capped at the top of the hold band, and says so.
     */
    const records = runTriage({ inbox: rawInbox as InboxCandidateShape[], triagedAt: '2026-08-11' });
    for (const record of records) {
      const artefact = record.triageReasons.find((r) => r.axis === 'artefacto')?.points ?? 0;
      if (record.triageDecision === 'promote') {
        expect(record.triageScore - artefact, record.title).toBeGreaterThanOrEqual(
          THRESHOLDS.promote
        );
      }
    }
  });

  it('records the cap as a reason rather than silently lowering a number', () => {
    const records = runTriage({ inbox: rawInbox as InboxCandidateShape[], triagedAt: '2026-08-11' });
    const capped = records.filter((r) => r.triageReasons.some((s) => s.axis === 'techo'));
    expect(capped.length).toBeGreaterThan(0);
    for (const record of capped) {
      expect(record.triageScore).toBe(THRESHOLDS.promote - 1);
      expect(record.triageDecision).toBe('hold');
    }
  });
});

describe('determinism', () => {
  it('produces identical decisions for identical input', () => {
    const inbox = rawInbox as InboxCandidateShape[];
    const first = runTriage({ inbox, triagedAt: '2026-08-11' });
    const second = runTriage({ inbox, triagedAt: '2026-08-11' });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('does not depend on the order the inbox happens to be in', () => {
    const inbox = rawInbox as InboxCandidateShape[];
    const forward = runTriage({ inbox, triagedAt: '2026-08-11' });
    const backward = runTriage({ inbox: [...inbox].reverse(), triagedAt: '2026-08-11' });
    expect(backward.map((r) => r.id)).toEqual(forward.map((r) => r.id));
    expect(backward.map((r) => r.triageScore)).toEqual(forward.map((r) => r.triageScore));
  });
});

describe('the record keeps the history', () => {
  const records = runTriage({ inbox: rawInbox as InboxCandidateShape[], triagedAt: '2026-08-11' });

  it('validates against the schema', () => {
    expect(() => Triage.parse(records)).not.toThrow();
  });

  it('every record says what the radar thought as well as what triage decided', () => {
    for (const record of records) {
      expect(record.radarStatus, record.id).toBeTruthy();
      expect(record.triageDecision, record.id).toBeTruthy();
      expect(record.triageReasons.length, record.id).toBeGreaterThan(0);
    }
  });

  it('the inbox is never modified by triage', () => {
    const before = JSON.stringify(rawInbox);
    runTriage({ inbox: rawInbox as InboxCandidateShape[], triagedAt: '2026-08-11' });
    expect(JSON.stringify(rawInbox)).toBe(before);
  });

  it('a rescue is recorded as a rescue', () => {
    for (const record of records.filter((r) => r.overturnedRadar)) {
      expect(record.radarStatus, record.id).toBe('rejected');
      expect(record.triageDecision, record.id).not.toBe('reject');
    }
  });

  it('no record carries an editorial state: triage does not publish', () => {
    for (const record of records) {
      expect(['promote', 'hold', 'reject'], record.id).toContain(record.triageDecision);
    }
  });
});

describe('coverage is reported, not enforced', () => {
  it('names the verticals with nothing usable instead of promoting filler', () => {
    const records = runTriage({ inbox: rawInbox as InboxCandidateShape[], triagedAt: '2026-08-11' });
    const gaps = coverageGaps(records, '2026-08-11');
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      expect(gap).toHaveProperty('vertical');
      expect(gap).toHaveProperty('daysWithout');
    }
    /* A vertical with nothing usable reports null rather than a fake zero. */
    const empty = gaps.filter((g) => g.usable === 0);
    for (const gap of empty) expect(gap.daysWithout).toBeNull();
  });

  it('a thin vertical does not lower the bar for its stories', () => {
    const mediocre = judge('Some video thing happened at a company');
    expect(mediocre.triageDecision).toBe('reject');
  });
});

describe('the shape of the run over the real inbox', () => {
  const records = runTriage({ inbox: rawInbox as InboxCandidateShape[], triagedAt: '2026-08-11' });
  const stats = summarizeTriage(records);

  it('narrows the inbox to something a human could actually verify', () => {
    const forHumans = (stats.byDecision.promote ?? 0) + (stats.byDecision.hold ?? 0);
    expect(forHumans).toBeGreaterThan(15);
    expect(forHumans).toBeLessThan(50);
  });

  it('rejects the clear majority, because the clear majority is not news', () => {
    expect((stats.byDecision.reject ?? 0) / stats.total).toBeGreaterThan(0.6);
  });
});
