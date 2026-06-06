import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const dummy = {
  from: () => ({ select: async () => ({ data: [], error: null }), upsert: async () => ({ error: null }) }),
  channel: () => ({ on: () => ({ subscribe: () => {} }) }),
  auth: {
    signUp: async () => ({ data: null, error: null }),
    signInWithPassword: async () => ({ data: null, error: null }),
    signOut: async () => {},
  },
};

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : (dummy as ReturnType<typeof createClient>);
