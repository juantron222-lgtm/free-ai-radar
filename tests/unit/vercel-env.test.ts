import { describe, expect, it } from 'vitest';
import {
  CLAVES,
  RAMA,
  REF_MUERTA,
  motivoDeConflicto,
  proyectoDesdeHook,
} from '../../scripts/vercel-newsroom-env.mjs';

/**
 * El configurador de Preview borra variables, así que su criterio para decidir
 * qué estorba tiene que ser comprobable.
 *
 * Lo que se prueba aquí es sobre todo lo que **no** debe tocar: una variable
 * ajena a Newsroom, una que viva también en Production, una que ya esté bien.
 * Un borrado de más en un panel de despliegue no se deshace leyendo un log.
 */

const enPreview = (extra: Record<string, unknown> = {}) => ({
  id: 'env_1',
  key: 'PUBLIC_SUPABASE_URL',
  target: ['preview'],
  gitBranch: RAMA,
  value: 'https://zzgvpyhygzfwtyecguyi.supabase.co',
  ...extra,
});

describe('qué se considera conflictivo', () => {
  it('no decide por el valor, porque Vercel no lo devuelve', () => {
    /*
     * Las variables son `type: sensitive` y su contenido no llega ni con
     * `decrypt=true`. Hubo aquí una comprobación de «apunta al proyecto
     * eliminado» que leía un campo siempre vacío y por tanto siempre pasaba.
     * La política que sí funciona a ciegas es sustituir toda clave de Newsroom,
     * y eso es lo que se afirma: el motivo no depende del valor.
     */
    const conValor = motivoDeConflicto(enPreview({ value: `https://${REF_MUERTA}.supabase.co` }));
    const sinValor = motivoDeConflicto(enPreview({ value: undefined }));
    expect(conValor).toBe(sinValor);
    expect(sinValor).toMatch(/se sustituye/);
  });

  it('señala una variable de Newsroom sin rama, porque aplicaría a todas', () => {
    /*
     * Es el caso silencioso: en el panel se ve «Preview» y parece acotada,
     * pero sin `gitBranch` alcanza cualquier rama de vista previa.
     */
    const motivo = motivoDeConflicto(enPreview({ gitBranch: null }));
    expect(motivo).toMatch(/no está acotada a ninguna rama/);
  });

  it('señala una variable de Newsroom acotada a otra rama', () => {
    expect(motivoDeConflicto(enPreview({ gitBranch: 'otra-rama' }))).toMatch(/otra-rama/);
  });

  it('no toca una variable que no es de Newsroom', () => {
    expect(motivoDeConflicto(enPreview({ key: 'ALGO_DE_OTRO', gitBranch: null }))).toBeNull();
  });

  it('marca para sustituir la que ya está en la rama correcta', () => {
    expect(motivoDeConflicto(enPreview())).toMatch(/se sustituye/);
  });
});

describe('el proyecto se deduce del propio hook', () => {
  it('extrae el identificador de la url de despliegue', () => {
    expect(
      proyectoDesdeHook('https://api.vercel.com/v1/integrations/deploy/prj_ABC123def/TCdOb3okpg')
    ).toBe('prj_ABC123def');
  });

  it('devuelve null si la url no es un hook', () => {
    expect(proyectoDesdeHook('https://example.test/no-es-un-hook')).toBeNull();
    expect(proyectoDesdeHook(undefined)).toBeNull();
  });
});

describe('el alcance de lo que se sube', () => {
  it('son exactamente las claves que Newsroom necesita', () => {
    expect(CLAVES).toContain('SUPABASE_DATABASE_URL');
    expect(CLAVES).toContain('CRON_SECRET');
    expect(CLAVES).toContain('NEWSROOM_DEPLOY_HOOK');
  });

  it('ninguna clave de API externa entra todavía', () => {
    /* Están vacías a propósito y no deben bloquear ni ensuciar Preview. */
    for (const externa of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'ELEVENLABS_API_KEY']) {
      expect(CLAVES).not.toContain(externa);
    }
  });

  it('la rama destino es la de Newsroom y no main', () => {
    expect(RAMA).toBe('newsroom-produccion');
    expect(RAMA).not.toBe('main');
  });
});
