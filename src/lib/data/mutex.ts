/**
 * A promise-chain mutex for the JSON-file stores used in development.
 *
 * Those stores do read-modify-write on a whole file. Without serialisation two
 * concurrent requests both read the same snapshot and the second write silently
 * discards the first — favourites vanishing, a freshly created account not
 * existing on the next request. It surfaced under parallel end-to-end runs and
 * would hit any developer with two browser tabs open.
 *
 * Each store gets its own lock so an operation on favourites never waits on one
 * for the newsletter.
 *
 * Not needed for the Supabase backends: Postgres does this properly.
 */
export function createMutex() {
  let queue: Promise<unknown> = Promise.resolve();

  return function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    // Keep the chain alive even when an operation rejects.
    queue = result.catch(() => undefined);
    return result;
  };
}
