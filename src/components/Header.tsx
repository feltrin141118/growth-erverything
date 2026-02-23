'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClientComponentClient } from '@/lib/supabase-client'
import { Home, Target, FileSearch, FlaskConical, ClipboardCheck, LogOut } from 'lucide-react'

const navLinks = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/novo-objetivo', label: 'Metas', icon: Target },
  { href: '/diagnostico', label: 'Diagnóstico', icon: FileSearch },
  { href: '/gerar-experimentos', label: 'Esteira de Testes', icon: FlaskConical },
  { href: '/registrar-resultado', label: 'Resultados', icon: ClipboardCheck },
]

export default function Header() {
  const supabase = createClientComponentClient()
  const pathname = usePathname()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const syncEmail = (session: { user?: { email?: string | null } | null } | null) => {
      setEmail(session?.user?.email || null)
    }

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      syncEmail(session)
    }
    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      syncEmail(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setEmail(null)
    window.location.href = '/login'
  }

  return (
    <header className="w-full h-14 bg-slate-900/95 text-white flex items-center justify-between px-6 lg:px-8 sticky top-0 z-50 border-b border-slate-800 backdrop-blur supports-[backdrop-filter]:bg-slate-900/90">
      <div className="flex items-center gap-8">
        <Link
          href="/"
          className="font-bold text-lg text-slate-100 hover:text-white transition-colors shrink-0"
        >
          Growth Everything
        </Link>

        <nav className="hidden sm:flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-blue-400 bg-slate-800/80'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        {email && (
          <span
            className="max-w-[160px] lg:max-w-[220px] truncate text-xs text-slate-400"
            title={email}
          >
            {email}
          </span>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors border border-transparent hover:border-slate-700"
          aria-label="Sair"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  )
}
