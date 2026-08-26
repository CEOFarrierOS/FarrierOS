import { appConfig } from "../config";
import { getSupabaseClient } from "./supabase";

export interface CoifHorseIntake {
  name: string;
  breed: string;
  age: string;
  color: string;
  use: string;
  currentService: string;
  serviceIntervalWeeks: number;
  lamenessIssues: string;
  medicalNotes: string;
  temperament: string;
  safetyNotes: string;
}

export interface CoifPayload {
  owner: { firstName: string; lastName: string; phone: string; email: string; name?: string };
  property: { name: string; serviceAddress: string; gateCode: string; otherInstructions: string; accessInstructions?: string };
  horses: CoifHorseIntake[];
  messagingConsent: boolean;
  signature: string;
}

export function coifOwnerName(owner: CoifPayload["owner"]) {
  return [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim() || owner.name?.trim() || "Unnamed owner";
}

export interface CoifLinkRecord {
  id: string;
  status: string;
  owner_name_hint: string | null;
  owner_phone_hint: string | null;
  expires_at: string;
  created_at: string;
}

export interface CoifSubmissionRecord {
  id: string;
  link_id: string;
  owner_contact: CoifPayload["owner"];
  property_and_access: CoifPayload["property"];
  horse_intakes: CoifHorseIntake[];
  messaging_consent: { consent: boolean; signature: string };
  submitted_at: string;
  reviewed_at: string | null;
  imported_record_ids: string[];
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createCoifLink(workspaceId: string, ownerNameHint = "", ownerPhoneHint = "") {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Cloud accounts are not configured.");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sign in before creating a COIF link.");
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64Url(bytes);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from("coif_links").insert({
    workspace_id: workspaceId, created_by: userData.user.id, token_hash: await sha256(token), status: "sent",
    owner_name_hint: ownerNameHint.trim() || null, owner_phone_hint: ownerPhoneHint.trim() || null, expires_at: expiresAt,
  }).select("id, expires_at").single();
  if (error) throw error;
  return { id: data.id as string, expiresAt: data.expires_at as string, url: `${window.location.origin}/coif/${token}` };
}

export async function listCoifLinks(workspaceId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("coif_links").select("id,status,owner_name_hint,owner_phone_hint,expires_at,created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  if (error) throw error;
  return data as CoifLinkRecord[];
}

export async function listCoifSubmissions(workspaceId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("coif_submissions").select("id,link_id,owner_contact,property_and_access,horse_intakes,messaging_consent,submitted_at,reviewed_at,imported_record_ids").eq("workspace_id", workspaceId).order("submitted_at", { ascending: false });
  if (error) throw error;
  return data as CoifSubmissionRecord[];
}

export async function markCoifImported(submissionId: string, linkId: string, recordIds: string[]) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Cloud accounts are not configured.");
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("coif_submissions").update({ reviewed_at: new Date().toISOString(), reviewed_by: userData.user?.id, imported_record_ids: recordIds }).eq("id", submissionId);
  if (error) throw error;
  const { error: linkError } = await supabase.from("coif_links").update({ status: "imported", updated_at: new Date().toISOString() }).eq("id", linkId);
  if (linkError) throw linkError;
}

export async function revokeCoifLink(linkId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Cloud accounts are not configured.");
  const { error } = await supabase.from("coif_links").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", linkId);
  if (error) throw error;
}

export async function callPublicCoif(token: string, action: "inspect" | "submit", payload?: CoifPayload) {
  const response = await fetch(`${appConfig.supabaseUrl}/functions/v1/coif-public`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: appConfig.supabaseAnonKey },
    body: JSON.stringify({ action, token, payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "COIF service is temporarily unavailable.");
  return result as { valid?: boolean; ownerHint?: string; expiresAt?: string; farrierName?: string; businessName?: string; submitted?: boolean };
}
