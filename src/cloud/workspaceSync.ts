import { AppData } from "../types";
import { getSupabaseClient } from "./supabase";

export interface CloudSnapshot {
  data: AppData;
  version: number;
  updatedAt: string;
}

export async function loadWorkspaceSnapshot(workspaceId: string): Promise<CloudSnapshot | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("workspace_state")
    .select("data, version, updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    data: data.data as AppData,
    version: data.version,
    updatedAt: data.updated_at,
  };
}

export async function saveWorkspaceSnapshot(workspaceId: string, data: AppData, expectedVersion: number) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Cloud sync is not configured.");

  const { data: saved, error } = await supabase
    .from("workspace_state")
    .update({ data, version: expectedVersion + 1, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("version", expectedVersion)
    .select("version, updated_at")
    .maybeSingle();

  if (error) throw error;
  if (!saved) throw new Error("This workspace changed on another device. Reload before saving again.");
  return { version: saved.version, updatedAt: saved.updated_at };
}
