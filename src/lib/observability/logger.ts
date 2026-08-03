/**
 * Structured logging.
 *
 * One JSON line per event so Vercel's log drain, or anything downstream, can
 * query it without parsing prose. Redaction is enforced here rather than left
 * to call sites: any field whose key looks sensitive is replaced before it can
 * reach a log sink, so a careless `logger.info('x', req.body)` cannot leak a
 * password or a token.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEY = /pass(word)?|secret|token|api[_-]?key|authorization|cookie|card|cvv|iban/i;
const REDACTED = '[redactado]';

export type LogFields = Record<string, unknown>;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[profundidad máxima]';
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(entry, depth + 1);
    }
    return out;
  }

  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

function emit(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(redact(fields) as LogFields),
  });

  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    default:
      console.info(line);
  }
}

export const logger = {
  debug: (event: string, fields?: LogFields) => {
    if (import.meta.env.DEV) emit('debug', event, fields);
  },
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};

/** Wraps an unknown thrown value into something safe to log. */
export function describeError(error: unknown): { message: string; name?: string } {
  if (error instanceof Error) return { message: error.message, name: error.name };
  return { message: String(error) };
}
