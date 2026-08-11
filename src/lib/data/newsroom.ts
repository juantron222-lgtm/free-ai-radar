import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import rawInbox from '@/data/news/inbox.json';
import rawTriage from '@/data/news/triage.json';
import rawVerification from '@/data/news/verification.json';
import rawDrafts from '@/data/news/drafts.json';
import rawNews from '@/data/news/news.json';
import {
  DecisionLog,
  buildDesk,
  canApprove,
  deskSection,
  draftToNewsItem,
  latestDecision,
  mergePublished,
  validatesAfterMerge,
  type DecisionRecord,
  type DeskSection,
  type DeskStory,
  type NewsroomAction,
} from '@lib/domain/newsroom';
import { NewsItem } from '@lib/domain/news';
import type { DraftShape } from '../../../scripts/draft/drafts.d.mts';
import type { VerificationRecordShape } from '../../../scripts/verify/verification.d.mts';

/**
 * The desk's data access.
 *
 * The pipeline files are imported statically — they are committed, deterministic
 * build inputs, exactly like the catalogue. The decision log and the published
 * dataset are read from disk instead, because approving writes to them and a
 * static import would keep serving the version from the last build.
 *
 * This writes to the working tree, which means it works where the working tree
 * exists: locally. That is the intended shape of the tool, not a limitation
 * that snuck in — publishing is a commit, reviewed by a person, and a desk that
 * could write to production would be a way to skip that review.
 */

const NEWS_PATH = resolve(process.cwd(), 'src/data/news/news.json');
const DECISIONS_PATH = resolve(process.cwd(), 'src/data/news/decisions.json');

function readDecisions(): DecisionRecord[] {
  try {
    return DecisionLog.parse(JSON.parse(readFileSync(DECISIONS_PATH, 'utf-8')));
  } catch {
    /* No log yet, or an unreadable one: an empty desk history, never a crash. */
    return [];
  }
}

function readPublished(): NewsItem[] {
  try {
    return NewsItem.array().parse(JSON.parse(readFileSync(NEWS_PATH, 'utf-8')));
  } catch {
    return NewsItem.array().parse(rawNews);
  }
}

export interface Desk {
  stories: DeskStory[];
  ready: DeskStory[];
  verification: DeskStory[];
  hold: DeskStory[];
  discarded: DeskStory[];
  counts: Record<DeskSection, number>;
}

export function getDesk(): Desk {
  const stories = buildDesk({
    inbox: rawInbox as Array<Record<string, unknown>>,
    triage: rawTriage as Array<Record<string, unknown>>,
    verification: rawVerification as VerificationRecordShape[],
    drafts: rawDrafts as DraftShape[],
    publishedSlugs: readPublished().map((item) => item.slug),
    decisions: readDecisions(),
  });

  return {
    stories,
    ready: deskSection(stories, 'ready'),
    verification: deskSection(stories, 'verification'),
    hold: deskSection(stories, 'hold'),
    discarded: deskSection(stories, 'discarded'),
    counts: {
      ready: stories.filter((s) => s.section === 'ready').length,
      verification: stories.filter((s) => s.section === 'verification').length,
      hold: stories.filter((s) => s.section === 'hold').length,
      discarded: stories.filter((s) => s.section === 'discarded').length,
    },
  };
}

export function getStory(key: string): DeskStory | undefined {
  return getDesk().stories.find((story) => story.key === key);
}

export interface DecisionOutcome {
  ok: boolean;
  message: string;
  reasons?: string[];
  published?: boolean;
  slug?: string;
}

function appendDecision(entry: DecisionRecord): void {
  const log = [...readDecisions(), entry];
  writeFileSync(DECISIONS_PATH, `${JSON.stringify(DecisionLog.parse(log), null, 2)}\n`, 'utf-8');
}

/**
 * Apply a human decision.
 *
 * `approve` is the only branch that can write the published dataset, and it
 * refuses unless three separate things agree: the story may be approved, the
 * resulting item parses as a `NewsItem`, and the whole file still validates
 * afterwards. Anything else leaves `news.json` exactly as it was.
 *
 * `hold` and `reject` only append to the log. Nothing is deleted — a rejected
 * story keeps its place in the desk with the reason attached, which is what
 * makes "why did we not run this?" an answerable question in six months.
 */
export function decide(input: {
  key: string;
  action: NewsroomAction;
  actor: string;
  note?: string;
}): DecisionOutcome {
  const { key, action, actor } = input;
  const note = input.note?.trim() ?? '';
  const story = getStory(key);

  if (!story) {
    return { ok: false, message: `No hay ninguna historia con la clave "${key}".` };
  }

  const entry: DecisionRecord = {
    slug: key,
    action,
    actor,
    at: new Date().toISOString(),
    note,
  };

  if (action !== 'approve') {
    appendDecision(entry);
    return {
      ok: true,
      message: action === 'reject' ? 'Descartada, con su motivo en el historial.' : 'En revisión.',
      published: false,
      slug: key,
    };
  }

  const allowed = canApprove(story);
  if (!allowed.ok) {
    return {
      ok: false,
      message: 'No se puede aprobar esta historia.',
      reasons: allowed.reasons,
    };
  }

  /*
   * `canApprove` has already established these are present; the checks are
   * repeated because this is the write path and a type assertion here would be
   * the one place a null could reach the published file.
   */
  if (!story.draft || !story.verification) {
    return { ok: false, message: 'Faltan el borrador o la verificación.' };
  }

  const publishedAt = story.publishedAt;
  if (!publishedAt) {
    return {
      ok: false,
      message: 'La historia no tiene fecha de publicación del fabricante, y no se inventa.',
    };
  }

  let item: NewsItem;
  try {
    item = draftToNewsItem(story.draft, story.verification, publishedAt);
  } catch (error) {
    return {
      ok: false,
      message: 'El borrador no produce una noticia válida.',
      reasons: [error instanceof Error ? error.message : String(error)],
    };
  }

  const existing = readPublished();
  const { items, added } = mergePublished(existing, item);

  if (!added) {
    /* Approving twice is not an error, it is a no-op that says so. */
    appendDecision(entry);
    return {
      ok: true,
      message: 'Ya estaba publicada: no se ha duplicado.',
      published: true,
      slug: item.slug,
    };
  }

  const valid = validatesAfterMerge(items);
  if (!valid.ok) {
    return {
      ok: false,
      message: 'Publicar esto dejaría el dataset inválido. No se ha escrito nada.',
      reasons: valid.reasons,
    };
  }

  writeFileSync(NEWS_PATH, `${JSON.stringify(items, null, 2)}\n`, 'utf-8');
  appendDecision(entry);

  return {
    ok: true,
    message:
      'Publicada en news.json. Ejecuta `npm run data:news:validate` y revisa el diff antes de commitear.',
    published: true,
    slug: item.slug,
  };
}

export { canApprove, latestDecision };
