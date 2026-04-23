'use server';

import { redirect } from 'next/navigation';
import { createSessionClient } from '@/lib/supabase/ssr-server';

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect('/admin/login?error=Invalid+credentials');
  }

  redirect('/admin/teams');
}
