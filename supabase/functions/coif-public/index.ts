import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token : "";
    if (token.length < 32 || token.length > 200) return json({ error: "This COIF link is invalid." }, 400);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: link, error } = await admin.from("coif_links").select("id,workspace_id,status,expires_at,owner_name_hint").eq("token_hash", await hashToken(token)).maybeSingle();
    if (error) throw error;
    if (!link || new Date(link.expires_at) <= new Date() || ["expired", "revoked", "imported"].includes(link.status)) return json({ error: "This COIF link has expired or is no longer available." }, 410);
    if (body.action === "inspect") {
      if (link.status === "sent") await admin.from("coif_links").update({ status: "opened", updated_at: new Date().toISOString() }).eq("id", link.id);
      return json({ valid: true, ownerHint: link.owner_name_hint, expiresAt: link.expires_at });
    }
    if (body.action !== "submit") return json({ error: "Invalid request." }, 400);
    if (link.status === "submitted") return json({ error: "This form has already been submitted." }, 409);
    const payload = body.payload;
    const ownerFirstName = payload?.owner?.firstName?.trim();
    const ownerLastName = payload?.owner?.lastName?.trim();
    const legacyOwnerName = payload?.owner?.name?.trim();
    if ((!legacyOwnerName && (!ownerFirstName || !ownerLastName)) || !payload?.owner?.phone?.trim() || !payload?.property?.serviceAddress?.trim() || !payload?.signature?.trim()) return json({ error: "Complete all required fields before submitting." }, 400);
    if (!Array.isArray(payload.horses) || payload.horses.length < 1 || payload.horses.length > 100 || payload.horses.some((horse: { name?: string }) => !horse.name?.trim())) return json({ error: "Add a name for every horse before submitting." }, 400);
    if (JSON.stringify(payload).length > 250000) return json({ error: "This submission is too large." }, 413);
    const { error: insertError } = await admin.from("coif_submissions").insert({ link_id: link.id, workspace_id: link.workspace_id, owner_contact: payload.owner, property_and_access: payload.property, horse_intakes: payload.horses, messaging_consent: { consent: Boolean(payload.messagingConsent), signature: payload.signature } });
    if (insertError) throw insertError;
    await admin.from("coif_links").update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", link.id);
    return json({ submitted: true });
  } catch (error) {
    console.error(error);
    return json({ error: "The COIF service could not process this request." }, 500);
  }
});
