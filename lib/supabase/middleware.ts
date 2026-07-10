import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PREFIXES = [
  '/dashboard', '/calendar', '/patients', '/services', '/working-hours',
  '/waiting-list', '/scheduler', '/analytics', '/templates', '/settings',
  '/ai-assistant', '/lab', '/onboarding',
]

const AUTH_PREFIXES = ['/login', '/signup', '/forgot-password']

// Fully public, DB-free routes. The demo runs entirely client-side in memory,
// so it must never touch Supabase — we short-circuit here BEFORE creating the
// server client, which also keeps /demo reachable even when Supabase env vars
// are absent (e.g. a fresh local checkout with no .env).
const PUBLIC_PREFIXES = ['/demo']

export async function updateSession(request: NextRequest) {
  if (PUBLIC_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isAuthPage = AUTH_PREFIXES.some((p) => path.startsWith(p))
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p))

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', path)
    return NextResponse.redirect(url)
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
