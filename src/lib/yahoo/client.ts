import { createAdminClient } from '@/lib/supabase/admin';

const YAHOO_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';
const TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token';

// Refresh 5 minutes before expiry so in-flight Vercel cron jobs don't hit a stale token
// mid-execution. Yahoo access tokens last 1 hour.
const REFRESH_WINDOW_MS = 5 * 60 * 1000;

// Yahoo's token endpoint requires HTTP Basic auth with client_id:client_secret,
// not a Bearer token. This is different from the API calls themselves.
function basicAuthHeader(): string {
  const credentials = Buffer.from(
    `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`,
  ).toString('base64');
  return `Basic ${credentials}`;
}

/**
 * Exchange the stored refresh token for a new access token and persist both
 * back to the single-row yahoo_auth table (id=1).
 *
 * Yahoo doesn't always issue a new refresh token on every refresh — when it
 * omits one, we keep the existing refresh token rather than clearing it.
 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Yahoo token refresh failed (${res.status}): ${text}`);
  }

  const tokens = await res.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const supabase = createAdminClient();
  const { error } = await supabase.from('yahoo_auth').upsert({
    id: 1,
    access_token: tokens.access_token,
    // Yahoo doesn't always return a new refresh token — fall back to the existing one
    refresh_token: tokens.refresh_token ?? refreshToken,
    expires_at: expiresAt,
  });
  if (error) throw error;

  return tokens.access_token as string;
}

/**
 * Return a guaranteed-valid access token, refreshing proactively if the
 * token is within REFRESH_WINDOW_MS of expiry.
 *
 * The yahoo_auth table is a singleton (id=1). If no row exists, the OAuth
 * connect flow hasn't been completed yet.
 */
export async function getValidToken(): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('yahoo_auth')
    .select('access_token, refresh_token, expires_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.access_token || !data?.refresh_token) {
    throw new Error('Yahoo not connected. Visit /api/yahoo/connect to authenticate.');
  }

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (Date.now() >= expiresAt - REFRESH_WINDOW_MS) {
    return refreshAccessToken(data.refresh_token);
  }

  return data.access_token;
}

/**
 * Authenticated GET against the Yahoo Fantasy v2 API.
 *
 * Yahoo defaults to XML — `?format=json` must be appended to every request
 * or the response is unparseable. We add it here so callers never forget.
 */
export async function yahooFetch(endpoint: string): Promise<unknown> {
  const token = await getValidToken();

  const url = new URL(`${YAHOO_BASE}${endpoint}`);
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Yahoo API error (${res.status}) ${endpoint}: ${text}`);
  }

  return res.json();
}
