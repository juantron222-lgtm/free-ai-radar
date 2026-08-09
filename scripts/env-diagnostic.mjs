#!/usr/bin/env node
/**
 * FASE A — what the build process sees.
 *
 * TEMPORARY DIAGNOSTIC. Runs as `prebuild`, so npm executes it immediately
 * before `astro build`, in the same process tree and with the same
 * environment. If a variable is absent here, it never reached the build and
 * nothing downstream can recover it.
 *
 * Prints booleans only. Delete this file, its `prebuild` hook, and
 * `src/pages/api/zz-env-diagnostic.ts` once the question is answered.
 */

import { deploymentContext, envReport, formatReport } from './env-shape.mjs';

console.log('\n┌─ DIAGNÓSTICO DE ENTORNO (temporal) ─────────────');
console.log('│ Fase A: lo que ve el proceso de build');
console.log('└─────────────────────────────────────────────────');

const context = deploymentContext(process.env);
for (const [key, value] of Object.entries(context)) {
  console.log(`  ${key.padEnd(24)} ${value ?? '(sin definir)'}`);
}

console.log('');
console.log(formatReport(envReport('process.env (build)', process.env)));

/*
 * A count of how many variables the build can see at all.
 *
 * Not their names — a name can leak intent — just the total, which
 * distinguishes "Vercel passed nothing" from "Vercel passed everything except
 * these three".
 */
const total = Object.keys(process.env).length;
const publicOnes = Object.keys(process.env).filter((k) => k.startsWith('PUBLIC_')).length;
const supabaseOnes = Object.keys(process.env).filter((k) => k.startsWith('SUPABASE_')).length;

console.log('');
console.log(`  variables en el entorno del build: ${total}`);
console.log(`    de ellas PUBLIC_*:               ${publicOnes}`);
console.log(`    de ellas SUPABASE_*:             ${supabaseOnes}`);
console.log('─────────────────────────────────────────────────\n');
