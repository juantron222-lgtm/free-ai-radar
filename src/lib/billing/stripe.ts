import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { stripe as stripeConfig, supabase as supabaseConfig, isProduction } from '@lib/config';
import { logger } from '@lib/observability/logger';
import { planForPriceId } from './plans';

/**
 * Stripe integration, test mode.
 *
 * Safety rails that are deliberately not configurable:
 *   · A **live** secret key outside production throws at construction. The most
 *     expensive mistake in this whole codebase would be charging a real card
 *     from a preview deploy.
 *   · Webhooks verify the signature before parsing the body, and record the
 *     event id so a Stripe retry cannot double-apply.
 *   · Nothing about a subscription is ever trusted from the client. The only
 *     writer of billing state is the webhook handler.
 */

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!stripeConfig.isConfigured) return null;

  if (!stripeConfig.isTestMode && !isProduction) {
    throw new Error(
      'STRIPE_SECRET_KEY es una clave live y este entorno no es producción. Usa una clave sk_test_.'
    );
  }

  stripeClient ??= new Stripe(stripeConfig.secretKey, {
    apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion,
    typescript: true,
    appInfo: { name: 'Free AI Radar', version: '2.0.0' },
  });

  return stripeClient;
}

let db: SupabaseClient | null = null;

function getDb(): SupabaseClient | null {
  if (!supabaseConfig.canUseServiceRole) return null;
  db ??= createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return db;
}

export interface CheckoutInput {
  userId: string;
  userEmail: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  /** Prevents a double-click creating two sessions. */
  idempotencyKey: string;
}

export interface CheckoutResult {
  ok: boolean;
  url?: string;
  message: string;
  /** True when Stripe is not configured and we returned a simulated flow. */
  simulated: boolean;
}

export async function createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
  const stripe = getStripe();

  if (!stripe) {
    logger.info('billing.checkout_simulated', { userId: input.userId, priceId: input.priceId });
    return {
      ok: true,
      simulated: true,
      url: `/pro/simulacion?price=${encodeURIComponent(input.priceId)}`,
      message: 'Stripe no está configurado: se muestra el flujo simulado.',
    };
  }

  try {
    const customerId = await ensureCustomer(input.userId, input.userEmail);

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: `${input.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: input.cancelUrl,
        ...(customerId ? { customer: customerId } : { customer_email: input.userEmail }),
        // The webhook needs to know which account this belongs to without
        // trusting anything the browser sends back.
        client_reference_id: input.userId,
        subscription_data: { metadata: { user_id: input.userId } },
        metadata: { user_id: input.userId },
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        // Required for EU VAT on digital services.
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
        consent_collection: { terms_of_service: 'required' },
      },
      { idempotencyKey: input.idempotencyKey }
    );

    return {
      ok: true,
      simulated: false,
      url: session.url ?? undefined,
      message: 'Redirigiendo al pago.',
    };
  } catch (error) {
    logger.error('billing.checkout_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      simulated: false,
      message: 'No hemos podido iniciar el pago. Inténtalo de nuevo en un momento.',
    };
  }
}

export async function createPortalSession(
  userId: string,
  returnUrl: string
): Promise<{ ok: boolean; url?: string; message: string; simulated: boolean }> {
  const stripe = getStripe();

  if (!stripe) {
    return {
      ok: true,
      simulated: true,
      url: '/pro/simulacion?portal=1',
      message: 'Stripe no está configurado: se muestra el portal simulado.',
    };
  }

  const customerId = await lookupCustomerId(userId);
  if (!customerId) {
    return { ok: false, simulated: false, message: 'No encontramos una suscripción asociada.' };
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { ok: true, simulated: false, url: session.url, message: 'Abriendo el portal.' };
  } catch (error) {
    logger.error('billing.portal_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, simulated: false, message: 'No hemos podido abrir el portal de facturación.' };
  }
}

async function lookupCustomerId(userId: string): Promise<string | null> {
  const client = getDb();
  if (!client) return null;

  const { data } = await client
    .from('user_subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .not('stripe_customer_id', 'is', null)
    .limit(1)
    .maybeSingle();

  return (data?.['stripe_customer_id'] as string | null) ?? null;
}

async function ensureCustomer(userId: string, userEmail: string): Promise<string | null> {
  const existing = await lookupCustomerId(userId);
  if (existing) return existing;

  const stripe = getStripe();
  if (!stripe) return null;

  const customer = await stripe.customers.create({
    email: userEmail,
    metadata: { user_id: userId },
  });

  const client = getDb();
  if (client) {
    await client
      .from('user_subscriptions')
      .upsert({ user_id: userId, stripe_customer_id: customer.id, status: 'incomplete' });
  }

  return customer.id;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export const HANDLED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.paid',
] as const;

export type HandledEvent = (typeof HANDLED_EVENTS)[number];

/**
 * Verifies the signature and returns the event, or null.
 *
 * The raw body must be passed exactly as received — any JSON round-trip breaks
 * the signature, which is why the route reads `request.text()`.
 */
export function verifyWebhook(rawBody: string, signature: string | null): Stripe.Event | null {
  const stripe = getStripe();
  if (!stripe || !signature || !stripeConfig.webhookSecret) return null;

  try {
    return stripe.webhooks.constructEvent(rawBody, signature, stripeConfig.webhookSecret);
  } catch (error) {
    logger.warn('billing.webhook_signature_invalid', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Returns false when this event id has already been applied. */
export async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const client = getDb();
  if (!client) return true;

  const { error } = await client
    .from('processed_webhook_events')
    .insert({ id: event.id, provider: 'stripe', type: event.type });

  if (error) {
    // Unique-violation means a concurrent or retried delivery already has it.
    if (error.code === '23505') {
      logger.info('billing.webhook_duplicate', { id: event.id, type: event.type });
      return false;
    }
    logger.error('billing.webhook_claim_failed', { error: error.message });
  }

  return true;
}

export async function applyEvent(event: Stripe.Event): Promise<void> {
  const client = getDb();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id ?? session.metadata?.['user_id'];
      if (!userId || !client) break;

      await client.from('user_subscriptions').upsert(
        {
          user_id: userId,
          stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
          stripe_subscription_id:
            typeof session.subscription === 'string' ? session.subscription : null,
          status: 'active',
        },
        { onConflict: 'stripe_subscription_id' }
      );
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.['user_id'];
      if (!userId || !client) break;

      const priceId = subscription.items.data[0]?.price.id ?? '';
      const plan = planForPriceId(priceId);

      await client.from('user_subscriptions').upsert(
        {
          user_id: userId,
          plan_id: plan?.id ?? null,
          stripe_customer_id:
            typeof subscription.customer === 'string' ? subscription.customer : null,
          stripe_subscription_id: subscription.id,
          status: event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status,
          current_period_end: new Date(
            (subscription as unknown as { current_period_end: number }).current_period_end * 1000
          ).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
        },
        { onConflict: 'stripe_subscription_id' }
      );
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      logger.warn('billing.payment_failed', {
        customer: typeof invoice.customer === 'string' ? invoice.customer : undefined,
        attempt: invoice.attempt_count,
      });
      // Stripe's dunning handles the retries and the eventual cancellation; we
      // only record it. Access is revoked when the subscription status changes.
      break;
    }

    case 'invoice.paid':
      logger.info('billing.invoice_paid', {});
      break;

    default:
      logger.info('billing.webhook_ignored', { type: event.type });
  }
}

export async function getSubscription(userId: string) {
  const client = getDb();
  if (!client) return null;

  const { data } = await client
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}
