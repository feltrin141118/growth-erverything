'use client'

import { createClientComponentClient } from '@/lib/supabase-client'
import { useState, useEffect } from 'react'

const ROTATING_WORDS = ['hacking', 'finance', 'business', 'class', 'plan', 'human', 'Everything'] as const
const NORMAL_DELAY_MS = 1800
const EVERYTHING_PAUSE_MS = 3500

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [wordIndex, setWordIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(true)
  const supabase = createClientComponentClient()

  const currentWord = ROTATING_WORDS[wordIndex]
  const isEverything = currentWord === 'Everything'

  useEffect(() => {
    const delay = isEverything ? EVERYTHING_PAUSE_MS : NORMAL_DELAY_MS

    const tick = () => {
      setIsVisible(false)
      setTimeout(() => {
        setWordIndex((i) => (i + 1) % ROTATING_WORDS.length)
        requestAnimationFrame(() => {
          setTimeout(() => setIsVisible(true), 50)
        })
      }, 220)
    }

    const id = setTimeout(tick, delay)
    return () => clearTimeout(id)
  }, [wordIndex, isEverything])

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert('Erro ao logar: ' + error.message)
    } else {
      window.location.href = '/'
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="mb-6 flex items-baseline justify-center gap-1">
        <span className="text-2xl font-bold text-slate-900 dark:text-white">Growth</span>
        <span
          key={currentWord}
          className={`inline-block min-w-[140px] text-left text-2xl font-bold transition-all duration-300 ease-out ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
          } ${isEverything ? 'bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 bg-clip-text text-transparent' : 'text-slate-700 dark:text-slate-300'}`}
        >
          {currentWord}
        </span>
      </div>
      <form onSubmit={handleSignIn} className="p-8 bg-white dark:bg-slate-800 shadow-md rounded-lg flex flex-col gap-4 w-full max-w-sm">
        <h2 className="sr-only">Entrar no Growth Everything</h2>
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border p-2 rounded"
          required
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border p-2 rounded"
          required
        />
        <button type="submit" className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700">
          Entrar
        </button>
      </form>
    </div>
  )
}
