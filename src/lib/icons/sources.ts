import { createClient } from "@supabase/supabase-js";
import { GAME_PRODUCT, USER_AGENT } from "@/lib/game-data/wago";
import { supabaseEnv, supabaseSecretKey } from "@/lib/supabase/env";
import type { IconSources } from "./serve";

const BUCKET = "icons";

/** Used when no storage is configured (local development): kept for the life of the process. */
const memory = new Map<number, Uint8Array>();

async function fetchGameFile(fileId: number): Promise<Uint8Array | null> {
  const response = await fetch(`https://wago.tools/api/casc/${fileId}?product=${GAME_PRODUCT}`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
}

/** Icons are kept in a public Supabase Storage bucket; only the server can write to it. */
export function iconSources(): IconSources {
  const env = supabaseEnv();
  const secret = supabaseSecretKey();

  return {
    fetchGameFile,
    async readStored(fileId) {
      if (!env) return memory.get(fileId) ?? null;
      const response = await fetch(`${env.url}/storage/v1/object/public/${BUCKET}/${fileId}.webp`, {
        cache: "no-store",
      });
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    },
    async store(fileId, webp) {
      if (!env || !secret) {
        memory.set(fileId, webp);
        return;
      }
      const admin = createClient(env.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await admin.storage
        .from(BUCKET)
        .upload(`${fileId}.webp`, webp, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
      if (error) throw new Error(error.message);
    },
  };
}
