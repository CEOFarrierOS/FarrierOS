import { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured on this device.");
  return client;
}

export async function registerFarrier(email: string, password: string, fullName: string) {
  const { data, error } = await requireClient().auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data;
}

export async function signInFarrier(email: string, password: string) {
  const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOutFarrier() {
  const { error } = await requireClient().auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  const { error } = await requireClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/`,
  });
  if (error) throw error;
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await requireClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentWorkspace() {
  const { data, error } = await requireClient()
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name)")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const workspace = Array.isArray(data.workspaces) ? data.workspaces[0] : data.workspaces;
  return {
    id: data.workspace_id as string,
    role: data.role as string,
    name: (workspace as { name?: string } | null)?.name ?? "FarrierOS workspace",
  };
}
