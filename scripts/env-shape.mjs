/**
 * Shape of the environment, never its contents.
 *
 * TEMPORARY DIAGNOSTIC. Delete once we know where the Supabase variables
 * disappear between Vercel's settings and `supabase.isConfigured`.
 *
 * One module, used by both the prebuild script and the runtime endpoint, so
 * the two cannot report different things about the same variable and send us
 * chasing a difference that is only in the reporting.
 *
 * Every value returned is a boolean or a fixed-vocabulary string. No value, no
 * prefix, no length, no hash: a length is a fingerprint and a hash of a short
 * secret is reversible by anyone willing to guess.
 */

/** Booleans about a URL-shaped variable. */
export function urlShape(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  let parsed = null;
  try {
    parsed = raw ? new URL(raw) : null;
  } catch {
    parsed = null;
  }

  return {
    present: raw.length > 0,
    nonEmpty: raw.length > 0,
    validHttpsUrl: parsed !== null && parsed.protocol === 'https:',
    hostEndsWithSupabaseCo: parsed !== null && /\.supabase\.co$/.test(parsed.hostname),
  };
}

/** Booleans about a key-shaped variable. */
export function keyShape(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  return {
    present: raw.length > 0,
    longerThan20: raw.length > 20,
  };
}

/**
 * The full report for one source of environment values.
 *
 * `source` names where the values came from — `process.env`, `import.meta.env`
 * — because the whole point of this exercise is that those two may disagree.
 */
export function envReport(source, env) {
  return {
    source,
    PUBLIC_SUPABASE_URL: urlShape(env['PUBLIC_SUPABASE_URL']),
    PUBLIC_SUPABASE_ANON_KEY: keyShape(env['PUBLIC_SUPABASE_ANON_KEY']),
    SUPABASE_SERVICE_ROLE_KEY: keyShape(env['SUPABASE_SERVICE_ROLE_KEY']),
  };
}

/** Deployment context, which is not secret and is what we are diagnosing. */
export function deploymentContext(env) {
  return {
    VERCEL_ENV: env['VERCEL_ENV'] ?? null,
    VERCEL_GIT_COMMIT_REF: env['VERCEL_GIT_COMMIT_REF'] ?? null,
    DEPLOYMENT_ENV: env['DEPLOYMENT_ENV'] ?? null,
  };
}

/** Renders a report as lines, for a build log. */
export function formatReport(report) {
  const lines = [`  [${report.source}]`];
  for (const [name, shape] of Object.entries(report)) {
    if (name === 'source') continue;
    const flags = Object.entries(shape)
      .map(([k, v]) => `${k}=${v}`)
      .join('  ');
    lines.push(`    ${name.padEnd(26)} ${flags}`);
  }
  return lines.join('\n');
}
