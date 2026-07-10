/* eslint-disable no-console */
import { Client } from 'pg';

const TEST_EMAIL_PREFIX = 'e2e+';

/**
 * Truncates all E2E test data in FK-safe order (children before parents).
 * Connects directly to Postgres — bypasses the API and Supabase Admin API
 * entirely, so it works even if a previous run crashed mid-flow and left
 * the app/API in a weird state.
 *
 * Scope: only rows belonging to profiles whose email starts with "e2e+".
 * Safe to call at the start AND end of every run — idempotent, no-op if
 * there's nothing to clean.
 *
 * Note: this does NOT delete rows from `auth.users` — that table is
 * managed by Supabase Auth (GoTrue), not part of the `public` schema,
 * and deleting from it directly via SQL can leave Auth in an inconsistent
 * state. Auth user deletion stays on the Supabase Admin API
 * (`supabase.auth.admin.deleteUser`), which global-setup.ts /
 * global-teardown.ts already handle separately.
 */
export async function cleanupE2EData(): Promise<void> {
  const connectionString = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    console.warn(
      'cleanupE2EData: no E2E_DATABASE_URL or DATABASE_URL set — skipping DB cleanup. ' +
        'Set E2E_DATABASE_URL in .env.test to enable this.',
    );
    return;
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
  } catch (err) {
    // Never let a DB connectivity problem take down the whole test run —
    // log loudly and continue. Worst case, stale rows linger and the
    // uniqueness errors this mechanism exists to prevent come back,
    // which is a visible, debuggable failure rather than a silent one.
    console.error(
      `cleanupE2EData: could not connect to ${connectionString.replace(/:[^:@]+@/, ':****@')} — ${(err as Error).message}`,
    );
    return;
  }

  try {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM profiles WHERE email LIKE $1`,
      [`${TEST_EMAIL_PREFIX}%`],
    );
    const userIds = rows.map((r) => r.id);

    if (userIds.length === 0) {
      console.log('cleanupE2EData: no e2e+ test profiles found, nothing to clean');
      return;
    }

    // Children before parents. Each step is independently safe to re-run.
    await client.query(
      `DELETE FROM digest_items WHERE digest_id IN (
         SELECT id FROM digests WHERE workspace_id IN (
           SELECT id FROM workspaces WHERE owner_id = ANY($1)
         )
       )`,
      [userIds],
    );
    await client.query(
      `DELETE FROM digests WHERE workspace_id IN (
         SELECT id FROM workspaces WHERE owner_id = ANY($1)
       )`,
      [userIds],
    );
    await client.query(`DELETE FROM updates WHERE user_id = ANY($1)`, [userIds]);
    await client.query(`DELETE FROM workspace_members WHERE user_id = ANY($1)`, [
      userIds,
    ]);
    await client.query(
      `DELETE FROM workspace_invites WHERE workspace_id IN (
         SELECT id FROM workspaces WHERE owner_id = ANY($1)
       )`,
      [userIds],
    );
    await client.query(`DELETE FROM workspaces WHERE owner_id = ANY($1)`, [userIds]);
    await client.query(`DELETE FROM profiles WHERE id = ANY($1)`, [userIds]);

    console.log(
      `cleanupE2EData: removed ${userIds.length} test profile(s) and related data`,
    );
  } catch (err) {
    console.error(`cleanupE2EData: cleanup query failed — ${(err as Error).message}`);
    // Don't rethrow — see note above on connection failures. A cleanup
    // failure should be loud but not block the run from proceeding;
    // the alternative (throwing here) risks the same "teardown never
    // ran" problem we're trying to get away from.
  } finally {
    await client.end();
  }
}
