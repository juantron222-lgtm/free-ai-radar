import { z } from 'zod';

/**
 * Triage: deciding what is worth the cost of verification.
 *
 * The radar answers "is this a thing?" with regexes over a headline. Triage
 * answers "is this worth a human opening the vendor's page?", which is a
 * different question and cannot be answered by the same flat pattern list.
 *
 * Two properties matter more than the scoring itself:
 *
 * 1. **Triage can overturn the radar.** A radar `rejected` is a cheap guess,
 *    not a verdict. `^How` catches four customer stories for every product post
 *    it wrongly eats, which makes it a good filter and a terrible judge.
 *
 * 2. **Nothing is overwritten.** Triage writes its own file keyed by inbox id.
 *    What the radar found, what the radar thought, what triage decided and why
 *    all remain separately readable afterwards.
 *
 * Everything here is deterministic. Given the same inbox it produces the same
 * decisions, which is what makes a regression test meaningful.
 */

export const TriageDecision = z.enum(['promote', 'hold', 'reject']);

export const TriageSignal = z.object({
  axis: z.string().min(1),
  points: z.number(),
  max: z.number(),
  reason: z.string().min(1),
});

export const TriageRecord = z.object({
  /** The inbox row this judges. The inbox itself is never modified. */
  id: z.string().min(1),
  title: z.string().min(1),
  canonicalUrl: z.string().min(1),
  publisher: z.string().min(1),
  publishedAt: z.string().nullable(),

  /** What the radar thought, kept so disagreement stays visible. */
  radarStatus: z.string().min(1),
  radarReason: z.string().nullable(),
  radarVertical: z.string().min(1),

  /** Triage's own reading, which may differ from the radar's. */
  vertical: z.string().min(1),
  eventClass: z.string().min(1),
  product: z.string().nullable(),

  triageDecision: TriageDecision,
  triageScore: z.number().min(0).max(100),
  triageReasons: z.array(TriageSignal).min(1),

  /** True when triage rescued something the radar had set aside. */
  overturnedRadar: z.boolean(),
  triagedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const Triage = z.array(TriageRecord);

/* ------------------------------------------------------------- semantics -- */

/**
 * Named products and model families.
 *
 * Used to tell what a headline is *about*, which is what separates "How
 * <product> does <thing>" — a product post — from "How <company> did <thing>
 * with <product>" — a customer story. The radar cannot make that distinction
 * because it never looks at what follows the first word.
 */
const PRODUCT_TOKEN =
  /\b(gpt-?[\d.]+(?:\s+\w+)?|chatgpt|codex|claude(?:\s+\w+)?|gemini(?:\s+\w+)?|gemma\s*\d*|llama\s*[\d.]*|mistral\w*|qwen[\d.]*|deepseek\w*|nemotron[\d.\s\w]*|sora\s*\d*|veo\s*\d*|lyria\s*[\d.]*|whisper|flux(?:\.\d)?|stable diffusion|ollama|nano banana(?:\s+\d+)?(?:\s+lite)?|lfm[\d.\w-]*|muse glimmer|bionemo|nemo\s+\w+)\b/i;

const LAUNCH_VERB = /\b(introducing|announcing|launch(?:ing|es|ed)?|meet|unveil\w*|we['’]?re launching|presenting)\b/i;
const AVAILABILITY_NOW = /\b(now available|generally available|now in|is now|comes to|arrives? (?:in|on)|expanding access|start building|available today|rolling out)\b/i;
const PREVIEW_MARKER = /\b(preview|beta|early access|experimental|research preview|alpha)\b/i;
const FUTURE_MARKER = /\b(coming soon|waitlist|sign up to be notified|later this year|will be available)\b/i;
const UPDATE_MARKER = /\b(improv\w+|updat\w+|faster|better|smarter|v?\d+\.\d+(?:\.\d+)?|upgrade\w*|advanc\w+|expand\w+)\b/i;
const RETIREMENT_MARKER = /\b(deprecat\w+|sunset\w*|removed|retir\w+|discontinu\w+|shutting down|end of life)\b/i;
const MINOR_MARKER = /\b(bug ?fix\w*|patch|hotfix|minor (?:fix|update|release)|typo|regression fix)\b/i;

const FREE_MARKER = /\b(free|no cost|open[- ]weights?|open[- ]sourc\w+|apache[- ]?2|mit licen[cs]e|gguf|self-host\w*|download\w*|locally|on-device)\b/i;
const PAID_MARKER = /\b(enterprise|per (?:million|1,?000|seat|month)|pricing|\$\d|subscription|contact sales|business plan)\b/i;

const PRODUCT_CLASS_MAJOR = /\b(model|agent\w*|api\b|assistant|runtime|foundation model)\b/i;
const PRODUCT_CLASS_TOOL = /\b(sdk|cli\b|library|toolkit|extension|plugin|integration|backend|framework)\b/i;

/** Verbs that mark a third party doing something, not a vendor shipping. */
const CUSTOMER_VERB = /\b(transform\w+|built|builds|building|adopt\w*|migrat\w+|scal(?:es|ed|ing)|deploy\w+|rolled out|uses?|using|powers?|saves?|reduc\w+|moves? faster|completes?|streamlin\w+|cuts?|boosts?|improv\w+ (?:their|its))\b/i;

/**
 * Openers that put a headline in the vendor's own voice.
 *
 * "Start building with Nano Banana 2" and "Australian Payments Plus moves
 * faster with ChatGPT" have the same `<verb> … with <product>` shape, and only
 * the second is a customer story. The difference is the subject: an imperative
 * has none, so the sentence is the vendor addressing the reader, not a company
 * describing what it did.
 */
const VENDOR_IMPERATIVE =
  /^(start|build|deploy|get|try|meet|use|run|create|explore|discover|introducing|announcing|launching|improving|advancing|expanding|bringing|scaling|presenting)\b/i;

const CORPORATE_VAPOR = /\b(our (?:company|mission|values|approach|position|data strategy)|company transformation|for america|we believe|the latest in our|frontier company)\b/i;

const RESEARCH_MARKER = /\b(towards?|a study of|we investigate|paper|benchmark\w*|evaluation\w*|epidemiology|dataset for research)\b/i;

const FUNDING_MARKER = /\b(funding|raises|series [a-e]\b|investment round|valuation|acquir\w+)\b/i;
const ALLIANCE_MARKER = /\b(partners? with|partnership|in collaboration with|collaborat\w+ with|joint venture)\b/i;
const GAMING_MARKER = /\b(geforce|rtx\s*\d|dlss|game ready|gaming|new games|omniverse|workstation)\b/i;
const PROGRAM_MARKER = /\b(bug bounty|hackathon|grants?|fellowship|competition|contest|challenge)\b/i;

/**
 * Adoption and usage statistics.
 *
 * How many people use a thing is a fact about the vendor's business, not about
 * the thing. Nothing in "adoption has expanded" tells a reader whether the
 * product, its price, its access or its limits changed — and those are the only
 * four reasons this site covers anything. Kept separate from corporate
 * positioning so the log says which of the two it was.
 */
const ADOPTION_MARKER =
  /\b(adoption|usage (?:data|report|statistics|trends)|(?:weekly|monthly|daily) active|users? milestone|reached \d+ ?(?:m|million|bn|billion)|now serves \d)\b/i;

/**
 * Headlines that sell a feeling instead of naming a change.
 *
 * "ChatGPT is now a partner for your most ambitious work" declares availability
 * without saying what became available. The grammar of a shipped change is
 * there and the substance is not, which is precisely the case where a score
 * built on availability markers overrates a story.
 */
const MARKETING_ABSTRACTION =
  /\b(most ambitious|ambitious work|transformative|reimagin\w+|the future of|a new era|new possibilities|unlock your|empower\w*|supercharge|game[- ]chang\w+|next chapter)\b/i;

/**
 * Evidence that something concrete was actually shipped.
 *
 * A tagged release, a changelog, downloadable weights or a package are the
 * cheapest honest proof that a story is about an artefact rather than about a
 * plan. This is deliberately bounded: it is enough to lift a real open-source
 * release out of the reject band, and not enough to turn a routine technical
 * update into a promote on its own.
 */
const VERSIONED_RELEASE = /\bv?\d+\.\d+(?:\.\d+)?\b/;
const RELEASE_PATH = /\/(releases|tag|changelog|commits?)\b/;
const USABLE_ARTIFACT =
  /\b(repo|repositor\w+|weights?|checkpoints?|model card|package|pip install|npm|docker|gguf|download\w*|open[- ]sourc\w+|apache|mit licen[cs]e)\b/i;

const VERTICAL_PATTERNS = [
  { vertical: 'video', test: /\b(videos?|text-to-video|sora|veo\s*\d|runway|animation)\b/i },
  { vertical: 'audio', test: /\b(audio|speech|voices?|music|text-to-speech|tts|asr|whisper|transcription|lyria)\b/i },
  { vertical: 'imagen', test: /\b(image generation|text-to-image|diffusion|imagen|dall-?e|flux|stable diffusion|inpainting|nano banana)\b/i },
  { vertical: 'agentes', test: /\b(agents?|agentic|tool use|tool calling|mcp|model context protocol|computer use)\b/i },
  { vertical: 'multimodal', test: /\b(multimodal|vision|ocr|document intelligence|robotics?|embodied)\b/i },
  { vertical: 'local-open-source', test: /\b(open[- ]sourc\w+|open[- ]weights?|gguf|quantiz\w+|ollama|llama\.cpp|self-host\w*|local)\b/i },
  { vertical: 'modelo-lenguaje', test: /\b(gpt-?\d|chatgpt|claude|gemini|gemma|llama\s*\d|mistral|qwen|deepseek|language models?|llms?|reasoning models?|nemotron)\b/i },
  { vertical: 'herramientas', test: /\b(sdks?|cli|apis?|changelogs?|release notes|v?\d+\.\d+|developers?|extensions?|plugins?|toolkit)\b/i },
];

export function detectVertical(title) {
  for (const { vertical, test } of VERTICAL_PATTERNS) {
    if (test.test(String(title ?? ''))) return vertical;
  }
  return 'sin-clasificar';
}

/** The product a headline is about, normalised for grouping. */
export function detectProduct(title) {
  const match = String(title ?? '').match(PRODUCT_TOKEN);
  return match ? match[0].toLowerCase().replace(/\s+/g, ' ').trim() : null;
}

/**
 * What kind of event a headline describes.
 *
 * Ordered by how much it tells a reader: a retirement and a launch are both
 * more informative than "something improved", so they win when a headline
 * carries several markers at once.
 */
export function detectEventClass(title) {
  const text = String(title ?? '');
  if (RETIREMENT_MARKER.test(text)) return 'retirada';
  if (FUTURE_MARKER.test(text)) return 'futuro';
  if (PREVIEW_MARKER.test(text)) return 'preview';
  if (LAUNCH_VERB.test(text)) return 'lanzamiento';
  if (AVAILABILITY_NOW.test(text)) return 'disponibilidad';
  if (UPDATE_MARKER.test(text)) return 'actualizacion';
  return 'indeterminado';
}

/**
 * Whether a "How …" headline is about a product or about somebody's project.
 *
 * This is the single most consequential judgement in the module, because the
 * radar rejects every headline starting with "How" and triage is the only
 * thing that can give one back.
 *
 * The test is what the sentence is *about*: "How GPT-5.6 fuses …" has a product
 * as its subject, while "How Zapier transformed … with ChatGPT" has a company
 * as its subject and mentions the product only as the tool it used. The
 * "with <product>" construction is the tell, and so is a customer verb applied
 * to a subject that is not itself a product.
 */
export function readsAsCustomerStory(title) {
  const text = String(title ?? '').trim();

  /* The vendor speaking in its own voice is never a customer story. */
  if (VENDOR_IMPERATIVE.test(text)) return false;

  if (/^how\b/i.test(text)) {
    const afterHow = text.replace(/^how\s+/i, '');

    /* "How we built …" is the vendor narrating engineering, not shipping. */
    if (/^(we|our|i)\b/i.test(afterHow)) return true;

    const subjectIsProduct = PRODUCT_TOKEN.test(afterHow.split(/\s+/).slice(0, 3).join(' '));
    if (subjectIsProduct) {
      /* Still a customer story if the product appears only as the instrument. */
      return /\bwith\s+(?:a\s+|an\s+|the\s+)?\w/i.test(afterHow) && CUSTOMER_VERB.test(afterHow);
    }

    return true;
  }

  /*
   * The same story without the "How".
   *
   * "Australian Payments Plus moves faster with ChatGPT and Codex" is a
   * customer story that opens with a company instead of a question word, and
   * the radar's `^How` rule cannot see it. What gives it away is the shape:
   * somebody who is not a product does something, *with* a product.
   */
  const beforeWith = text.split(/\bwith\b/i)[0] ?? '';
  const afterWith = text.slice(beforeWith.length);
  if (!afterWith || !PRODUCT_TOKEN.test(afterWith)) return false;
  if (PRODUCT_TOKEN.test(beforeWith)) return false;

  return CUSTOMER_VERB.test(beforeWith);
}

/* ---------------------------------------------------------------- scoring -- */

function signal(axis, points, max, reason) {
  return { axis, points, max, reason };
}

/**
 * The eight axes, each producing points and the sentence explaining them.
 *
 * The reasons are the product here. A score of 71 tells nobody anything; "no
 * dice si se puede usar hoy" tells the next reader what to go and check.
 */
export function scoreStory(story) {
  const title = story.title ?? '';
  const eventClass = detectEventClass(title);
  const vertical = detectVertical(title);
  const signals = [];

  /* 1 — Novelty. */
  if (MINOR_MARKER.test(title)) {
    signals.push(signal('novedad', 2, 15, 'corrección menor, no algo nuevo'));
  } else if (eventClass === 'lanzamiento' || eventClass === 'preview') {
    signals.push(signal('novedad', 15, 15, 'presenta algo que no existía antes'));
  } else if (eventClass === 'retirada') {
    signals.push(signal('novedad', 12, 15, 'retira algo que existía: cambia lo que se puede usar'));
  } else if (eventClass === 'disponibilidad') {
    signals.push(signal('novedad', 10, 15, 'algo ya anunciado cambia de disponibilidad'));
  } else if (eventClass === 'actualizacion') {
    signals.push(signal('novedad', 8, 15, 'actualización de algo existente'));
  } else {
    signals.push(signal('novedad', 3, 15, 'no se aprecia novedad concreta en el titular'));
  }

  /* 2 — Impact on someone who wants to use it. */
  const named = detectProduct(title);
  if (CORPORATE_VAPOR.test(title)) {
    signals.push(signal('impacto', 0, 20, 'no hay nada que el lector pueda usar: es posicionamiento'));
  } else if (AVAILABILITY_NOW.test(title) || FREE_MARKER.test(title)) {
    signals.push(signal('impacto', 20, 20, 'hay algo concreto que se puede usar, probar o descargar'));
  } else if (PREVIEW_MARKER.test(title)) {
    signals.push(signal('impacto', 13, 20, 'se puede probar, con acceso restringido'));
  } else if (FUTURE_MARKER.test(title)) {
    signals.push(signal('impacto', 6, 20, 'todavía no hay nada que usar: es futuro'));
  } else if (eventClass === 'lanzamiento') {
    signals.push(signal('impacto', 12, 20, 'lanzamiento, pero el titular no dice si ya se puede usar'));
  } else if (named) {
    /*
     * A named product is a concrete artefact even when the headline says
     * nothing about availability. Scoring this as "nothing actionable" confuses
     * "the headline does not tell me" with "there is nothing there", and it is
     * what would sink a genuine product post the radar had already rejected.
     */
    signals.push(signal('impacto', 10, 20, `nombra un producto concreto ("${named}") aunque no diga qué cambia`));
  } else {
    signals.push(signal('impacto', 4, 20, 'no se aprecia nada accionable'));
  }

  /* 3 — The free plan. */
  if (FREE_MARKER.test(title)) {
    signals.push(signal('plan-gratuito', 15, 15, 'menciona gratuidad, pesos abiertos o ejecución local'));
  } else if (PREVIEW_MARKER.test(title)) {
    signals.push(signal('plan-gratuito', 8, 15, 'una preview suele abrirse sin coste, por confirmar'));
  } else if (PAID_MARKER.test(title)) {
    signals.push(signal('plan-gratuito', 2, 15, 'apunta a producto de pago o empresarial'));
  } else {
    signals.push(signal('plan-gratuito', 6, 15, 'el titular no dice nada del acceso gratuito'));
  }

  /* 4 — How significant the thing itself is. */
  if (MINOR_MARKER.test(title)) {
    signals.push(signal('importancia', 2, 15, 'arreglo menor'));
  } else if (PRODUCT_CLASS_MAJOR.test(title)) {
    signals.push(signal('importancia', 15, 15, 'modelo, agente o API: categoría mayor'));
  } else if (named) {
    signals.push(signal('importancia', 12, 15, `producto con nombre propio ("${named}")`));
  } else if (PRODUCT_CLASS_TOOL.test(title)) {
    signals.push(signal('importancia', 10, 15, 'herramienta, SDK o integración'));
  } else if (/\bv?\d+\.\d+/.test(title)) {
    signals.push(signal('importancia', 8, 15, 'versión concreta de un producto existente'));
  } else {
    signals.push(signal('importancia', 5, 15, 'no se identifica la categoría del producto'));
  }

  /* 5 — Availability, kept distinct from announcement. */
  if (AVAILABILITY_NOW.test(title)) {
    signals.push(signal('disponibilidad', 15, 15, 'declara disponibilidad efectiva'));
  } else if (PREVIEW_MARKER.test(title)) {
    signals.push(signal('disponibilidad', 10, 15, 'preview o beta: disponible con límites'));
  } else if (FUTURE_MARKER.test(title)) {
    signals.push(signal('disponibilidad', 3, 15, 'anuncio de algo futuro, sin disponibilidad'));
  } else if (eventClass === 'lanzamiento') {
    signals.push(signal('disponibilidad', 7, 15, 'anuncio sin afirmar disponibilidad: hay que comprobarlo'));
  } else if (CORPORATE_VAPOR.test(title)) {
    signals.push(signal('disponibilidad', 0, 15, 'no hay producto del que hablar de disponibilidad'));
  } else {
    signals.push(signal('disponibilidad', 5, 15, 'el titular no permite saber la disponibilidad'));
  }

  /* 6 — Does it belong on this site at all. */
  if (vertical === 'sin-clasificar') {
    signals.push(signal('relevancia', 2, 10, 'no encaja en ninguna vertical del radar'));
  } else {
    signals.push(signal('relevancia', 10, 10, `encaja en la vertical "${vertical}"`));
  }

  /* 7 — How strong the link is as a source. */
  const path = String(story.canonicalUrl ?? '').split('/').slice(1).filter(Boolean);
  if (/\/(releases|tag|changelog)\b/.test(story.canonicalUrl ?? '')) {
    signals.push(signal('fuente', 9, 10, 'notas de versión o changelog oficial'));
  } else if (path.length >= 2) {
    signals.push(signal('fuente', 10, 10, 'entrada específica del blog oficial'));
  } else if (path.length === 1) {
    signals.push(signal('fuente', 6, 10, 'página oficial poco específica'));
  } else {
    signals.push(signal('fuente', 3, 10, 'índice genérico: no identifica el anuncio'));
  }

  /* 9 — Was anything actually shipped, and can it be got hold of. */
  const url = String(story.canonicalUrl ?? '');
  if (RELEASE_PATH.test(url)) {
    signals.push(signal('artefacto', 10, 10, 'notas de versión oficiales: hay una release concreta'));
  } else if (VERSIONED_RELEASE.test(title) && USABLE_ARTIFACT.test(title)) {
    signals.push(signal('artefacto', 10, 10, 'versión publicada con artefacto descargable o repositorio'));
  } else if (VERSIONED_RELEASE.test(title)) {
    signals.push(signal('artefacto', 7, 10, 'versión concreta publicada'));
  } else if (USABLE_ARTIFACT.test(title)) {
    signals.push(signal('artefacto', 5, 10, 'menciona un artefacto utilizable'));
  } else {
    signals.push(signal('artefacto', 0, 10, 'no consta que se haya publicado nada descargable'));
  }

  /*
   * 10 — Concreteness, as a deduction.
   *
   * Applied last and only downwards. A vague benefit claim does not make a
   * story false, it makes it unwritable: there is nothing to verify against a
   * vendor page. Docking it here keeps such a story available for a human to
   * look at, without letting the availability grammar push it to the front.
   */
  if (MARKETING_ABSTRACTION.test(title)) {
    signals.push(signal('concreción', -15, 0, 'promesa vaga: declara valor sin nombrar qué ha cambiado'));
  }

  const score = signals.reduce((sum, s) => sum + s.points, 0);
  return { score, signals, eventClass, vertical, product: detectProduct(title) };
}

/* --------------------------------------------------------- hard overrides -- */

/**
 * Noise classes that survive a semantic read.
 *
 * These are not scored down, they are refused: a funding round does not become
 * relevant by also mentioning a model. Each returns the sentence that will be
 * stored, so a later reader sees the rule and not just the outcome.
 */
export function hardReject(title) {
  const text = String(title ?? '');
  if (readsAsCustomerStory(text)) return 'caso de cliente: la historia trata de quién lo usa, no de qué cambia';
  if (FUNDING_MARKER.test(text)) return 'financiación o adquisición: no cambia nada utilizable';
  /*
   * A launch verb does not redeem an alliance: "HP launches a strategic
   * partnership with OpenAI" is still a partnership. What would redeem it is a
   * named product actually being launched, so that is what the test looks for.
   */
  if (ALLIANCE_MARKER.test(text) && !detectProduct(text)) return 'alianza corporativa sin producto';
  if (GAMING_MARKER.test(text)) return 'gaming o hardware fuera del alcance del radar';
  if (PROGRAM_MARKER.test(text)) return 'concurso o programa, no un cambio de producto';
  if (ADOPTION_MARKER.test(text)) {
    return 'estadísticas de adopción: no demuestran cambio de producto, acceso, precio ni función';
  }
  if (CORPORATE_VAPOR.test(text)) return 'opinión corporativa sin producto';
  if (RESEARCH_MARKER.test(text) && !LAUNCH_VERB.test(text) && !FREE_MARKER.test(text)) {
    return 'investigación sin producto utilizable';
  }
  return null;
}

/* ------------------------------------------------------ semantic dedupe -- */

function daysApart(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/**
 * Whether two stories are the same event.
 *
 * Same product is not enough — that is the mistake worth avoiding. A launch and
 * a later arrival on another platform are two events about one product, and
 * collapsing them loses the second. Convergence needs the same product, the
 * same kind of event, and dates close enough to be one announcement.
 */
export function sameEvent(a, b) {
  if (!a.product || !b.product || a.product !== b.product) return false;
  if (a.eventClass !== b.eventClass) return false;
  return daysApart(a.publishedAt, b.publishedAt) <= 2;
}

/* -------------------------------------------------------------- pipeline -- */

export const THRESHOLDS = { promote: 80, hold: 55 };

function decide(score) {
  if (score >= THRESHOLDS.promote) return 'promote';
  if (score >= THRESHOLDS.hold) return 'hold';
  return 'reject';
}

/**
 * Triage the whole inbox.
 *
 * Radar status is read but never obeyed: a `rejected` row is scored exactly
 * like any other, which is what allows a rescue. What the radar thought is
 * copied into the record so the disagreement is inspectable afterwards.
 */
export function runTriage({ inbox, triagedAt }) {
  const records = [];
  const seen = [];

  /* Stable order so convergence resolves the same way on every run. */
  const ordered = [...inbox].sort((a, b) => {
    if (a.publishedAt !== b.publishedAt) {
      if (!a.publishedAt) return 1;
      if (!b.publishedAt) return -1;
      return b.publishedAt.localeCompare(a.publishedAt);
    }
    return a.id.localeCompare(b.id);
  });

  for (const row of ordered) {
    const { score, signals, eventClass, vertical, product } = scoreStory(row);
    const reasons = [...signals];
    let finalScore = score;

    const refusal = hardReject(row.title);
    if (refusal) {
      reasons.push(signal('descarte', -finalScore, 0, refusal));
      finalScore = 0;
    }

    const story = { product, eventClass, publishedAt: row.publishedAt };
    if (!refusal) {
      const twin = seen.find((other) => sameEvent(other, story));
      if (twin) {
        reasons.push(
          signal('duplicidad', -25, 0, `mismo acontecimiento que "${twin.title}", ya evaluado`)
        );
        finalScore = Math.max(0, finalScore - 25);
      }
    }

    finalScore = Math.max(0, Math.min(100, finalScore));

    /*
     * The artefact signal can rescue, but it cannot promote.
     *
     * Its job is to stop a real versioned release from being rejected for
     * having an unexciting headline. Letting it also carry a story across the
     * promote line would mean the mere existence of a tag decided what a human
     * verifies next, and every routine point release would queue up ahead of
     * genuine news. So: if the story only clears the bar because of this axis,
     * it stops at the top of the hold band.
     */
    const artefact = reasons.find((r) => r.axis === 'artefacto')?.points ?? 0;
    if (finalScore >= THRESHOLDS.promote && finalScore - artefact < THRESHOLDS.promote) {
      reasons.push(
        signal(
          'techo',
          THRESHOLDS.promote - 1 - finalScore,
          0,
          'sólo alcanza promote por ser una release versionada: se queda en hold hasta que alguien la lea'
        )
      );
      finalScore = THRESHOLDS.promote - 1;
    }

    const decision = decide(finalScore);

    records.push({
      id: row.id,
      title: row.title,
      canonicalUrl: row.canonicalUrl,
      publisher: row.publisher,
      publishedAt: row.publishedAt,
      radarStatus: row.status,
      radarReason: row.reason ?? null,
      radarVertical: row.vertical,
      vertical,
      eventClass,
      product,
      triageDecision: decision,
      triageScore: finalScore,
      triageReasons: reasons,
      overturnedRadar: row.status === 'rejected' && decision !== 'reject',
      triagedAt,
    });

    if (!refusal) seen.push({ ...story, title: row.title });
  }

  return records.sort((a, b) => b.triageScore - a.triageScore || a.id.localeCompare(b.id));
}

/* -------------------------------------------------------------- reporting -- */

const COVERED_VERTICALS = [
  'modelo-lenguaje',
  'agentes',
  'imagen',
  'video',
  'audio',
  'multimodal',
  'local-open-source',
  'herramientas',
];

/**
 * Coverage, reported rather than enforced.
 *
 * No quota: a mediocre video story is not promoted because video is thin. What
 * the report does is name the gap, so the answer is to widen the *sources*
 * rather than to lower the bar.
 */
export function coverageGaps(records, today) {
  return COVERED_VERTICALS.map((vertical) => {
    const live = records.filter(
      (r) => r.vertical === vertical && r.triageDecision !== 'reject' && r.publishedAt
    );
    const latest = live.map((r) => r.publishedAt).sort().at(-1) ?? null;
    const days = latest ? Math.floor(daysApart(latest, today)) : null;
    return { vertical, usable: live.length, latest, daysWithout: days };
  }).sort((a, b) => (b.daysWithout ?? 9999) - (a.daysWithout ?? 9999));
}

export function summarizeTriage(records) {
  const byDecision = {};
  const byVertical = {};
  const buckets = { '0-24': 0, '25-54': 0, '55-79': 0, '80-100': 0 };

  for (const record of records) {
    byDecision[record.triageDecision] = (byDecision[record.triageDecision] ?? 0) + 1;
    if (record.triageDecision !== 'reject') {
      byVertical[record.vertical] = (byVertical[record.vertical] ?? 0) + 1;
    }
    const s = record.triageScore;
    if (s >= 80) buckets['80-100'] += 1;
    else if (s >= 55) buckets['55-79'] += 1;
    else if (s >= 25) buckets['25-54'] += 1;
    else buckets['0-24'] += 1;
  }

  return {
    total: records.length,
    byDecision,
    byVertical,
    buckets,
    rescued: records.filter((r) => r.overturnedRadar).length,
  };
}

export function serializeTriage(records) {
  return `${JSON.stringify(Triage.parse(records), null, 2)}\n`;
}
