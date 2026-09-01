import rawInbox from '@/data/news/inbox.json';
import rawTriage from '@/data/news/triage.json';
import rawVerification from '@/data/news/verification.json';
import rawDrafts from '@/data/news/drafts.json';
import {
  appendDecision as storeAppendDecision,
  publishItem,
  readApproved,
  readDecisions as storeReadDecisions,
  readSeed,
} from './newsroom-store';
import { requestRebuild } from '@lib/newsroom/trigger';
import {
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
import { type NewsItem } from '@lib/domain/news';
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


async function readDecisions(): Promise<DecisionRecord[]> {
  return storeReadDecisions();
}

/**
 * Lo publicado, venga de donde venga.
 *
 * La semilla versionada más lo que se haya aprobado desde la mesa. Las dos
 * fuentes se leen igual porque para el escritorio son lo mismo: una noticia que
 * un lector puede encontrar hoy.
 */
async function readPublished(): Promise<NewsItem[]> {
  const seed = readSeed();
  const approved = await readApproved();
  const bySlug = new Map(seed.map((item) => [item.slug, item]));
  for (const item of approved) if (!bySlug.has(item.slug)) bySlug.set(item.slug, item);
  return [...bySlug.values()];
}

export interface Desk {
  stories: DeskStory[];
  ready: DeskStory[];
  verification: DeskStory[];
  hold: DeskStory[];
  discarded: DeskStory[];
  counts: Record<DeskSection, number>;
}

export async function getDesk(): Promise<Desk> {
  const stories = buildDesk({
    inbox: rawInbox as Array<Record<string, unknown>>,
    triage: rawTriage as Array<Record<string, unknown>>,
    verification: rawVerification as VerificationRecordShape[],
    drafts: rawDrafts as DraftShape[],
    publishedSlugs: (await readPublished()).map((item) => item.slug),
    decisions: await readDecisions(),
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

export async function getStory(key: string): Promise<DeskStory | undefined> {
  return (await getDesk()).stories.find((story) => story.key === key);
}

export interface DecisionOutcome {
  ok: boolean;
  message: string;
  reasons?: string[];
  published?: boolean;
  slug?: string;
}

async function appendDecision(entry: DecisionRecord): Promise<void> {
  await storeAppendDecision(entry);
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
export async function decide(input: {
  key: string;
  action: NewsroomAction;
  actor: string;
  note?: string;
}): Promise<DecisionOutcome> {
  const { key, action, actor } = input;
  const note = input.note?.trim() ?? '';
  const story = await getStory(key);

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
    await appendDecision(entry);
    return {
      ok: true,
      message: action === 'reject' ? 'Descartada, con su motivo en el historial.' : 'En revisión.',
      published: false,
      slug: key,
    };
  }

  const allowed = canApprove(story);
  if (!allowed.ok) {
    return { ok: false, message: 'No se puede aprobar esta historia.', reasons: allowed.reasons };
  }

  /*
   * `canApprove` ya ha comprobado que existen; se repite porque esta es la
   * ruta de escritura y una aserción de tipo aquí sería el único sitio por el
   * que un null podría llegar a lo publicado.
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

  /*
   * Se valida el conjunto resultante antes de escribir nada. `canApprove`
   * pregunta si esta historia puede pasar; esto pregunta si el dataset sigue
   * siendo válido con ella dentro. Son preguntas distintas: un elemento puede
   * ser publicable por separado y chocar con algo que ya está.
   */
  const existing = await readPublished();
  const { items } = mergePublished(existing, item);
  const valid = validatesAfterMerge(items);

  if (!valid.ok) {
    return {
      ok: false,
      message: 'Publicar esto dejaría el dataset inválido. No se ha escrito nada.',
      reasons: valid.reasons,
    };
  }

  const { added, backend: donde } = await publishItem(item, actor);
  await appendDecision(entry);

  if (!added) {
    /* Aprobar dos veces no es un error: es una operación que no hace nada. */
    return {
      ok: true,
      message: 'Ya estaba publicada: no se ha duplicado.',
      published: true,
      slug: item.slug,
    };
  }

  /*
   * La noticia ya está guardada. El despliegue sólo decide cuándo se ve, así
   * que un hook que falla retrasa su aparición pero no deshace la aprobación —
   * y por eso se informa del fallo en lugar de lanzarlo.
   */
  const rebuild = await requestRebuild();

  return {
    ok: true,
    message: rebuild.ok
      ? 'Publicada. El sitio se está reconstruyendo; aparecerá en /noticias en unos minutos.'
      : donde === 'files'
        ? 'Publicada en news.json. Ejecuta `npm run data:news:validate` y revisa el diff antes de commitear.'
        : `Publicada y guardada, pero no se ha lanzado el despliegue: ${rebuild.detail}`,
    published: true,
    slug: item.slug,
  };
}

export { canApprove, latestDecision };
