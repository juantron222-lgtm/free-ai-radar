import type { APIRoute } from 'astro';
import { guard } from '@lib/api/respond';
import { getAuthProvider } from '@lib/auth/provider';
import { ROUTES } from '@lib/nav';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  // Sign-out is state-changing, so it is CSRF-protected like everything else.
  const check = await guard(context, { rateLimit: 'api' });
  if (!check.ok) return check.response!;

  const auth = getAuthProvider();
  await auth.signOut(context.request);

  for (const cookie of auth.drainCookies()) {
    context.cookies.set(cookie.name, cookie.value, cookie.options as never);
  }

  return context.redirect(ROUTES.home, 303);
};
