'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClientComponentClient } from '@/lib/supabase-client'
import { Target, FileText, Sparkles, Flag } from 'lucide-react'

interface Goal {
  id: number
  title?: string
  target_metric?: string
  target_value?: number
  [key: string]: any
}

export default function Diagnostico() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [selectedGoalId, setSelectedGoalId] = useState<string>('')
  const [objetivoPrincipal, setObjetivoPrincipal] = useState('')
  const [contextoLivre, setContextoLivre] = useState('')
  const [diagnostico, setDiagnostico] = useState<string | null>(null)

  // Pré-preenche o contexto: prompt do Gerar Novo Ciclo (ciclo N + sumário) ou learnings
  useEffect(() => {
    const prompt = searchParams.get('prompt')
    const learnings = searchParams.get('learnings')
    if (prompt) {
      try {
        setContextoLivre(decodeURIComponent(prompt))
      } catch {
        setContextoLivre(prompt)
      }
    } else if (learnings) {
      try {
        setContextoLivre(decodeURIComponent(learnings))
      } catch {
        setContextoLivre(learnings)
      }
    }
  }, [searchParams])

  // Carrega as metas do usuário logado ao montar a página
  useEffect(() => {
    const fetchGoals = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })

      console.log('goals (diagnóstico):', data)

      const list = data || []
      setGoals(list)
      if (!selectedGoalId && list.length > 0) {
        setSelectedGoalId(String(list[0].id))
      }
    }
    fetchGoals()
  }, [])

  // Se existe summary no último contexto desta meta, preenche Contexto Livre (a não ser que a URL já tenha prompt/learnings)
  useEffect(() => {
    const hasUrlContext = searchParams.get('prompt') || searchParams.get('learnings')
    if (hasUrlContext || !selectedGoalId) return

    const fetchLastContextSummary = async () => {
      const { data } = await supabase
        .from('contexts')
        .select('summary')
        .eq('goal_id', selectedGoalId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data?.summary && typeof data.summary === 'string' && data.summary.trim()) {
        setContextoLivre((prev) => (prev.trim() ? prev : data.summary.trim()))
      }
    }
    fetchLastContextSummary()
  }, [selectedGoalId, searchParams])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setDiagnostico(null)

    await supabase.auth.getSession()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      window.location.href = '/login'
      return
    }

    if (!selectedGoalId || selectedGoalId.trim() === '') {
      setError('Selecione uma Meta Global primeiro.')
      return
    }
    if (!contextoLivre.trim()) {
      setError('Insira o contexto livre para análise.')
      return
    }

    setLoading(true)
    try {
      // goal_id é o ID da meta (UUID ou número) vindo do dropdown, não o título
      const response = await fetch('/api/diagnose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: contextoLivre.trim(),
          current_goal: objetivoPrincipal.trim(),
          goal_id: selectedGoalId.trim(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao analisar contexto')
      }

      setDiagnostico(data.structuredAnalysis)
      // Após analisar, direciona para a página de geração de experimentos
      router.push('/gerar-experimentos')
    } catch (err: any) {
      setError(err.message || 'Erro ao analisar contexto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900 py-10 px-4">
      <div className="mx-auto w-full max-w-4xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Cockpit de Entrada
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Defina seu objetivo, cole o contexto e analise para obter um diagnóstico estruturado.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Card: Metas Globais */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <label
              htmlFor="meta-global"
              className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              <Flag className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden />
              Metas Globais
            </label>
            <select
              id="meta-global"
              value={selectedGoalId}
              onChange={(e) => setSelectedGoalId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-shadow focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-100 dark:placeholder-slate-500"
            >
              <option value="">Nenhuma meta selecionada</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title || `Meta #${g.id}`}
                  {g.target_metric ? ` — ${g.target_metric}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Card: Objetivo principal (texto livre) */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <label
              htmlFor="objetivo"
              className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              <Target className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden />
              Qual seu objetivo principal agora?
            </label>
            <input
              type="text"
              id="objetivo"
              name="objetivo"
              value={objetivoPrincipal}
              onChange={(e) => setObjetivoPrincipal(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-shadow focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-100 dark:placeholder-slate-500"
              placeholder="Ex: Aumentar ROI, Melhorar conversão..."
            />
          </div>

          {/* Card: Contexto livre */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <label
              htmlFor="contexto"
              className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              <FileText className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden />
              Contexto Livre
            </label>
            <textarea
              id="contexto"
              name="contexto"
              required
              rows={18}
              value={contextoLivre}
              onChange={(e) => setContextoLivre(e.target.value)}
              className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-shadow focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-100 dark:placeholder-slate-500"
              placeholder="Cole ou digite o contexto que deseja analisar..."
            />
          </div>

          {/* Card: Ações e mensagens */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            {loading && (
              <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-800/50 dark:bg-blue-900/20">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  Analisando...
                </p>
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-lg border border-red-100 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-900/20">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  {error}
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                {loading ? 'Analisando...' : 'Analisar'}
              </button>
            </div>
          </div>
        </form>

        {/* Resultado do diagnóstico */}
        {diagnostico && (
          <div className="mt-8 rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-8">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
              <Sparkles className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden />
              Diagnóstico
            </h2>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/80">
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-sm text-slate-700 dark:text-slate-300">
                {JSON.stringify(JSON.parse(diagnostico), null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
