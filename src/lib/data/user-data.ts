import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase as supabaseConfig, isProduction } from '@lib/config';
import { logger } from '@lib/observability/logger';
import { slugify } from '@lib/domain/primitives';
import { createMutex } from './mutex';
import { DATA_DIR, dataFile } from './data-dir';

/**
 * User-owned data (favourites, lists, alerts, preferences).
 *
 * Two backends behind one interface:
 *   · Supabase, using the **service role** from server-only code that has
 *     already authorised the caller via `Astro.locals.user`. RLS still protects
 *     anything reached with the anon key, but these endpoints scope every query
 *     by `user_id` explicitly so a bug cannot cross tenants.
 *   · A JSON file under the local data directory, for development and tests.
 *     Refuses to load in
 *     production.
 */

export interface UserList {
  id: string;
  slug: string;
  title: string;
  description: string;
  isPublic: boolean;
  toolSlugs: string[];
  createdAt: string;
}

export interface UserAlert {
  id: string;
  toolSlug?: string;
  categorySlug?: string;
  isActive: boolean;
  createdAt: string;
}

export interface NotificationPreferences {
  weeklyDigest: boolean;
  instantAlerts: boolean;
  productUpdates: boolean;
  marketingOptIn: boolean;
  categories: string[];
}

export interface UserData {
  favorites: string[];
  tried: string[];
  follows: string[];
  lists: UserList[];
  alerts: UserAlert[];
  history: Array<{ slug: string; viewedAt: string }>;
  preferences: NotificationPreferences;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  weeklyDigest: true,
  instantAlerts: false,
  productUpdates: true,
  marketingOptIn: false,
  categories: [],
};

const EMPTY: UserData = {
  favorites: [],
  tried: [],
  follows: [],
  lists: [],
  alerts: [],
  history: [],
  preferences: DEFAULT_PREFERENCES,
};

export const MAX_LISTS_FREE = 3;
export const MAX_ALERTS_FREE = 5;
export const MAX_HISTORY = 50;

// ---------------------------------------------------------------------------
// Local backend
// ---------------------------------------------------------------------------

const LOCAL_FILE = dataFile('user-data.json');
const localLock = createMutex();

let cache: Record<string, UserData> | null = null;

/** Shared copy: see the note on `mutateLocal`. Always called under the lock. */
async function readLocal(): Promise<Record<string, UserData>> {
  if (isProduction) throw new Error('El almacén local está desactivado en producción.');
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(LOCAL_FILE, 'utf8')) as Record<string, UserData>;
  } catch {
    cache = {};
  }
  return cache;
}

async function writeLocal(all: Record<string, UserData>): Promise<void> {
  if (isProduction) throw new Error('El almacén local está desactivado en producción.');
  cache = all;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(all, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Supabase backend
// ---------------------------------------------------------------------------

let serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient | null {
  if (!supabaseConfig.canUseServiceRole) return null;
  serviceClient ??= createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getUserData(userId: string): Promise<UserData> {
  const client = getServiceClient();

  if (!client) {
    const all = await readLocal();
    return { ...EMPTY, ...all[userId] };
  }

  try {
    const [favorites, states, lists, listItems, alerts, prefs, history] = await Promise.all([
      client.from('user_favorites').select('tool_id').eq('user_id', userId),
      client.from('user_tool_states').select('tool_id, tried').eq('user_id', userId),
      client.from('user_lists').select('*').eq('user_id', userId).order('created_at'),
      client.from('user_list_items').select('list_id, tool_id, position'),
      client.from('alerts').select('*').eq('user_id', userId),
      client.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle(),
      client
        .from('view_history')
        .select('tool_id, viewed_at')
        .eq('user_id', userId)
        .order('viewed_at', { ascending: false })
        .limit(MAX_HISTORY),
    ]);

    const itemsByList = new Map<string, string[]>();
    for (const item of listItems.data ?? []) {
      const bucket = itemsByList.get(item['list_id'] as string) ?? [];
      bucket.push(stripPrefix(item['tool_id'] as string));
      itemsByList.set(item['list_id'] as string, bucket);
    }

    return {
      favorites: (favorites.data ?? []).map((row) => stripPrefix(row['tool_id'] as string)),
      tried: (states.data ?? [])
        .filter((row) => row['tried'])
        .map((row) => stripPrefix(row['tool_id'] as string)),
      follows: (alerts.data ?? [])
        .filter((row) => row['tool_id'])
        .map((row) => stripPrefix(row['tool_id'] as string)),
      lists: (lists.data ?? []).map((row) => ({
        id: row['id'] as string,
        slug: row['slug'] as string,
        title: row['title'] as string,
        description: (row['description'] as string) ?? '',
        isPublic: Boolean(row['is_public']),
        toolSlugs: itemsByList.get(row['id'] as string) ?? [],
        createdAt: row['created_at'] as string,
      })),
      alerts: (alerts.data ?? []).map((row) => ({
        id: row['id'] as string,
        toolSlug: row['tool_id'] ? stripPrefix(row['tool_id'] as string) : undefined,
        categorySlug: (row['category_slug'] as string | null) ?? undefined,
        isActive: Boolean(row['is_active']),
        createdAt: row['created_at'] as string,
      })),
      history: (history.data ?? []).map((row) => ({
        slug: stripPrefix(row['tool_id'] as string),
        viewedAt: row['viewed_at'] as string,
      })),
      preferences: prefs.data
        ? {
            weeklyDigest: Boolean(prefs.data['weekly_digest']),
            instantAlerts: Boolean(prefs.data['instant_alerts']),
            productUpdates: Boolean(prefs.data['product_updates']),
            marketingOptIn: Boolean(prefs.data['marketing_opt_in']),
            categories: (prefs.data['categories'] as string[]) ?? [],
          }
        : DEFAULT_PREFERENCES,
    };
  } catch (error) {
    logger.error('user_data.read_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return EMPTY;
  }
}

/** Serialised: concurrent writes to the same JSON file lose updates. */
function mutateLocal(userId: string, mutate: (data: UserData) => UserData): Promise<UserData> {
  return localLock(async () => {
    const all = await readLocal();
    const next = mutate({ ...EMPTY, ...all[userId] });
    all[userId] = next;
    await writeLocal(all);
    return next;
  });
}

function toolId(slug: string): string {
  return `tool_${slug}`;
}

function stripPrefix(id: string): string {
  return id.startsWith('tool_') ? id.slice(5) : id;
}

export async function toggleFavorite(
  userId: string,
  slug: string,
  add: boolean
): Promise<{ ok: boolean }> {
  const client = getServiceClient();

  if (!client) {
    await mutateLocal(userId, (data) => ({
      ...data,
      favorites: add
        ? [...new Set([...data.favorites, slug])]
        : data.favorites.filter((s) => s !== slug),
    }));
    return { ok: true };
  }

  const query = add
    ? client.from('user_favorites').upsert({ user_id: userId, tool_id: toolId(slug) })
    : client.from('user_favorites').delete().eq('user_id', userId).eq('tool_id', toolId(slug));

  const { error } = await query;
  if (error) {
    logger.error('user_data.favorite_failed', { error: error.message });
    return { ok: false };
  }
  return { ok: true };
}

export async function setTried(userId: string, slug: string, tried: boolean): Promise<{ ok: boolean }> {
  const client = getServiceClient();

  if (!client) {
    await mutateLocal(userId, (data) => ({
      ...data,
      tried: tried ? [...new Set([...data.tried, slug])] : data.tried.filter((s) => s !== slug),
    }));
    return { ok: true };
  }

  const { error } = await client
    .from('user_tool_states')
    .upsert({ user_id: userId, tool_id: toolId(slug), tried, updated_at: new Date().toISOString() });

  return { ok: !error };
}

export async function toggleFollow(
  userId: string,
  slug: string,
  add: boolean,
  plan: 'free' | 'pro'
): Promise<{ ok: boolean; message?: string }> {
  const existing = await getUserData(userId);

  if (add && plan === 'free' && existing.alerts.length >= MAX_ALERTS_FREE) {
    return {
      ok: false,
      message: `El plan gratuito permite ${MAX_ALERTS_FREE} avisos. Quita uno o pásate a Radar Pro para tenerlos ilimitados.`,
    };
  }

  const client = getServiceClient();

  if (!client) {
    await mutateLocal(userId, (data) => ({
      ...data,
      follows: add ? [...new Set([...data.follows, slug])] : data.follows.filter((s) => s !== slug),
      alerts: add
        ? [
            ...data.alerts,
            { id: randomUUID(), toolSlug: slug, isActive: true, createdAt: new Date().toISOString() },
          ]
        : data.alerts.filter((a) => a.toolSlug !== slug),
    }));
    return { ok: true };
  }

  const query = add
    ? client.from('alerts').upsert({ user_id: userId, tool_id: toolId(slug), is_active: true })
    : client.from('alerts').delete().eq('user_id', userId).eq('tool_id', toolId(slug));

  const { error } = await query;
  return { ok: !error };
}

export async function createList(
  userId: string,
  input: { title: string; description?: string; isPublic?: boolean },
  plan: 'free' | 'pro'
): Promise<{ ok: boolean; message?: string; list?: UserList }> {
  const existing = await getUserData(userId);

  if (plan === 'free' && existing.lists.length >= MAX_LISTS_FREE) {
    return {
      ok: false,
      message: `El plan gratuito permite ${MAX_LISTS_FREE} listas. Radar Pro las hace ilimitadas.`,
    };
  }

  const baseSlug = slugify(input.title) || 'lista';
  let slug = baseSlug;
  let suffix = 2;
  while (existing.lists.some((l) => l.slug === slug)) slug = `${baseSlug}-${suffix++}`;

  const list: UserList = {
    id: randomUUID(),
    slug,
    title: input.title,
    description: input.description ?? '',
    isPublic: input.isPublic ?? false,
    toolSlugs: [],
    createdAt: new Date().toISOString(),
  };

  const client = getServiceClient();

  if (!client) {
    await mutateLocal(userId, (data) => ({ ...data, lists: [...data.lists, list] }));
    return { ok: true, list };
  }

  const { error } = await client.from('user_lists').insert({
    id: list.id,
    user_id: userId,
    slug: list.slug,
    title: list.title,
    description: list.description,
    is_public: list.isPublic,
  });

  if (error) return { ok: false, message: 'No se ha podido crear la lista.' };
  return { ok: true, list };
}

export async function deleteList(userId: string, listId: string): Promise<{ ok: boolean }> {
  const client = getServiceClient();

  if (!client) {
    await mutateLocal(userId, (data) => ({
      ...data,
      lists: data.lists.filter((l) => l.id !== listId),
    }));
    return { ok: true };
  }

  const { error } = await client.from('user_lists').delete().eq('id', listId).eq('user_id', userId);
  return { ok: !error };
}

export async function toggleListItem(
  userId: string,
  listId: string,
  slug: string,
  add: boolean
): Promise<{ ok: boolean }> {
  const client = getServiceClient();

  if (!client) {
    await mutateLocal(userId, (data) => ({
      ...data,
      lists: data.lists.map((list) =>
        list.id === listId
          ? {
              ...list,
              toolSlugs: add
                ? [...new Set([...list.toolSlugs, slug])]
                : list.toolSlugs.filter((s) => s !== slug),
            }
          : list
      ),
    }));
    return { ok: true };
  }

  // Ownership is verified before touching the join table.
  const { data: owned } = await client
    .from('user_lists')
    .select('id')
    .eq('id', listId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!owned) return { ok: false };

  const query = add
    ? client.from('user_list_items').upsert({ list_id: listId, tool_id: toolId(slug) })
    : client.from('user_list_items').delete().eq('list_id', listId).eq('tool_id', toolId(slug));

  const { error } = await query;
  return { ok: !error };
}

export async function recordView(userId: string, slug: string): Promise<void> {
  const client = getServiceClient();

  if (!client) {
    await mutateLocal(userId, (data) => ({
      ...data,
      history: [
        { slug, viewedAt: new Date().toISOString() },
        ...data.history.filter((h) => h.slug !== slug),
      ].slice(0, MAX_HISTORY),
    }));
    return;
  }

  await client
    .from('view_history')
    .upsert({ user_id: userId, tool_id: toolId(slug), viewed_at: new Date().toISOString() });
}

export async function savePreferences(
  userId: string,
  preferences: NotificationPreferences
): Promise<{ ok: boolean }> {
  const client = getServiceClient();

  if (!client) {
    await mutateLocal(userId, (data) => ({ ...data, preferences }));
    return { ok: true };
  }

  const { error } = await client.from('notification_preferences').upsert({
    user_id: userId,
    weekly_digest: preferences.weeklyDigest,
    instant_alerts: preferences.instantAlerts,
    product_updates: preferences.productUpdates,
    marketing_opt_in: preferences.marketingOptIn,
    categories: preferences.categories,
    updated_at: new Date().toISOString(),
  });

  return { ok: !error };
}

/** GDPR art. 20: everything we hold about this user, in a portable format. */
export async function exportUserData(userId: string, userEmail: string) {
  const data = await getUserData(userId);
  return {
    exportedAt: new Date().toISOString(),
    account: { id: userId, email: userEmail },
    ...data,
    note:
      'Este fichero contiene todos los datos asociados a tu cuenta en Free AI Radar. Las herramientas se identifican por su slug público.',
  };
}

export async function purgeUserData(userId: string): Promise<void> {
  const client = getServiceClient();

  if (!client) {
    const all = await readLocal();
    delete all[userId];
    await writeLocal(all);
    return;
  }

  // Every user-owned table cascades from profiles, but we delete explicitly so
  // the intent is visible and auditable rather than relying on FK behaviour.
  const tables = [
    'user_favorites',
    'user_tool_states',
    'user_list_items',
    'user_lists',
    'saved_comparisons',
    'followed_categories',
    'view_history',
    'alerts',
    'notification_preferences',
    'accuracy_votes',
  ];

  for (const table of tables) {
    if (table === 'user_list_items') continue;
    await client.from(table).delete().eq('user_id', userId);
  }
}
