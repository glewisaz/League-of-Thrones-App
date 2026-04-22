import { createAdminClient } from '@/lib/supabase/admin';

const YAHOO_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';
const TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token';
const REFRESH_WINDOW_MS = 5 * 60 * 1000;

function basicAuthHeader(): string {
  const credentials = Buffer.from(
    `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`,
  ).toString('base64');
  return `Basic ${credentials}`;
}

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
