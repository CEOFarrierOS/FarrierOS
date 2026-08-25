import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { appConfig, integrationStatus } from "../config";

let client: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (!integrationStatus.supabase) return null;
  if (!client) {
    client = createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
