/* eslint-disable no-console */
import { Client } from 'pg';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const TEST_EMAIL_PREFIX = 'e2e+';

/**
 * Deletes any audio objects in Minio/R2 belonging to e2e+ test users'
 * updates. Must run BEFORE the Postgres cascade below — once the
 * `updates` rows are deleted, their audio_key values are gone and the
 * orphaned objects in Minio become unreachable through this query.
 *
 * Non-fatal by design, same philosophy as the rest of this file: a
 * storage cleanup failure shouldn't block the DB cleanup or crash the
 * test run. Worst case, a handful of test audio objects accumulate in
 * the bucket — annoying, not run-breaking.
 */
async function cleanupE2EAudioObjects(
  client: Client,
  userIds: string[],
): Promise<void> {
  const endpoint = process.env.R2_PUBLIC_ENDPOINT_URL;
  const bucket = process.env.R2_BUCKET_NAME;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    console.warn(
      'cleanupE2EAudioObjects: Minio env vars not fully set — skipping audio ' +
        'object cleanup. Set R2_PUBLIC_ENDPOINT_URL, R2_BUCKET_NAME, ' +
        'R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in apps/web/.env.local to enable.',
    );
    return;
  }

  try {
    const { rows } = await client.query<{ audio_key: string }>(
      `SELECT audio_key FROM updates WHERE user_id = ANY($1) AND audio_key IS NOT NULL`,
      [userIds],
    );

    if (rows.length === 0) {
      console.log(
        'cleanupE2EAudioObjects: no test audio objects found, nothing to clean',
      );
      return;
    }

    const s3 = new S3Client({
      endpoint,
      region: 'auto',
      forcePathStyle: true, // required for Minio — it doesn't support virtual-hosted-style URLs
      credentials: { accessKeyId, secretAccessKey },
    });

    // DeleteObjects caps at 1000 keys per call — fine for test volumes,
    // but batch defensively in case a run somehow accumulates more.
    const keys = rows.map((r) => r.audio_key);
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })) },
        }),
      );
    }

    console.log(`cleanupE2EAudioObjects: removed ${keys.length} test audio object(s)`);
  } catch (err) {
    console.error(`cleanupE2EAudioObjects: cleanup failed — ${(err as Error).message}`);
    // Don't rethrow — see file-level note on non-fatal cleanup philosophy.
  }
}

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
 *
 * Also cleans up Minio/R2 audio objects belonging to test users' voice
 * updates — these live entirely outside Postgres (referenced only by
 * update.audio_key), so truncating the updates table alone would leak
 * them into the bucket forever. See cleanupE2EAudioObjects above.
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

    // Audio objects MUST be cleaned before the Postgres cascade below —
    // once `updates` rows are deleted, their audio_key values are gone
    // and these objects become unreachable through this query.
    await cleanupE2EAudioObjects(client, userIds);

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
