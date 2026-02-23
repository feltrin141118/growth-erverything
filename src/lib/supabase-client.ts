import { createBrowserClient } from '@supabase/auth-helpers-nextjs'

/**
 * Cliente Supabase para uso em componentes 'use client'.
 * Usa createBrowserClient por baixo (o pacote não exporta createClientComponentClient).
 * Garante que a sessão seja lida dos cookies do navegador.
 */
export function createClientComponentClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórios.'
    )
  }
  return createBrowserClient(url, key)
}
