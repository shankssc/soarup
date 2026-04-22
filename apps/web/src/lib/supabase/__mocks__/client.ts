//apps/web/src/lib/supabase/__mocks__/client.ts

export const createClient = vi.fn(() => ({
  auth: {
    setSession: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
  },
}));
