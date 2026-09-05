import { createClient } from "@supabase/supabase-js";
import { portalFetch } from "./session-recovery";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const hasSupabaseConfig = Boolean(
  supabaseUrl && supabaseKey && !supabaseKey.includes("replace-with"),
);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseKey, {
      global: { fetch: portalFetch },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
