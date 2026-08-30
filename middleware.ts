import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'experimental-edge'

// Edge-compatible Supabase auth helpers using raw fetch
async function getUser(accessToken?: string, request?: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const token = accessToken || request?.cookies.get('sb-access-token')?.value
  if (!token) {
    return { data: { user: null }, error: { status: 401, message: 'No token' } }
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'apikey': supabaseAnonKey,
      },
    })
    if (!res.ok) {
      return { data: { user: null }, error: { status: res.status, message: await res.text() } }
    }
    const json = await res.json()
    return { data: { user: json }, error: null }
  } catch (err) {
    return { data: { user: null }, error: { status: 500, message: String(err) } }
  }
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Get Supabase client config from env
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Handle session cookie state
  const cookieStore = request.cookies
  const setAll = (cookies: { name: string; value: string; options?: Record<string, unknown> }[]) => {
    cookies.forEach(({ name, value }) => cookieStore.set(name, value))
    supabaseResponse = NextResponse.next({ request })
    cookies.forEach(({ name, value, options }) =>
      supabaseResponse.cookies.set(name, value, options as Record<string, string | number | boolean>)
    )
  }

  // Handle auth session
  const { data: { user }, error: authError } = await getUser(undefined, request)

  // Handle 401 errors (session expired)
  if (authError?.status === 401) {
    const refreshToken = cookieStore.get('sb-refresh-token')?.value
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${refreshToken}`,
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json()
          // Update cookies
          setAll([
            { name: 'sb-access-token', value: refreshData.access_token },
            { name: 'sb-refresh-token', value: refreshData.refresh_token }
          ])
          // Retry auth with new token
          const { data: retryUser } = await getUser(refreshData.access_token)
          if (retryUser?.user) {
            // Success - continue with refreshed session
          }
        }
      } catch (err) {
        // Refresh failed - user will be treated as unauthenticated
      }
    }
  }

  // Route classification (same as before)
  const { pathname } = request.nextUrl
  const isProtected =
    pathname === '/app' ||
    pathname.startsWith('/app/') ||
    pathname === '/account' ||
    pathname.startsWith('/account/') ||
    pathname === '/welcome'
  const isOnboarding = pathname === '/onboarding'
  const isAuthPage =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password'

  if (!user) {
    if (isProtected || isOnboarding) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Skip protected route checks on public routes
  if (!isProtected && !isOnboarding && !isAuthPage) {
    return supabaseResponse
  }

  if (isOnboarding) {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    return NextResponse.redirect(url)
  }

  if (isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}