import { NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/ssr-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugify } from '@/lib/yahoo/parse';

/**
 * Create a "ghost" team for a historical owner who no longer has a
 * current franchise. Ghosts are excluded from the home page league
 * overview / cap views / admin lists, but appear on franchise history
 * pages and in the historical-data team-mapping dropdowns.
 *
 * Body: { owner_name: string, name?: string }
 *
 * Slug collisions: if the slug derived from owner_name already exists,
 * we append a numeric suffix (`old-bob`, `old-bob-2`, ...).
 */
export async function POST(req: Request) {
  const supabase = await createSessionClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as { owner_name?: string; name?: string };
  const ownerName = body.owner_name?.trim();
  if (!ownerName) {
    return NextResponse.json({ error: 'owner_name required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const baseSlug = slugify(ownerName) || 'ghost';
  let slug = baseSlug;
  let suffix = 1;
  while (true) {
    const { data: existing } = await admin
      .from('teams')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!existing) break;
    suffix++;
    slug = `${baseSlug}-${suffix}`;
    if (suffix > 50) {
      return NextResponse.json({ error: 'Could not find a free slug after 50 tries' }, { status: 500 });
    }
  }

  const { data, error } = await admin
    .from('teams')
    .insert({
      owner_name: ownerName,
      name: body.name ?? null,
      slug,
      is_ghost: true,
      conference: null,
    })
    .select('id, owner_name, slug')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, team: data });
}
