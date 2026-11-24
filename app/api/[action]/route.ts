import { env } from "cloudflare:workers";
import { handleSchoolRequest } from "../../../lib/school-api.mjs";
import { createSupabaseStorage } from "../../../lib/supabase-storage.mjs";
import { lessons } from "../../../lib/curriculo.js";

export const dynamic = "force-dynamic";

function handle(request: Request) {
  const storage = createSupabaseStorage(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  return handleSchoolRequest(request, storage, lessons);
}

export const GET = handle;
export const POST = handle;
