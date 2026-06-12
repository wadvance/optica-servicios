import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

const hasCredentials = !!supabaseUrl && !!supabaseAnonKey;

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
  hasCredentials
    ? createClient(supabaseUrl!, supabaseAnonKey!, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : (dummy as ReturnType<typeof createClient>);
