/* eslint-disable no-console */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const TEST_EMAIL_PATTERN = /^e2e\+/;
const STORAGE_STATE = path.join('tests', 'e2e', '.auth', 'seed-user.json');

async function globalTeardown() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    process.stderr.write(
      'globalTeardown: missing SUPABASE_SERVICE_ROLE_KEY — skipping cleanup\n',
    );
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });

  if (error) {
    process.stderr.write(`globalTeardown: failed to list users — ${error.message}\n`);
    return;
  }

  const testUsers = (data?.users ?? []).filter(
    (u) => u.email && TEST_EMAIL_PATTERN.test(u.email),
  );

  for (const user of testUsers) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) {
      process.stderr.write(
        `globalTeardown: failed to delete ${user.email} — ${deleteError.message}\n`,
      );
    } else {
      process.stdout.write(`✓ Deleted test user: ${user.email}\n`);
    }
  }

  // Clean up saved auth state
  if (fs.existsSync(STORAGE_STATE)) {
    fs.unlinkSync(STORAGE_STATE);
    process.stdout.write('✓ Cleaned up saved auth state\n');
  }
}

export default globalTeardown;
