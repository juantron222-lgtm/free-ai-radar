import { describe, expect, it } from 'vitest';
import rawInbox from '@/data/news/inbox.json';
import rawTriage from '@/data/news/triage.json';
import rawVerification from '@/data/news/verification.json';
import rawDrafts from '@/data/news/drafts.json';
import rawNews from '@/data/news/news.json';
import {
  buildDesk,
  canApprove,
  deskSection,
  draftToNewsItem,
  latestDecision,
  mergePublished,
  validatesAfterMerge,
  type DecisionRecord,
} from '@lib/domain/newsroom';
import { NewsItem, isPublishable } from '@lib/domain/news';
import type { DraftShape } from '../../scripts/draft/drafts.d.mts';
import type { VerificationRecordShape } from '../../scripts/verify/verification.d.mts';

/**
 * The desk, and the one action on it that is irreversible for a reader.
 *
 * Approval is the only path from the pipeline into `news.json`, so most of what
 * follows is about the ways it must refuse: an unverified source, a broken
 * trace, a story that never reached drafting, a second click on the same
 * button. A gate that has only been watched saying yes has not been tested.
 */

const verification = rawVerification as VerificationRecordShape[];
const drafts = rawDrafts as DraftShape[];
const published = NewsItem.array().parse(rawNews);

function desk(decisions: DecisionRecord[] = [], publishedSlugs = published.map((i) => i.slug)) {
  return buildDesk({
    inbox: rawInbox as Array<Record<string, unknown>>,
    triage: rawTriage as Array<Record<string, unknown>>,
    verification,
    drafts,
    publishedSlugs,
    decisions,
  });
}

const stories = desk();
const ready = deskSection(stories, 'ready');
const nano = ready.find((s) => s.key.startsWith('nano-banana'))!;

describe('the desk shows every stage of every story', () => {
  it('sorts stories into the four sections and loses none', () => {
    const total =
      deskSection(stories, 'ready').length +
      deskSection(stories, 'verification').length +
      deskSection(stories, 'hold').length +
      deskSection(stories, 'discarded').length;
    expect(total).toBe(stories.length);
    expect(stories.length).toBe((rawTriage as unknown[]).length + drafts.length - 1);
  });

  it('carries the radar verdict, the triage score and the verification together', () => {
    expect(nano.radar).not.toBeNull();
    expect(nano.triage!.score).toBeGreaterThan(0);
    expect(nano.verification!.decision).toBe('verified');
    expect(nano.draft).not.toBeNull();
    expect(nano.gate!.ok).toBe(true);
  });

  it('keeps a rejection reason visible instead of dropping the story', () => {
    const discarded = deskSection(stories, 'discarded');
    expect(discarded.length).toBeGreaterThan(0);
    for (const story of discarded.slice(0, 20)) {
      const hasReason =
        Boolean(story.radar?.reason) ||
        (story.triage?.reasons.length ?? 0) > 0 ||
        Boolean(story.decision);
      expect(hasReason, story.key).toBe(true);
    }
  });

  it('puts an insufficient verification in the verification section, not in ready', () => {
    const insufficient = verification.filter((r) => r.decision === 'insufficient');
    expect(insufficient.length).toBeGreaterThan(0);
    for (const record of insufficient) {
      const story = stories.find((s) => s.key === record.candidateId);
      expect(story?.section, record.candidateId).toBe('verification');
    }
  });
});

describe('approval refuses everything it should', () => {
  it('approves a verified story whose draft passes the gate', () => {
    expect(canApprove(nano).ok, canApprove(nano).reasons.join('; ')).toBe(true);
  });

  it('refuses a story whose verification is insufficient', () => {
    const blocked = stories.find(
      (s) => s.verification !== null && s.verification.decision === 'insufficient'
    )!;
    const check = canApprove(blocked);
    expect(check.ok).toBe(false);
    expect(check.reasons.join(' ')).toContain('insufficient');
  });

  it('refuses a story that is only on hold', () => {
    const hold = deskSection(stories, 'hold')[0]!;
    const check = canApprove(hold);
    expect(check.ok).toBe(false);
    expect(check.reasons.join(' ')).toContain('no hay borrador');
  });

  it('refuses a story that never reached drafting: radar cannot jump to published', () => {
    const raw = stories.find((s) => s.draft === null)!;
    expect(canApprove(raw).ok).toBe(false);
  });

  it('refuses a draft whose factTrace cites something nobody verified', () => {
    /*
     * The desk runs `checkDraft` itself, so the realistic way to test this is
     * to break the trace and re-derive the gate the same way the desk does.
     */
    const broken = buildDesk({
      inbox: rawInbox as Array<Record<string, unknown>>,
      triage: rawTriage as Array<Record<string, unknown>>,
      verification,
      drafts: drafts.map((draft) =>
        draft.slug === nano.key
          ? { ...draft, factTrace: { ...draft.factTrace, summary: ['Una cita inventada'] } }
          : draft
      ),
      publishedSlugs: [],
      decisions: [],
    }).find((s) => s.key === nano.key)!;

    expect(broken.gate!.ok).toBe(false);
    const check = canApprove(broken);
    expect(check.ok).toBe(false);
    expect(check.reasons.join(' ')).toContain('puerta editorial');
  });

  it('refuses a story that is already published', () => {
    const already = desk([], [...published.map((i) => i.slug), nano.key]).find(
      (s) => s.key === nano.key
    )!;
    expect(canApprove(already).ok).toBe(false);
    expect(canApprove(already).reasons.join(' ')).toContain('ya está publicada');
  });
});

describe('approval produces a valid news item', () => {
  const item = draftToNewsItem(nano.draft!, nano.verification!, nano.publishedAt!);

  it('parses against the editorial schema', () => {
    expect(() => NewsItem.parse(item)).not.toThrow();
  });

  it('passes the publication gate the site enforces at build time', () => {
    const check = isPublishable(item);
    expect(check.ok, check.reasons.join('; ')).toBe(true);
  });

  it('takes the date from the vendor, never from today', () => {
    expect(item.publishedAt).toBe(nano.publishedAt);
    expect(item.checkedAt).toBe(nano.verification!.checkedAt);
  });

  it('is deterministic: the same draft always yields the same record', () => {
    const again = draftToNewsItem(nano.draft!, nano.verification!, nano.publishedAt!);
    expect(JSON.stringify(again)).toBe(JSON.stringify(item));
  });

  it('carries no invented free-plan claim', () => {
    expect(item.affectsFreePlan).toBe(nano.draft!.affectsFreePlan);
  });
});

describe('approving twice does not publish twice', () => {
  const item = draftToNewsItem(nano.draft!, nano.verification!, nano.publishedAt!);

  it('adds the item the first time', () => {
    const { items, added } = mergePublished(published, item);
    expect(added).toBe(true);
    expect(items).toHaveLength(published.length + 1);
  });

  it('is a no-op the second time', () => {
    const first = mergePublished(published, item);
    const second = mergePublished(first.items, item);
    expect(second.added).toBe(false);
    expect(second.items).toHaveLength(first.items.length);
  });

  it('does not rewrite what readers have already seen', () => {
    const first = mergePublished(published, item);
    const edited = { ...item, title: 'Un titular distinto' };
    const second = mergePublished(first.items, edited);
    expect(second.added).toBe(false);
    expect(second.items.find((i) => i.slug === item.slug)!.title).toBe(item.title);
  });

  it('keeps the merged dataset valid and newest-first', () => {
    const { items } = mergePublished(published, item);
    const check = validatesAfterMerge(items);
    expect(check.ok, check.reasons.join('; ')).toBe(true);
    const dates = items.map((i) => i.publishedAt);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });

  it('refuses a merge that would break the dataset', () => {
    const clash = { ...item, slug: published[0]!.slug, id: 'news-otro-id' };
    const { items } = mergePublished(published, clash);
    /* Same slug, so the merge is a no-op — the dataset never becomes invalid. */
    expect(items).toHaveLength(published.length);
  });
});

describe('the decision log keeps the history', () => {
  const log: DecisionRecord[] = [
    { slug: 'una-historia', action: 'hold', actor: 'a@b.c', at: '2026-08-11T10:00:00.000Z', note: '' },
    {
      slug: 'una-historia',
      action: 'reject',
      actor: 'a@b.c',
      at: '2026-08-11T11:00:00.000Z',
      note: 'No aporta nada nuevo',
    },
  ];

  it('returns the most recent decision without discarding the earlier ones', () => {
    expect(latestDecision(log, 'una-historia')!.action).toBe('reject');
    expect(log).toHaveLength(2);
  });

  it('returns nothing for a story nobody has decided on', () => {
    expect(latestDecision(log, 'otra-historia')).toBeNull();
  });

  it('a rejected story moves to discarded but keeps its reason', () => {
    const rejected: DecisionRecord = {
      slug: nano.key,
      action: 'reject',
      actor: 'a@b.c',
      at: '2026-08-11T12:00:00.000Z',
      note: 'Lo dejamos para más adelante',
    };
    const story = desk([rejected]).find((s) => s.key === nano.key)!;
    expect(story.section).toBe('discarded');
    expect(story.decision!.note).toBe('Lo dejamos para más adelante');
    /* Still there, with its draft and its verification intact. */
    expect(story.draft).not.toBeNull();
    expect(story.verification).not.toBeNull();
  });
});

describe('the desk is not reachable without being an admin', () => {
  async function post(role: string | null) {
    const { POST } = await import('../../src/pages/api/admin/newsroom');
    const body = new FormData();
    body.set('key', nano.key);
    body.set('action', 'approve');

    const context = {
      locals: role === null ? { user: null } : { user: { id: 'u1', email: 'a@b.c', role } },
      url: new URL('https://example.test/api/admin/newsroom'),
      request: new Request('https://example.test/api/admin/newsroom', { method: 'POST', body }),
      cookies: { get: () => undefined },
    };

    return POST(context as unknown as Parameters<typeof POST>[0]);
  }

  it('refuses an anonymous request', async () => {
    expect((await post(null)).status).toBe(404);
  });

  it('refuses a signed-in reader', async () => {
    expect((await post('user')).status).toBe(404);
  });

  it('refuses an editor: publishing is not an editor’s call', async () => {
    expect((await post('editor')).status).toBe(404);
  });

  it('answers 404 rather than 403, so nobody learns the endpoint exists', async () => {
    const response = await post('user');
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('admin');
  });

  it('lets an admin past the role check and on to the CSRF one', async () => {
    /*
     * Not a 404: the role check passed. It stops at CSRF instead, which is the
     * next guard and exactly where an admin without a valid token should stop.
     */
    const response = await post('admin');
    expect(response.status).not.toBe(404);
    expect(response.status).toBe(403);
  });
});

describe('news.json stays the only published source', () => {
  it('the desk never marks a story published from anything but news.json', () => {
    const withoutNews = desk([], []);
    for (const story of withoutNews) expect(story.published).toBe(false);
  });

  it('the pipeline files contain nothing in a published state', () => {
    for (const draft of drafts) expect(draft.status).toBe('draft');
    for (const record of verification) {
      expect(['verified', 'insufficient', 'contradicted']).toContain(record.decision);
    }
  });

  it('every currently published item still passes its own gate', () => {
    for (const item of published.filter((i) => i.status === 'published')) {
      expect(isPublishable(item).ok, item.slug).toBe(true);
    }
  });
});
