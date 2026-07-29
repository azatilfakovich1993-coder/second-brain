import { createClient } from "@supabase/supabase-js";

let client = null;

function getClient(env) {
  if (!client) {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  }
  return client;
}

export async function insertNote(env, { telegramUserId, text, type, embedding, dueAt }) {
  const { data, error } = await getClient(env)
    .from("notes")
    .insert({
      telegram_user_id: telegramUserId,
      text,
      type,
      embedding,
      due_at: dueAt ?? null,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw new Error(`insertNote failed: ${error.message}`);
  return data;
}

export async function getFeed(env, telegramUserId, limit = 50) {
  const { data, error } = await getClient(env)
    .from("notes")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getFeed failed: ${error.message}`);
  return data;
}

export async function getTasks(env, telegramUserId) {
  const { data, error } = await getClient(env)
    .from("notes")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .eq("type", "task")
    .neq("status", "done")
    .order("due_at", { ascending: true });
  if (error) throw new Error(`getTasks failed: ${error.message}`);
  return data;
}

/** Tasks whose reminder time has arrived but hasn't been sent yet. */
export async function getDueReminders(env) {
  const { data, error } = await getClient(env)
    .from("notes")
    .select("*")
    .eq("type", "task")
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString());
  if (error) throw new Error(`getDueReminders failed: ${error.message}`);
  return data;
}

export async function markStatus(env, id, status) {
  const { error } = await getClient(env).from("notes").update({ status }).eq("id", id);
  if (error) throw new Error(`markStatus failed: ${error.message}`);
}

export async function searchSimilar(env, telegramUserId, embedding, matchCount = 5) {
  const { data, error } = await getClient(env).rpc("match_notes", {
    query_embedding: embedding,
    match_user_id: telegramUserId,
    match_count: matchCount,
  });
  if (error) throw new Error(`searchSimilar failed: ${error.message}`);
  return data;
}

/** Distinct users who have at least one note — used to fan out the evening digest. */
export async function getAllUserIds(env) {
  const { data, error } = await getClient(env).from("notes").select("telegram_user_id");
  if (error) throw new Error(`getAllUserIds failed: ${error.message}`);
  return [...new Set(data.map((r) => r.telegram_user_id))];
}

export async function getNotesSince(env, telegramUserId, sinceIso) {
  const { data, error } = await getClient(env)
    .from("notes")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .gte("created_at", sinceIso);
  if (error) throw new Error(`getNotesSince failed: ${error.message}`);
  return data;
}

const DEFAULT_TIMEZONE = "Europe/Samara";

/** The user's chosen IANA timezone (set via /timezone), or the default if never set. */
export async function getUserTimezone(env, telegramUserId) {
  const { data, error } = await getClient(env)
    .from("user_settings")
    .select("timezone")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (error) throw new Error(`getUserTimezone failed: ${error.message}`);
  return data?.timezone ?? DEFAULT_TIMEZONE;
}

export async function setUserTimezone(env, telegramUserId, timezone) {
  const { error } = await getClient(env)
    .from("user_settings")
    .upsert({ telegram_user_id: telegramUserId, timezone });
  if (error) throw new Error(`setUserTimezone failed: ${error.message}`);
}
