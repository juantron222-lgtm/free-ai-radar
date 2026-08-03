/// <reference types="astro/client" />

import type { SessionUser } from '@lib/auth/types';
import type { ConsentState } from '@lib/consent';

declare global {
  namespace App {
    interface Locals {
      /** Populated by `src/middleware.ts`. Null when signed out. */
      user: SessionUser | null;
      authMode: 'supabase' | 'local' | 'disabled';
      csrfToken: string;
      consent: ConsentState;
    }
  }
}

export {};
