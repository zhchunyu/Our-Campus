import { createAuvHandler } from '../_shared/auv.js'

Deno.serve(createAuvHandler({
  AUV_BASE_URL: Deno.env.get('AUV_BASE_URL'),
  AUV_API_KEY: Deno.env.get('AUV_API_KEY'),
  AUV_EXTRACT_MODEL: Deno.env.get('AUV_EXTRACT_MODEL'),
  AUV_PERSONA_MODEL: Deno.env.get('AUV_PERSONA_MODEL'),
  SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
  SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
}))
