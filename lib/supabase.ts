import { createClient } from "@supabase/supabase-js";

function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const url = need("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = need("SUPABASE_SERVICE_ROLE_KEY");

// Server-side admin client (service role)
export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

// Optional: if you also want a “public” client (server-side only here)
export const supabase = supabaseAdmin;
