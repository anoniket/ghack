import { PostHog } from 'posthog-node';

const apiKey = process.env.POSTHOG_API_KEY;
const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

let posthog: PostHog | null = null;

if (apiKey) {
  posthog = new PostHog(apiKey, { host });
  console.log('[Analytics] PostHog initialized');
} else {
  console.log('[Analytics] POSTHOG_API_KEY not set — analytics disabled');
}

/**
 * Track an event for a specific user.
 * No-op if PostHog is not initialized.
 */
export function trackEvent(userId: string, event: string, properties?: Record<string, any>): void {
  if (!posthog) return;
  posthog.capture({
    distinctId: userId,
    event,
    properties,
  });
}

/**
 * Identify a user with traits/properties.
 * No-op if PostHog is not initialized.
 */
export function identifyUser(userId: string, properties: Record<string, any>): void {
  if (!posthog) return;
  posthog.identify({
    distinctId: userId,
    properties,
  });
}

/**
 * Flush pending events and shut down the PostHog client.
 * Should be called during graceful shutdown.
 */
export async function shutdownAnalytics(): Promise<void> {
  if (!posthog) return;
  try {
    await posthog.shutdown();
    console.log('[Analytics] PostHog shut down — events flushed');
  } catch (err: any) {
    console.error('[Analytics] PostHog shutdown error:', err.message);
  }
}
