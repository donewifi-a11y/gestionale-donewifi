import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ★ NUOVA — equivalente del controllo fatto da doGet() nel gestionale
// Apps Script: qui, invece che ricalcolare i permessi ad ogni pagina
// dentro ogni file, un unico proxy (ex "middleware", rinominato in
// Next.js 16) protegge tutte le rotte autenticate e lascia libere
// login/richiesta-dati pubblica.
//
// ★ FIX — mancavano quasi tutte le rotte pubbliche del gestionale: Portale
// clienti (apertura Ticket/verifica stato, senza login per definizione),
// Disdetta, Richiesta Cliente (Cambio IBAN/Anagrafica/Trasferimento/
// Subentro), Approvazione intervento via email, Privacy e i cron job.
// Un visitatore non loggato su una qualsiasi di queste veniva rimandato a
// /login invece di vedere la pagina — di fatto rendendole irraggiungibili
// da chi non ha un account staff, cioè esattamente il pubblico a cui sono
// rivolte. `/api/cron/*` non è "pubblica" in senso stretto (verifica
// CRON_SECRET al suo interno, vedi src/lib/cron.ts) ma va comunque esclusa
// qui: altrimenti Vercel Cron riceverebbe un redirect a /login invece di
// eseguire il job.
const ROTTE_PUBBLICHE = [
  "/login",
  "/portale",
  "/api/portale",
  "/disdetta",
  "/richiesta-cliente",
  "/api/richiesta-cliente",
  "/richiesta-dati",
  "/api/richiesta-dati",
  "/approva",
  "/api/approva",
  "/privacy",
  "/api/cron",
];

// ★ sottodominio pubblico per i clienti (apertura Ticket / verifica stato):
// su questi host la radice "/" mostra subito il Portale invece della home
// interna (Mondo Ticket, dietro login) — un cliente non deve mai vedere o
// dover conoscere l'URL /portale per arrivarci. Aggiungi qui eventuali
// altri host equivalenti (es. un dominio di anteprima) se servono.
const DOMINI_PORTALE = ["area.donewifi.it"];

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  if (DOMINI_PORTALE.includes(host) && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/portale";
    return NextResponse.rewrite(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPubblica = ROTTE_PUBBLICHE.some((p) => pathname.startsWith(p));

  if (!user && !isPubblica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};