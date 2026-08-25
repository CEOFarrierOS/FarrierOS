const clean = (value: string | undefined) => value?.trim() ?? "";

export const appConfig = {
  appUrl: clean(import.meta.env.VITE_APP_URL) || window.location.origin,
  supabaseUrl: clean(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: clean(import.meta.env.VITE_SUPABASE_ANON_KEY),
  stripePublishableKey: clean(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY),
  stripeProductId: clean(import.meta.env.VITE_STRIPE_PRODUCT_ID),
  stripePriceId: clean(import.meta.env.VITE_STRIPE_PRICE_ID),
};

export const integrationStatus = {
  supabase: Boolean(appConfig.supabaseUrl && appConfig.supabaseAnonKey),
  stripe: Boolean(appConfig.stripePublishableKey && appConfig.stripePriceId),
};
