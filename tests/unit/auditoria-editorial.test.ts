import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getAllTools } from '@lib/data/catalog';
import { citaDe, baseDe, evidenciaDe } from '@lib/domain/evidencia';

/**
 * H1–H13: la auditoría editorial del 28–29 de agosto de 2026.
 *
 * El auditor encontró trece cargos y, debajo, cuatro raíces que los explican:
 * contenido antiguo que sobrevivió a la migración de los campos duros; cifras
 * que estaban en la fuente el día que se citaron y ya no están; `unknown`
 * tratado de forma distinta en fichas hermanas; y Reddit conviviendo con
 * fuentes oficiales.
 *
 * Las pruebas de valor concreto —que Pika diga «sí» en marca de agua— caducan
 * en cuanto el fabricante cambie de política, y eso está bien: entonces habrá
 * que volver a mirar. Las de invariante no caducan nunca, y son las que
 * impiden que la raíz vuelva a brotar en una ficha que hoy no existe.
 */

const tools = getAllTools();

// ---------------------------------------------------------------------------
// Las raíces
// ---------------------------------------------------------------------------

describe('el contenido heredado no habla por encima del reverificado', () => {
  /*
   * `cons` fue el vector. Se reverificaron `summary`, `limits` y
   * `creditsAmount`, y nadie miró la lista de contras: Cursor decía «Plan
   * gratuito limitado a 2000 completions/mes» debajo de un resumen correcto que
   * dice que la cantidad no se publica, y Runway afirmaba en contras la marca de
   * agua que su campo dejaba sin confirmar.
   */
  it('ningún «en contra» afirma una cifra que su propio resumen no publica', () => {
    for (const tool of tools) {
      if (!tool.cons?.length) continue;
      const dice = tool.cons.join(' · ');
      const cifras = dice.match(/\d[\d.,]*\s*(completions|caracteres|créditos|mensajes)/gi) ?? [];
      for (const cifra of cifras) {
        const publicado = `${tool.freePlan.summary} ${tool.freePlan.limits.join(' ')} ${tool.freePlan.creditsAmount ?? ''}`;
        const numero = cifra.match(/\d[\d.,]*/)![0];
        expect(
          publicado.includes(numero),
          `${tool.slug}: «${cifra}» sólo existe en los contras, no en lo reverificado`
        ).toBe(true);
      }
    }
  });

  it('ninguna ficha nombra una versión de modelo que ya se retiró', () => {
    /*
     * ChatGPT describía su plan gratuito con «GPT-4o mini» y «DALL-E básico»;
     * Claude con «Claude 3.5 Sonnet (u versión equivalente en 2026)». Ese
     * paréntesis era la confesión: alguien sabía que el nombre había caducado y
     * lo dejó puesto, cubriéndose.
     */
    const RETIRADOS = /GPT-4o|DALL-E|Claude 3\.5|Claude 3 |Sonnet 3|Gemini 1\.|Llama 3 /i;
    for (const tool of tools) {
      const narrativa = [
        tool.tagline,
        tool.descriptionShort,
        tool.descriptionLong,
        tool.verdict,
        tool.freePlan.summary,
        ...(tool.freePlan.limits ?? []),
        ...(tool.cons ?? []),
        ...(tool.useCases ?? []),
      ]
        .filter(Boolean)
        .join(' · ');
      const encontrado = narrativa.match(RETIRADOS);
      expect(encontrado?.[0], `${tool.slug} nombra «${encontrado?.[0]}»`).toBeUndefined();
    }
  });

  it('ninguna ficha se cubre con un «o versión equivalente»', () => {
    /*
     * La fórmula que delata un dato que su autor ya sabía caducado. Si no se
     * puede sostener qué modelo sirve hoy, se dice que el fabricante lo cambia;
     * no se nombra uno y se le pone una red debajo.
     */
    for (const tool of tools) {
      const narrativa = [tool.descriptionLong, tool.freePlan.summary].filter(Boolean).join(' ');
      expect(narrativa, tool.slug).not.toMatch(/[ou] (versión|modelo) equivalente/i);
    }
  });
});

describe('una cita apunta al producto del que habla', () => {
  it('ninguna fuente de un modelo enlaza el repositorio de otro', () => {
    /*
     * DeepSeek V4 Flash citaba `DeepSeek-V3.2-Exp` entre sus fuentes. Una ficha
     * que enlaza el repositorio equivocado no está mal redactada: está apoyada
     * en otra cosa, y nadie lo nota porque el enlace funciona.
     */
    const SOSPECHOSAS = /V3\.2-Exp|-Exp\b/i;
    for (const tool of tools) {
      for (const fuente of tool.sources ?? []) {
        expect(
          SOSPECHOSAS.test(fuente.url) && !SOSPECHOSAS.test(tool.name),
          `${tool.slug} cita ${fuente.url}, que es de otro modelo`
        ).toBe(false);
      }
    }
  });

  it('ninguna ficha cita un foro entre sus fuentes', () => {
    /*
     * Seis fichas listaban un subreddit junto a la web del fabricante. Que
     * estuvieran marcadas como `community` no lo arreglaba: iban en la misma
     * lista, con el mismo aspecto, en el sitio exacto donde un lector va a
     * comprobar la promesa de la metodología.
     */
    for (const tool of tools) {
      for (const fuente of tool.sources ?? []) {
        expect(fuente.url, `${tool.slug}`).not.toMatch(/reddit\.com|medium\.com|youtube\.com/i);
      }
    }
  });
});

describe('una deducción se archiva como deducción', () => {
  /*
   * Pika y Runway no dicen «el plan gratuito pone marca de agua». Dicen que
   * quitarla se compra. De lo segundo a lo primero hay un paso que damos
   * nosotros, y el lector tiene derecho a verlo para poder discutirlo.
   */
  it('toda marca de agua afirmada sin cita del fabricante lleva su base escrita', () => {
    for (const tool of tools) {
      if (tool.freePlan.hasWatermark !== 'yes') continue;
      const ev = evidenciaDe(tool, 'freePlan.hasWatermark');
      expect(ev, `${tool.slug} afirma marca de agua sin evidencia`).toBeDefined();
      if (ev!.outcome === 'stated') {
        expect(citaDe(ev!), `${tool.slug}`).toBeTruthy();
      } else {
        expect(ev!.outcome, `${tool.slug}`).toBe('derived');
        expect(baseDe(ev!)!.length, `${tool.slug}: la base no explica nada`).toBeGreaterThan(60);
      }
    }
  });

  it('Pika y Runway deducen del mismo hecho y lo dicen igual', () => {
    for (const slug of ['pika-labs', 'runwayml']) {
      const tool = tools.find((t) => t.slug === slug)!;
      expect(tool.freePlan.hasWatermark, slug).toBe('yes');
      const base = baseDe(evidenciaDe(tool, 'freePlan.hasWatermark')!)!;
      expect(base, `${slug}: no dice de dónde sale`).toMatch(/no watermark/i);
      expect(base, `${slug}: no admite que es deducción nuestra`).toMatch(/deduc|no lo dice|no lo afirma/i);
    }
  });
});

describe('fichas hermanas, misma política', () => {
  /*
   * Kimi K3 estaba en `partial` y Qwen3.8 Max en `unverified` con licencias de
   * la misma clase: propias, permisivas, con umbrales de atribución y un
   * acuerdo aparte por encima de cierta facturación. Dos fichas hermanas y dos
   * políticas es la raíz del `unknown` inconsistente.
   */
  it('las dos licencias con umbrales comerciales se marcan igual', () => {
    for (const slug of ['kimi-k2', 'qwen3-max']) {
      const tool = tools.find((t) => t.slug === slug)!;
      expect(tool.freePlan.commercialUse, `${slug}`).toBe('partial');
      const ev = evidenciaDe(tool, 'freePlan.commercialUse')!;
      expect(ev.scope, `${slug}: la licencia habla de los pesos`).toBe('weights');
      expect(citaDe(ev), `${slug}`).toBeTruthy();
    }
  });

  it('y la ficha nombra las dos condiciones, no sólo la primera', () => {
    /*
     * Kimi resumía su licencia como si tuviera una condición y contaba la mitad
     * de esa: el umbral de atribución no es sólo 100 millones de usuarios, es
     * eso «o» 20 millones de dólares mensuales. La segunda condición —el acuerdo
     * aparte para negocios MaaS— no aparecía en ninguna parte.
     */
    const kimi = tools.find((t) => t.slug === 'kimi-k2')!;
    const texto = `${kimi.freePlan.summary} ${kimi.freePlan.limits.join(' ')}`;
    expect(texto, 'falta el umbral de usuarios').toMatch(/100 millones|100M/);
    expect(texto, 'falta el umbral de ingresos').toMatch(/20 millones|20M/);
    expect(texto, 'falta el acuerdo aparte para MaaS').toMatch(/acuerdo aparte|modelo como servicio|MaaS/i);
  });
});

describe('los precios son los del modelo del que habla la ficha', () => {
  it('DeepSeek Pro y Flash no comparten cifras de hora punta', () => {
    /*
     * La ficha de Pro publicaba «hora punta: 0,44 y 1,32», que son los precios
     * de Flash. Un catálogo que se equivoca de columna en una tabla de precios
     * se equivoca justo en lo que el lector va a usar para decidir.
     */
    const pro = tools.find((t) => t.slug === 'deepseek-v4-pro')!;
    const flash = tools.find((t) => t.slug === 'deepseek-v4-flash')!;
    const puntaDe = (t: (typeof tools)[number]) =>
      t.freePlan.limits.find((l) => /hora punta/i.test(l)) ?? '';

    expect(puntaDe(pro), 'Pro sin precio de punta').toMatch(/1,32.*3,96/);
    expect(puntaDe(flash), 'Flash sin precio de punta').toMatch(/0,44.*1,32/);
    expect(puntaDe(pro)).not.toBe(puntaDe(flash));
  });

  it('GPT-5.6 distingue contexto corto de largo, que es lo que hace su tabla', () => {
    /*
     * Publicaba tres parejas sin decir a qué contexto correspondían. Dos
     * coincidían con la fila de contexto corto por casualidad y la de Sol no
     * coincidía con ninguna.
     */
    const gpt = tools.find((t) => t.slug === 'gpt-5-6')!;
    const texto = gpt.freePlan.limits.join(' · ');
    expect(texto, 'no distingue contexto').toMatch(/contexto corto/i);
    expect(texto, 'Sol con el precio que no era').toMatch(/Sol: 4 \$/);
    expect(texto).not.toMatch(/Sol: 5 \$/);
  });
});

describe('las cifras huérfanas se retiran, no se maquillan', () => {
  /*
   * Copilot publicaba «50 solicitudes de chat al mes» con su cita literal, y era
   * cierta el día que se capturó. Hoy la página dice «an allowance of GitHub AI
   * Credits» y no da número. La evidencia estaba bien hecha y el mundo se movió:
   * por eso la corrección no es rehacer la cita, es quitar el número.
   */
  it('Copilot ya no publica una cifra de chats que su fuente no da', () => {
    const copilot = tools.find((t) => t.slug === 'github-copilot')!;
    const texto = `${copilot.freePlan.summary} ${copilot.freePlan.limits.join(' ')}`;
    expect(texto).not.toMatch(/50 solicitudes de chat/);
    expect(texto, 'debe decir que la cantidad no se publica').toMatch(/sin publicar|no publica/i);
    expect(citaDe(evidenciaDe(copilot, 'freePlan.limits')!), 'la cita debe ser la de hoy').toMatch(
      /allowance of GitHub AI Credits/i
    );
  });

  it('Copilot tampoco niega en rotundo lo que su fuente no menciona', () => {
    /*
     * «NO incluye revisión de código» era más fuerte que la página, que no
     * menciona revisión de código en ningún nivel individual. Un negativo sin
     * fuente es tan inventado como un positivo.
     */
    const copilot = tools.find((t) => t.slug === 'github-copilot')!;
    expect(copilot.freePlan.limits.join(' ')).not.toMatch(/NO incluye revisión de código/i);
  });

  it('Ideogram ya no publica los diez créditos que su tabla retiró', () => {
    const ideogram = tools.find((t) => t.slug === 'ideogram')!;
    expect(ideogram.freePlan.creditsAmount).toBeUndefined();
    const texto = `${ideogram.tagline} ${ideogram.descriptionShort} ${ideogram.freePlan.summary} ${ideogram.freePlan.limits.join(' ')}`;
    expect(texto).not.toMatch(/10 créditos lentos|diez créditos lentos/i);
    expect(texto, 'debe decir a quién se los dan').toMatch(/cuentas elegibles/i);
  });

  it('Cursor no arrastra en contras la cifra que su resumen niega', () => {
    const cursor = tools.find((t) => t.slug === 'cursor')!;
    expect(cursor.cons?.join(' ') ?? '').not.toMatch(/2000 completions|2\.000 completados/i);
  });
});

describe('lo que sí resistió la auditoría', () => {
  it('ElevenLabs conserva la cita de sus términos, que es más fuerte que la tabla', () => {
    /*
     * El auditor recomendaba rebajar el «no» de uso comercial porque «la
     * licencia empieza en Starter» no resuelve las condiciones de la salida
     * gratuita. Tenía razón en el razonamiento y le faltaba un dato: la ficha ya
     * citaba los términos, que lo dicen con todas las letras. Estuve a punto de
     * sustituir esa cita por una deducción mía sobre la tabla de precios, que
     * habría sido cambiar la mejor fuente de la ficha por una peor.
     */
    const eleven = tools.find((t) => t.slug === 'elevenlabs')!;
    expect(eleven.freePlan.commercialUse).toBe('no');
    const ev = evidenciaDe(eleven, 'freePlan.commercialUse')!;
    expect(ev.outcome).toBe('stated');
    expect(ev.sourceKind).toBe('terms');
    expect(citaDe(ev)).toMatch(/only use the Services for non-commercial purposes/i);
  });
});

describe('el texto heredado se marca como lo que es', () => {
  /*
   * Dieciséis fichas tienen los cuatro hechos del plan gratuito comprobados y
   * los tres párrafos de alrededor —qué es, para qué se usa, en contra— venidos
   * del catálogo anterior. Lo reconocían en el sello del revisor.
   *
   * Al unificar ese sello con el estado derivado, para arreglar las 63 fichas
   * que se desmentían, borré esa confesión sin verlo: quedaron coherentes en sus
   * hechos y mudas sobre su narrativa. Arreglar una contradicción no puede
   * costar una verdad.
   */
  const ficha = readFileSync('src/pages/herramientas/[slug].astro', 'utf8');

  it('la ficha avisa cuando la parte narrativa viene del catálogo anterior', () => {
    expect(ficha).toMatch(/procede del catálogo anterior/);
    expect(ficha, 'el aviso debe colgar del campo que lo sabe').toMatch(
      /tool\.verification !== 'verified'/
    );
  });

  it('y el aviso acota qué parte, sin desmentir los hechos comprobados', () => {
    /*
     * La diferencia con el sello viejo: aquél decía «esta ficha no está
     * verificada» encima de cuatro hechos que sí lo estaban. Éste dice qué
     * párrafos son y remite arriba para lo demás.
     */
    expect(ficha).toMatch(/Las condiciones del plan gratuito de arriba sí/);
  });

  it('hay fichas a las que aplica, así que el aviso no es decorativo', () => {
    const heredadas = tools.filter((t) => t.verification !== 'verified');
    expect(heredadas.length).toBeGreaterThan(0);
    for (const t of heredadas.slice(0, 3)) {
      expect(['partially_verified', 'pending_review', 'outdated'], t.slug).toContain(t.verification);
    }
  });
});
