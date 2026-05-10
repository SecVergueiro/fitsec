import { NextRequest, NextResponse } from "next/server";

// Rotas que não precisam de nenhuma verificação (auth feita pelo AuthProvider no cliente)
const ALWAYS_PUBLIC = ["/login", "/public", "/_next", "/api", "/manifest", "/sw.js", "/icon", "/favicon"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Arquivos estáticos e rotas sempre públicas passam direto
  if (
    ALWAYS_PUBLIC.some((p) => pathname.startsWith(p)) ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Tudo mais passa direto — o AuthProvider no cliente faz o redirect para /login
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
