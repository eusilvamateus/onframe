import { createClient } from '@supabase/supabase-js';

export function providerClient(config) {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, experimental: { passkey: true } }
  });
}

export async function restoreProviderSession(config, session) {
  const client = providerClient(config);
  const { error } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (error) throw error;
  return client;
}

export async function verifySecondFactor(client, factorId, code) {
  if (!/^\d{6}$/u.test(code)) throw new Error('Informe os seis dígitos do aplicativo autenticador.');
  const { data, error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw error;
  return data;
}
