import { z } from 'zod'

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1)
    .refine((v) => !v.startsWith('sb_secret_'), {
      message: 'The Supabase secret key must never be used in the browser.',
    }),
})

const parsed = EnvSchema.safeParse(import.meta.env)

export const isSupabaseConfigured = parsed.success

if (!parsed.success) {
  console.warn(
    '[AI Studio] Supabase env vars not configured — running with local browser storage.',
  )
}

export const env = {
  supabaseUrl: parsed.success ? parsed.data.VITE_SUPABASE_URL : 'http://localhost:54321',
  supabasePublishableKey: parsed.success
    ? parsed.data.VITE_SUPABASE_PUBLISHABLE_KEY
    : 'local-demo-key',
}

