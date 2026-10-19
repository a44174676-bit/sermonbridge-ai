import "server-only";
export function supabaseConfig() {
  if (process.env.APP_MODE === "demo") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  // Only a public anon/publishable key is used; the app never needs a service-role key.
  return { url, key };
}
