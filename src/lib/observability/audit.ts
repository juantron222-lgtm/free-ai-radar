import { createHash } from 'node:crypto';
import { mkdir, appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { supabase as supabaseConfig, isProduction } from '@lib/config';
import { logger } from './logger';

/**
 * Audit trail.
 *
 * Append-only by construction: there is no update or delete path here, and the
 * RLS policies grant no UPDATE or DELETE on `audit_logs` to anyone. An admin
 * can read history but not rewrite it.
 *
 * IP addresses are stored hashed. We need to correlate actions, not identify
 * network locations, and a hash is enough for that while keeping the log out of
 * scope for most personal-data concerns.
 */

export interface AuditEntry {
  actorId?: string;
  actorEmail?: string;
  action: string;
  entity: string;
  entityId?: string;
  diff?: Record<string, unknown>;
  ip?: string;
}

const LOCAL_FILE = join(process.cwd(), '.data', 'audit.log');

function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash('sha256').update(ip).digest('hex').slice(0, 24);
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  const row = {
    actor_id: entry.actorId ?? null,
    actor_email: entry.actorEmail ?? null,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    diff: entry.diff ?? null,
    ip_hash: hashIp(entry.ip) ?? null,
    created_at: new Date().toISOString(),
  };

  if (supabaseConfig.canUseServiceRole) {
    try {
      const client = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await client.from('audit_logs').insert(row);
      if (error) throw new Error(error.message);
      return;
    } catch (error) {
      // An audit write must never break the operation it is recording, but it
      // must be loudly visible when it fails.
      logger.error('audit.write_failed', {
        action: entry.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (isProduction) {
    logger.info('audit', row);
    return;
  }

  try {
    await mkdir(join(process.cwd(), '.data'), { recursive: true });
    await appendFile(LOCAL_FILE, `${JSON.stringify(row)}\n`, 'utf8');
  } catch (error) {
    logger.warn('audit.local_write_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface AuditRow {
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
}

export async function readRecentAudit(limit = 50): Promise<AuditRow[]> {
  if (supabaseConfig.canUseServiceRole) {
    try {
      const client = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data } = await client
        .from('audit_logs')
        .select('actor_email, action, entity, entity_id, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      return (data ?? []) as AuditRow[];
    } catch {
      return [];
    }
  }

  try {
    const raw = await readFile(LOCAL_FILE, 'utf8');
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditRow)
      .reverse()
      .slice(0, limit);
  } catch {
    return [];
  }
}
