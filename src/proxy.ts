import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ★ NUOVA — equivalente del controllo fatto da doGet() nel gestionale
// Apps Script: qui, invece che ricalcolare i permessi ad ogni pagina
// dentro ogni file, un unico proxy (ex "middleware", rinominato in
// Next.js 16) protegge tutte le rotte autenticate e lascia libere
// login/richiesta-dati pubblica.
const ROTTE_PUBBLICHE = ["/login", "/richiesta-dati"];

export async function proxy(request: NextRequest) {
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