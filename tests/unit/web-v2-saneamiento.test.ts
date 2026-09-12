import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// El mismo paquete que usa la CLI de Vercel para decidir qué sube. Llega como
// dependencia de eslint; si algún día desaparece, esta prueba lo dirá.
import ignore from 'ignore';
import { getAllTools } from '@lib/data/catalog';
import { esfuerzoDe } from '@lib/domain/esfuerzo';
import { START_EFFORT_LABEL } from '@lib/domain/taxonomy';
import { TITULAR, camposPendientes } from '@lib/legal/titular';

/**
 * Web V2, fase 1: el saneamiento que tenía que ir antes del rediseño.
 *
 * Cada bloque nace de una contradicción que la auditoría de partida midió en
 * producción el 11 de septiembre de 2026. Las pruebas no fijan textos: fijan
 * la regla que impide que la contradicción vuelva.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const tools = getAllTools();
const leer = (ruta: string) => readFileSync(join(ROOT, ruta), 'utf8');

/**
 * El código sin comentarios.
 *
 * Cada arreglo deja escrito por qué se hizo, citando la frase que se retiró.
 * Lo que hay que comprobar es que nadie la ejecuta, no que nadie la nombra.
 */
const codigo = (ruta: string) =>
  leer(ruta)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

// ---------------------------------------------------------------------------
// 1. Estado editorial
// ---------------------------------------------------------------------------

describe('«verificada» es un estado, no un adjetivo para el catálogo', () => {
  /*
   * Las 94 tarjetas del catálogo decían «Verificada» porque la tarjeta llamaba
   * así a una ficha reciente. El título principal de /herramientas, su título de
   * página, el pie de todas las páginas y el JSON-LD decían lo mismo del
   * catálogo entero, mientras la portada contaba doce.
   */
  const SUPERFICIES = [
    'src/pages/index.astro',
    'src/components/site/Footer.astro',
    'src/components/tools/ToolCard.astro',
    'src/components/catalog/IntentCard.astro',
    'src/pages/herramientas/index.astro',
    'src/pages/categorias/index.astro',
    'src/pages/categorias/[slug].astro',
    'src/pages/colecciones/index.astro',
    'src/pages/colecciones/[slug].astro',
    'src/lib/data/collections.ts',
    'src/pages/imagen.astro',
    'src/pages/video.astro',
    'src/pages/audio.astro',
    'src/pages/codigo.astro',
    'src/pages/modelos.astro',
    'src/pages/agentes.astro',
    'src/pages/comparar.astro',
    'src/lib/search/filters.ts',
    'src/components/discovery/ToolExplorer.astro',
    'src/components/discovery/FilterPanel.astro',
    'src/pages/cuenta/alertas.astro',
    'src/lib/seo/site.ts',
  ];

  /** Los únicos sitios donde la palabra nombra el estado, con su recuento. */
  const NOMBRA_EL_ESTADO = [
    /\$?\{[^}]*\.verificada\}(<\/strong>)?\s+verificadas/g,
    /<dt>Verificadas<\/dt><dd class="tnum">\{recuento\.verificada\}/g,
    /<strong>Verificada<\/strong>/g,
    /\[data-state='verificada'\]/g,
    // La propiedad del recuento (`recuento.verificada`) es código, no copy. Va
    // la última para no comerse la cifra de los patrones de arriba.
    /\.verificada\b/g,
  ];

  it('ninguna superficie del catálogo llama verificadas a las que no lo están', () => {
    for (const ruta of SUPERFICIES) {
      let texto = codigo(ruta);
      for (const permitido of NOMBRA_EL_ESTADO) texto = texto.replace(permitido, '');
      const encontrado = texto.match(/verificad[ao]s?\b/i);
      expect(encontrado?.[0], `${ruta} dice «${encontrado?.[0]}» fuera del estado`).toBeUndefined();
    }
  });

  it('la tarjeta del catálogo saca el estado de verificacionDe(), no de la frescura', () => {
    const tarjeta = codigo('src/components/tools/ToolCard.astro');
    expect(tarjeta).toContain('verificacionDe(tool)');
    expect(tarjeta).toContain('data-state={verificacion.state}');
    expect(tarjeta).not.toMatch(/freshness\s*===\s*'fresh'\s*\?\s*'Verificada'/);
  });

  it('el catálogo enseña el reparto de estados', () => {
    const listado = codigo('src/pages/herramientas/index.astro');
    expect(listado).toMatch(/recuento\.verificada\}\s+verificadas/);
    expect(listado).toContain('recuento.parcial');
    expect(listado).toContain('recuento.catalogada');
  });

  it('la portada dice qué fecha enseña, y la dice en una sola pieza', () => {
    /*
     * «Actualizado el 30 de agosto» era la última revisión del catálogo,
     * encima de noticias del 9 de septiembre.
     */
    const portada = codigo('src/pages/index.astro');
    expect(portada).toContain('catálogo revisado por última vez el');
    expect(portada).not.toMatch(/actualizado el/i);
    expect(portada).toMatch(
      /<span>\s*Radar editorial independiente · catálogo revisado por última vez el[\s\S]*?<\/time>\s*<\/span>/
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Esfuerzo y registro
// ---------------------------------------------------------------------------

describe('empezar no promete lo que el registro desmiente', () => {
  it('la etiqueta mínima sólo sale con el registro confirmado como no', () => {
    for (const tool of tools) {
      const { label } = esfuerzoDe(tool);
      if (label === START_EFFORT_LABEL.instant) {
        expect(tool.freePlan.requiresSignup, `${tool.slug} dice «${label}»`).toBe('no');
      }
      if (tool.freePlan.requiresSignup === 'yes') {
        expect(label, `${tool.slug} exige cuenta`).not.toBe(START_EFFORT_LABEL.instant);
      }
    }
  });

  it('ChatGPT y Claude dicen en todas partes que hace falta cuenta', () => {
    /*
     * Enseñaban «Abres y generas» en el veredicto y «Exige crear cuenta» dos
     * párrafos más abajo, en la misma pantalla.
     */
    for (const slug of ['chatgpt', 'claude']) {
      const tool = tools.find((t) => t.slug === slug)!;
      expect(tool.startEffort, slug).toBe('signup');
      expect(esfuerzoDe(tool).label, slug).toBe(START_EFFORT_LABEL.signup);
      expect(tool.startEffortReason, slug).toMatch(/cuenta/i);
    }
  });

  it('ninguna superficie pinta el esfuerzo sin pasar por esfuerzoDe()', () => {
    for (const ruta of [
      'src/components/tools/AccessBadge.astro',
      'src/components/catalog/IntentCard.astro',
      'src/pages/herramientas/[slug].astro',
      'src/lib/data/comparador.ts',
    ]) {
      const texto = codigo(ruta);
      expect(texto, ruta).not.toContain('START_EFFORT_LABEL[');
      expect(texto, ruta).toContain('esfuerzoDe(');
    }
  });

  it('las seis tarjetas de la portada no prometen de más', () => {
    /*
     * La portada enseña hoy Ideogram, Pika, ElevenLabs, GitHub Copilot, Genspark
     * y Gemini 3 Flash, con todas sus capacidades a la vista. Ninguna puede
     * listar como capacidad lo que su plan gratuito excluye, ni prometer entrar
     * sin cuenta si la pide.
     */
    for (const slug of ['ideogram', 'pika-labs', 'elevenlabs', 'github-copilot', 'genspark', 'gemini-3-flash']) {
      const tool = tools.find((t) => t.slug === slug)!;
      const deMas = tool.freePlan.excludedCapabilities.filter((c) => tool.capabilities.includes(c));
      expect(deMas, `${slug} enseña capacidades de pago`).toEqual([]);
      if (tool.freePlan.requiresSignup !== 'no') {
        expect(esfuerzoDe(tool).label, slug).not.toBe(START_EFFORT_LABEL.instant);
      }
    }
  });

  it('el resumen de la ficha no llama «Modelo» al tipo de acceso', () => {
    /*
     * «Modelo: Gratis real», justo debajo de «el modelo por defecto era Claude
     * Sonnet 5».
     */
    expect(codigo('src/pages/herramientas/[slug].astro')).not.toContain('<dt>Modelo</dt>');
  });
});

// ---------------------------------------------------------------------------
// 3. Consentimiento
// ---------------------------------------------------------------------------

describe('el aviso de cookies no elige por nadie', () => {
  it('abrir no enfoca «Aceptar todo» ni atrapa el tabulador', () => {
    const cliente = codigo('public/consent.js');
    expect(cliente).not.toMatch(/accept-all\]'\)[\s\S]{0,80}\.focus\(/);
    expect(cliente).not.toContain("event.key !== 'Tab'");
    expect(cliente).toContain('openBanner(false, false)');
  });

  it('aceptar, rechazar y personalizar comparten estilo', () => {
    const banner = leer('src/components/consent/ConsentBanner.astro');
    const clases = [
      ...banner.matchAll(/<button[^>]*class="([^"]+)"[^>]*data-consent-(accept-all|reject-all|customize)/g),
    ].map((m) => m[1]);
    expect(clases).toHaveLength(3);
    expect(new Set(clases).size, clases.join(' | ')).toBe(1);
    expect(clases[0]).not.toContain('btn-primary');
  });
});

// ---------------------------------------------------------------------------
// 4. Legal
// ---------------------------------------------------------------------------

describe('los datos del titular no se inventan', () => {
  it('cada campo está vacío o tiene un dato, nunca un relleno', () => {
    for (const [clave, campo] of Object.entries(TITULAR)) {
      if (campo.valor === null) continue;
      expect(campo.valor.trim(), clave).not.toBe('');
      expect(campo.valor, `${clave} parece un relleno`).not.toMatch(/x{3,}|lorem|ejemplo|pendiente|free ai radar/i);
    }
  });

  it('camposPendientes() lista exactamente los que faltan', () => {
    const vacios = Object.entries(TITULAR)
      .filter(([, campo]) => !campo.valor)
      .map(([clave]) => clave);
    expect(camposPendientes()).toEqual(vacios);
    for (const clave of camposPendientes(true)) expect(TITULAR[clave].obligatorio).toBe(true);
  });

  it('Términos y Privacidad dejan de presentarse como borrador y marcan cada dato del titular', () => {
    for (const ruta of ['src/pages/legal/terminos.astro', 'src/pages/legal/privacidad.astro']) {
      const pagina = codigo(ruta);
      expect(pagina, ruta).not.toContain('draftNotice');
      expect(pagina, ruta).not.toContain('Pendiente antes de publicar');
      for (const campo of ['nombre', 'nif', 'domicilio']) {
        expect(pagina, `${ruta} no marca «${campo}»`).toContain(`<DatoTitular campo="${campo}"`);
      }
    }
  });

  it('el hueco marcado no minusculiza siglas', () => {
    expect(codigo('src/components/legal/DatoTitular.astro')).not.toContain('toLowerCase');
  });
});

// ---------------------------------------------------------------------------
// 5 y 6. Despliegue y automatismos
// ---------------------------------------------------------------------------

describe('el Preview sube lo que el build necesita, y nada más', () => {
  it('.vercelignore deja fuera documentación y resultados de pruebas', () => {
    const lineas = leer('.vercelignore')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    for (const fuera of ['docs/', 'tests/', 'test-results/']) expect(lineas).toContain(fuera);
    for (const dentro of ['src/', 'scripts/', 'public/']) expect(lineas).not.toContain(dentro);
  });

  it('.vercelignore no deja subir credenciales ni datos locales', () => {
    /*
     * El primer Preview de `web-v2` se subió sin este fichero, desde una carpeta
     * con `.env.local.bak-*`, `credenciales-newsroom.local.txt`, `.data/` y
     * `.claude/`. Se borró y sus secretos se rotaron.
     */
    const lineas = leer('.vercelignore').split(/\r?\n/).map((l) => l.trim());
    for (const fuera of ['.env*', '*.local', '*.local.*', '*.bak', '*.bak-*', '*credenciales*', '.data/', '.claude/', 'docs/']) {
      expect(lineas, `falta ${fuera}`).toContain(fuera);
    }
  });

  it('ningún fichero sensible de esta carpeta entraría en una subida', () => {
    /*
     * La regla de la CLI de Vercel, leída en su código (59.16): su lista por
     * defecto más `.vercelignore`, con el paquete `ignore`. No lee `.gitignore`.
     * Esta prueba recorre la carpeta real, así que en la máquina donde viven
     * las credenciales falla si alguien añade una copia con un nombre nuevo.
     */
    const DEFECTO = [
      '.hg', '.git', '.gitmodules', '.svn', '.cache', '.next', '.now', '.vercel', '.npmignore',
      '.dockerignore', '.gitignore', '.*.swp', '.DS_Store', '.wafpicke-*', '.lock-wscript',
      '.env.local', '.env.*.local', '.venv', '.yarn/cache', '.pnp*', 'npm-debug.log',
      'config.gypi', 'node_modules', '__pycache__', 'venv', 'CVS',
    ];
    const ig = ignore().add(DEFECTO).add(leer('.vercelignore'));
    const SENSIBLE =
      /(^|\/)\.env|credenciales|credentials|\.bak|\.backup|\.pem$|\.key$|\.p12$|\.pfx$|(^|\/)\.data\/|(^|\/)\.claude\/|\.local(\.|$)|(^|\/)\.npmrc$|(^|\/)\.netrc$/i;

    const subirian: string[] = [];
    const pila = [''];
    while (pila.length) {
      const rel = pila.pop()!;
      for (const entrada of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
        const ruta = rel ? `${rel}/${entrada.name}` : entrada.name;
        if (entrada.isDirectory()) {
          if (!ig.ignores(`${ruta}/`)) pila.push(ruta);
        } else if (!ig.ignores(ruta) && SENSIBLE.test(ruta) && ruta !== '.env.example') {
          subirian.push(ruta);
        }
      }
    }
    expect(subirian).toEqual([]);
  });
});

describe('ningún workflow ejecuta lo que no existe ni tapa el sitemap', () => {
  const dir = join(ROOT, '.github/workflows');
  const workflows = existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)) : [];

  it('cada script que llama un workflow existe', () => {
    /*
     * `update-ai-news.yml` falló a diario durante semanas llamando a dos scripts
     * borrados en agosto, sin que nada lo avisara.
     */
    for (const fichero of workflows) {
      const texto = readFileSync(join(dir, fichero), 'utf8');
      for (const [, script = ''] of texto.matchAll(/node\s+(scripts\/[\w./-]+)/g)) {
        expect(existsSync(join(ROOT, script)), `${fichero} llama a ${script}`).toBe(true);
      }
    }
  });

  it('ninguno escribe un sitemap estático que tape el dinámico', () => {
    for (const fichero of workflows) {
      expect(readFileSync(join(dir, fichero), 'utf8'), fichero).not.toMatch(/public\/sitemap\.xml/);
    }
  });

  it('el workflow antiguo está retirado, no borrado', () => {
    expect(workflows).not.toContain('update-ai-news.yml');
    expect(existsSync(join(ROOT, '.github/workflows-retirados/update-ai-news.yml'))).toBe(true);
  });
});
