import { describe, expect, it } from 'vitest';
import { evaluateEnvironment, fingerprint, maskHost, maskRef, scrub } from '../../scripts/staging-guard.mjs';

/**
 * The guard, tested as the thing standing between a hostile suite and the
 * wrong database.
 *
 * A guard nobody can test is a guard nobody should trust, which is why the
 * decision logic is a pure function: these run with no network, no database
 * and no credentials.
 *
 * The two references below are syntactically valid Supabase project refs and
 * belong to nothing.
 */

const STAGING = 'aaaabbbbccccdddd';
const OTHER = 'eeeeffffgggghhhh';
const PROD = 'iiiijjjjkkkkllll';

function env(overrides: Record<string, string> = {}) {
  return {
    SUPABASE_ENV: 'staging',
    SUPABASE_STAGING_REF: STAGING,
    SUPABASE_PRODUCTION_REFS: PROD,
    SUPABASE_DB_URL_STAGING: `postgresql://postgres:pw@db.${STAGING}.supabase.co:5432/postgres`,
    PUBLIC_SUPABASE_URL: `https://${STAGING}.supabase.co`,
    ...overrides,
  };
}

const evaluate = (overrides?: Record<string, string>) =>
  evaluateEnvironment(env(overrides)) as {
    facts: string[];
    warnings: string[];
    problems: string[];
    url: string | null;
  };

const reasons = (result: { problems: string[] }) => result.problems.join(' | ');

describe('los cinco escenarios exigidos', () => {
  it('referencia de staging correcta → PASA', () => {
    const result = evaluate();
    expect(reasons(result)).toBe('');
    expect(result.url).not.toBeNull();
  });

  it('referencia de staging incorrecta → FALLA', () => {
    // The declared project is not the one the connection string points at.
    const result = evaluate({ SUPABASE_STAGING_REF: OTHER });
    expect(result.problems.length).toBeGreaterThan(0);
    expect(reasons(result)).toContain('proyecto distinto del declarado');
    expect(result.url).toBeNull();
  });

  it('variable ausente → FALLA', () => {
    const withoutRef = env();
    delete (withoutRef as Record<string, unknown>)['SUPABASE_STAGING_REF'];
    const result = evaluateEnvironment(withoutRef) as { problems: string[]; url: string | null };
    expect(reasons(result)).toContain('Falta SUPABASE_STAGING_REF');
    expect(result.url).toBeNull();
  });

  it('URL de API correcta + base de datos de otro proyecto → FALLA', () => {
    const result = evaluate({
      SUPABASE_DB_URL_STAGING: `postgresql://postgres:pw@db.${OTHER}.supabase.co:5432/postgres`,
    });
    expect(reasons(result)).toContain('La base de datos pertenece a un proyecto distinto');
    expect(result.url).toBeNull();
  });

  it('base de datos correcta + URL de API de otro proyecto → FALLA', () => {
    const result = evaluate({ PUBLIC_SUPABASE_URL: `https://${OTHER}.supabase.co` });
    expect(reasons(result)).toContain('PUBLIC_SUPABASE_URL apunta a un proyecto distinto');
    expect(result.url).toBeNull();
  });
});

describe('las otras condiciones', () => {
  it('SUPABASE_ENV distinto de staging → FALLA', () => {
    expect(reasons(evaluate({ SUPABASE_ENV: 'production' }))).toContain('SUPABASE_ENV debe valer');
  });

  it('SUPABASE_ENV ausente → FALLA', () => {
    const without = env();
    delete (without as Record<string, unknown>)['SUPABASE_ENV'];
    expect((evaluateEnvironment(without) as { problems: string[] }).problems.join(' ')).toContain(
      'SUPABASE_ENV debe valer'
    );
  });

  it('la referencia declarada figura entre las de producción → FALLA', () => {
    const result = evaluate({
      SUPABASE_STAGING_REF: PROD,
      SUPABASE_DB_URL_STAGING: `postgresql://postgres:pw@db.${PROD}.supabase.co:5432/postgres`,
      PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
    });
    expect(reasons(result)).toContain('SUPABASE_PRODUCTION_REFS');
  });

  /*
   * An empty list used to be a warning. It will be true for months, and a
   * warning that stays true is a warning nobody reads — so on the day the
   * production project exists, forgetting to list it would silently remove a
   * layer. There are now two acceptable states and no third.
   */
  it('SUPABASE_PRODUCTION_REFS vacía → FALLA, no es un aviso', () => {
    const result = evaluate({ SUPABASE_PRODUCTION_REFS: '' });
    expect(reasons(result)).toContain('SUPABASE_PRODUCTION_REFS está vacía');
  });

  it('"none-yet" declara que no hay producción todavía → PASA, con aviso', () => {
    const result = evaluate({ SUPABASE_PRODUCTION_REFS: 'none-yet' });
    expect(result.problems).toEqual([]);
    expect(result.warnings.join(' | ')).toContain('none-yet');
  });

  it('"none-yet" no se cuela como referencia de proyecto', () => {
    /*
     * The bug this catches: `none-yet` is a non-empty string, so a naive
     * implementation puts it in the forbidden list, finds the list non-empty
     * and skips the check entirely — silence instead of protection, which is
     * the exact failure the change was meant to remove.
     */
    const result = evaluate({
      SUPABASE_PRODUCTION_REFS: 'none-yet',
      SUPABASE_STAGING_REF: 'none-yet',
      SUPABASE_DB_URL_STAGING: 'postgresql://postgres:pw@db.none-yet.supabase.co:5432/postgres',
      PUBLIC_SUPABASE_URL: 'https://none-yet.supabase.co',
    });
    expect(reasons(result)).not.toContain('figura en SUPABASE_PRODUCTION_REFS');
  });

  it('una referencia real sigue bloqueando aunque haya varias listadas', () => {
    const result = evaluate({
      SUPABASE_PRODUCTION_REFS: `${OTHER}, ${PROD}`,
      SUPABASE_STAGING_REF: PROD,
      SUPABASE_DB_URL_STAGING: `postgresql://postgres:pw@db.${PROD}.supabase.co:5432/postgres`,
      PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
    });
    expect(reasons(result)).toContain('figura en SUPABASE_PRODUCTION_REFS');
  });

  it('un indicador de producción en el anfitrión → FALLA', () => {
    const result = evaluate({
      SUPABASE_DB_URL_STAGING: `postgresql://postgres:pw@db-prod.${STAGING}.supabase.co:5432/postgres`,
    });
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it('sin cadena de conexión → FALLA', () => {
    const without = env();
    delete (without as Record<string, unknown>)['SUPABASE_DB_URL_STAGING'];
    expect((evaluateEnvironment(without) as { problems: string[] }).problems.join(' ')).toContain(
      'Falta la cadena de conexión'
    );
  });

  it('acepta el nombre del panel de Supabase, avisando de lo que pierde', () => {
    const alternative = env();
    delete (alternative as Record<string, unknown>)['SUPABASE_DB_URL_STAGING'];
    (alternative as Record<string, string>)['SUPABASE_DATABASE_URL'] =
      `postgresql://postgres:pw@db.${STAGING}.supabase.co:5432/postgres`;

    const result = evaluateEnvironment(alternative) as { problems: string[]; warnings: string[] };
    expect(result.problems).toEqual([]);
    expect(result.warnings.join(' ')).toContain('no dice a qué entorno apunta');
  });

  it('reconoce la referencia también en la cadena del pooler', () => {
    const result = evaluate({
      SUPABASE_DB_URL_STAGING: `postgresql://postgres.${STAGING}:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    });
    expect(reasons(result)).toBe('');
  });
});

describe('nada identificable llega a la salida', () => {
  it('ninguna referencia completa aparece en hechos, avisos ni problemas', () => {
    for (const result of [
      evaluate(),
      evaluate({ SUPABASE_STAGING_REF: OTHER }),
      evaluate({ PUBLIC_SUPABASE_URL: `https://${OTHER}.supabase.co` }),
    ]) {
      const everything = [...result.facts, ...result.warnings, ...result.problems].join(' ');
      for (const ref of [STAGING, OTHER, PROD]) {
        expect(everything, `se ha filtrado ${ref}`).not.toContain(ref);
      }
    }
  });

  it('la contraseña nunca aparece', () => {
    const result = evaluate({
      SUPABASE_DB_URL_STAGING: `postgresql://postgres:contrasena-secretisima@db.${STAGING}.supabase.co:5432/postgres`,
    });
    const everything = [...result.facts, ...result.warnings, ...result.problems].join(' ');
    expect(everything).not.toContain('contrasena-secretisima');
  });

  it('el depurador enmascara un anfitrión suelto en un mensaje de error', () => {
    const message = `getaddrinfo ENOTFOUND db.${STAGING}.supabase.co`;
    expect(scrub(message)).not.toContain(STAGING);
    expect(scrub(message)).toContain('supabase.co');
  });

  it('el depurador borra una cadena de conexión entera', () => {
    const message = `error connecting to postgresql://postgres:pw@db.${STAGING}.supabase.co:5432/postgres`;
    expect(scrub(message)).not.toContain(STAGING);
    expect(scrub(message)).not.toContain('pw@');
  });

  it('la huella distingue cadenas distintas y repite para la misma', () => {
    expect(fingerprint('uno')).toBe(fingerprint('uno'));
    expect(fingerprint('uno')).not.toBe(fingerprint('dos'));
    expect(fingerprint('secreto')).not.toContain('secreto');
  });

  it('el enmascarado conserva lo suficiente para comparar', () => {
    expect(maskRef(STAGING)).not.toBe(maskRef(OTHER));
    expect(maskRef(STAGING)).not.toContain(STAGING);
    expect(maskHost(`db.${STAGING}.supabase.co`)).not.toContain(STAGING);
    expect(maskHost(`db.${STAGING}.supabase.co`)).toContain('supabase.co');
  });
});

describe('credenciales sin sustituir', () => {
  it('detecta el marcador de posición del panel de Supabase', () => {
    const result = evaluate({
      SUPABASE_DB_URL_STAGING: `postgresql://postgres:${encodeURIComponent('[YOUR-PASSWORD]')}@db.${STAGING}.supabase.co:5432/postgres`,
    });
    expect(reasons(result)).toContain('marcador de posición');
    expect(result.url).toBeNull();
  });

  it('una contraseña real no dispara la comprobación', () => {
    const result = evaluate({
      SUPABASE_DB_URL_STAGING: `postgresql://postgres:UnaClaveReal123@db.${STAGING}.supabase.co:5432/postgres`,
    });
    expect(reasons(result)).toBe('');
  });

  it('una cadena sin contraseña → FALLA', () => {
    const result = evaluate({
      SUPABASE_DB_URL_STAGING: `postgresql://postgres@db.${STAGING}.supabase.co:5432/postgres`,
    });
    expect(reasons(result)).toContain('no lleva contraseña');
  });
});

describe('formas equivocadas de SUPABASE_STAGING_REF', () => {
  it('una URL completa se nombra como tal, no como desajuste de proyecto', () => {
    const result = evaluate({ SUPABASE_STAGING_REF: `https://${STAGING}.supabase.co` });
    expect(reasons(result)).toContain('contiene una URL completa');
    expect(reasons(result)).not.toContain('proyecto distinto del declarado');
  });

  it('algo demasiado corto para ser una referencia → FALLA', () => {
    expect(reasons(evaluate({ SUPABASE_STAGING_REF: 'staging' }))).toContain(
      'no tiene forma de referencia'
    );
  });

  it('el anfitrión directo avisa del problema de IPv6 sin bloquear', () => {
    const result = evaluate();
    expect(result.problems).toEqual([]);
    expect(result.warnings.join(' ')).toContain('sólo publica registro AAAA');
  });

  it('la cadena del pooler no genera ese aviso', () => {
    const result = evaluate({
      SUPABASE_DB_URL_STAGING: `postgresql://postgres.${STAGING}:pw@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`,
    });
    expect(result.warnings.join(' ')).not.toContain('AAAA');
  });
});

describe('variables repetidas en el mismo fichero', () => {
  /*
   * La regresión que motiva esto: `.env.local` llegó a tener
   * `SUPABASE_DATABASE_URL` tres veces —proyecto viejo, proyecto nuevo, y un
   * marcador `...` sin sustituir— y ganaba la última. El guardián informaba de
   * una cadena de tres caracteres mientras la buena estaba cinco líneas más
   * arriba. Ningún parser se queja de una clave repetida: una de las dos
   * simplemente deja de existir.
   */
  const fichero = [
    'SUPABASE_ENV=staging',
    'SUPABASE_DATABASE_URL=postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:x@aws-1-eu-west-1.pooler.supabase.com:5432/postgres',
    'PUBLIC_SUPABASE_URL=https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
    '',
    '# pegado después, sin borrar lo anterior',
    'SUPABASE_DATABASE_URL=...',
    'CRON_SECRET=abc',
  ].join('\n');

  async function conFichero(contenido: string) {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'guardia-'));
    writeFileSync(join(dir, '.env.local'), contenido, 'utf8');
    const { duplicateKeys } = await import('../../scripts/staging-guard.mjs');
    return duplicateKeys(dir);
  }

  it('encuentra la clave repetida y dice en qué líneas', async () => {
    const repetidas = await conFichero(fichero);
    const db = repetidas.find((r: { key: string }) => r.key === 'SUPABASE_DATABASE_URL');
    expect(db).toBeDefined();
    expect(db!.lines).toEqual([2, 6]);
    expect(db!.file).toBe('.env.local');
  });

  it('no inventa duplicados donde no los hay', async () => {
    const limpio = ['SUPABASE_ENV=staging', 'CRON_SECRET=abc'].join('\n');
    expect(await conFichero(limpio)).toEqual([]);
  });

  it('ignora comentarios y líneas en blanco', async () => {
    const conRuido = ['# SUPABASE_ENV=staging', '', 'SUPABASE_ENV=staging'].join('\n');
    expect(await conFichero(conRuido)).toEqual([]);
  });
});
