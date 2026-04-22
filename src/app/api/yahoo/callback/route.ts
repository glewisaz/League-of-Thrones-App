import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/admin/yahoo?error=missing_code', req.url));
  }

  try {
    const credentials = Buffer.from(
      `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`,
    ).toString('base64');

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.YAHOO_REDIRECT_URI!,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Token exchange failed (${res.status}): ${text}`);
    }

    const tokens = await res.json();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const supabase = createAdminClient();
    const { error } = await supabase.from('yahoo_auth').upsert({
      id: 1,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
    });
    if (error) throw error;

    return NextResponse.redirect(new URL('/admin/yahoo', req.url));
  } catch (err) {
    console.error('[yahoo/callback]', err);
    return NextResponse.redirect(new URL('/admin/yahoo?error=true', req.url));
  }
}
