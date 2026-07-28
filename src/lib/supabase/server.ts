import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Client Supabase per Server Components / Route Handlers (legge/scrive i cookie di sessione). */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // chiamato da un Server Component: la sessione viene comunque
            // rinfrescata dal middleware, questo set può essere ignorato.
          }
        },
      },
    }
  );
}

/**
 * Client con la service role key — SOLO per API routes/server, bypassa
 * RLS. Usato dal modulo pubblico "Richiesta Dati" (nessun login) per
 * scrivere in modo controllato invece di aprire una policy anonima.
 */
export function createServiceClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}