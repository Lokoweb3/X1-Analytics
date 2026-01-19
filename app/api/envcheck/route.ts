import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";

  const srk =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";

  const cron = process.env.CRON_SECRET || "";

  return NextResponse.json({
    ok: true,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: !!url,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
      CRON_SECRET: !!cron,
    },
    prefixes: {
      url: url ? url.slice(0, 30) : null,
      serviceRoleKey: srk ? srk.slice(0, 6) : null,
      cronSecret: cron ? cron.slice(0, 6) : null,
    },
  });
}
