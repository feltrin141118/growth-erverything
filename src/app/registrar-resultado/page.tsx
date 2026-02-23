'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClientComponentClient } from '@/lib/supabase-client'
import { RefreshCw, ArrowRight, CheckCircle, XCircle } from 'lucide-react'

interface Experiment {
  id: number | string
  hypothesis?: string
  variable?: string
  current_value?: string | number
  expected_result?: string | number
  min_to_validate?: string | number
  target_value?: string | number | null
  cutoff_line?: string | number | null
  [key: string]: any
}

export default function RegistrarResultado() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()
  const idFromUrl = searchParams.get('id')

  const [loading, setLoading] = useState(false)
  const [loadingNovoCiclo, setLoadingNovoCiclo] = useState(false)
  const [loadingExperiment, setLoadingExperiment] = useState(!!idFromUrl)
  const [loadingList, setLoadingList] = useState(!idFromUrl)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null)
  const [savedLearnings, setSavedLearnings] = useState('')
  const [formData, setFormData] = useState({
    final_value: '',
    learnings: '',
  })
  const [resultFinal, setResultFinal] = useState<'sucesso' | 'falha' | null>(null)

  useEffect(() => {
    if (!idFromUrl || idFromUrl.trim() === '') {
      fetchPendingExperiments()
      return
    }
    const idParam = idFromUrl.trim()
    const id = /^\d+$/.test(idParam) ? parseInt(idParam, 10) : idParam

    setLoadingExperiment(true)
    setError(null)
    supabase
      .from('experiments')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error: err }) => {
        setLoadingExperiment(false)
        if (err) {
          setError('Experimento não encontrado')
          return
        }
        setSelectedExperiment(data)
      })
  }, [idFromUrl])

  const fetchPendingExperiments = async () => {
    setLoadingList(true)
    try {
      await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setExperiments([])
        setLoadingList(false)
        return
      }

      const { data, error: supabaseError } = await supabase
        .from('experiments')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'em_execucao')
        .order('created_at', { ascending: false })

      if (supabaseError) throw supabaseError
      setExperiments(data || [])
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar experimentos')
    } finally {
      setLoadingList(false)
    }
  }

  const handleSelectExperiment = (experiment: Experiment) => {
    setSelectedExperiment(experiment)
    setFormData({ final_value: '', learnings: '' })
    setResultFinal(null)
    setSavedLearnings('')
    setError(null)
    setSuccess(false)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedExperiment) return

    const valorFinal = formData.final_value.trim()
    const resultadoNumerico = valorFinal === '' ? null : parseFloat(formData.final_value)
    if (valorFinal !== '' && Number.isNaN(resultadoNumerico!)) {
      setError('Informe um valor numérico para o Resultado Quantitativo.')
      return
    }

    if (!resultFinal) {
      setError('Selecione o Status Final: SUCESSO ou FALHA.')
      return
    }

    const aprendizado = formData.learnings.trim()
    if (!aprendizado) {
      setError('O que aprendemos com este teste? Preencha o campo de aprendizado.')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const { error: supabaseError } = await supabase
        .from('experiments')
        .update({
          status: 'concluido',
          final_value: resultadoNumerico,
          result: resultFinal,
          learnings: aprendizado,
        })
        .eq('id', selectedExperiment.id)

      if (supabaseError) throw supabaseError

      setSuccess(true)
      setSavedLearnings(aprendizado)
      setTimeout(() => {
        router.push('/')
      }, 1500)
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar resultado')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const goToNovoCiclo = async () => {
    if (!selectedExperiment) {
      setError('Selecione ou carregue um experimento antes de gerar novo ciclo.')
      return
    }
    const finalValue = formData.final_value || selectedExperiment.final_value
    const liçãoAprendida = savedLearnings || formData.learnings.trim()
    const hipóteseTestada = selectedExperiment.hypothesis ?? ''
    const goalId = selectedExperiment.goal_id
    const contextId = selectedExperiment.context_id

    setLoadingNovoCiclo(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Você precisa estar logado para gerar um novo ciclo.')
        setLoadingNovoCiclo(false)
        return
      }

      let contextoOriginal = ''
      if (contextId != null && contextId !== '') {
        const { data: context } = await supabase
          .from('contexts')
          .select('raw_input')
          .eq('id', contextId)
          .single()
        if (context?.raw_input && typeof context.raw_input === 'string') {
          contextoOriginal = context.raw_input.trim()
        }
      }

      const summary = [
        '[Contexto Original]',
        contextoOriginal || '—',
        '[Hipótese Testada]',
        hipóteseTestada || '—',
        '[Lições Aprendidas]',
        liçãoAprendida || '—',
      ].join('\n\n')

      if (contextId != null && contextId !== '') {
        await supabase
          .from('contexts')
          .update({ summary })
          .eq('id', contextId)
      } else if (goalId != null && goalId !== '') {
        await supabase
          .from('contexts')
          .insert([{ user_id: user.id, raw_input: contextoOriginal || null, summary, goal_id: goalId }])
      }

      let goalTitle = 'Meta'
      let currentCycle = 0
      if (goalId != null && goalId !== '') {
        const { data: goal, error: goalErr } = await supabase
          .from('goals')
          .select('title, current_cycle')
          .eq('id', goalId)
          .single()
        if (!goalErr && goal) {
          goalTitle = goal.title ?? 'Meta'
          currentCycle = goal.current_cycle != null ? Number(goal.current_cycle) : 0
        }
      }
      const newCycle = currentCycle + 1
      if (goalId != null && goalId !== '') {
        await supabase
          .from('goals')
          .update({ current_cycle: newCycle })
          .eq('id', goalId)
      }

      const prompt = `Este é o ciclo ${newCycle}. No ciclo anterior aprendemos que ${summary}. Com base nisso, como devemos ajustar a estratégia agora?`
      router.push('/diagnostico?prompt=' + encodeURIComponent(prompt))
    } catch (err: any) {
      setError(err?.message || 'Erro ao gerar novo ciclo.')
    } finally {
      setLoadingNovoCiclo(false)
    }
  }

  const showSingleExperiment = !!idFromUrl
  const experiment = selectedExperiment

  return (
    <main className="min-h-screen flex flex-col items-center px-4 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-12">
      <div className="w-full max-w-6xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl mb-4">
            Registrar Resultado
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300">
            {showSingleExperiment
              ? 'Registre o valor final e o aprendizado do experimento.'
              : 'Selecione um experimento e registre seus resultados.'}
          </p>
        </div>

        {success && (
          <div className="mb-6 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Resultado registrado com sucesso! Redirecionando para o Dashboard...
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              {error}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {!showSingleExperiment && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-200 dark:border-slate-700">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                Experimentos Pendentes
              </h2>
              {loadingList ? (
                <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                  Carregando...
                </div>
              ) : experiments.length === 0 ? (
                <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                  Nenhum experimento pendente encontrado
                </div>
              ) : (
                <div className="space-y-3">
                  {experiments.map((exp) => (
                    <button
                      key={exp.id}
                      onClick={() => handleSelectExperiment(exp)}
                      className={`w-full text-left p-4 rounded-lg border transition-colors ${
                        experiment?.id === exp.id
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-700'
                      }`}
                    >
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                        {exp.hypothesis || `Experimento #${exp.id}`}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Hipótese original: {exp.hypothesis || '—'}
                      </p>
                      {exp.expected_result != null && (
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                          Esperado: {String(exp.expected_result)}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div
            className={
              showSingleExperiment
                ? 'lg:col-span-2'
                : ''
            }
          >
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-200 dark:border-slate-700">
              {showSingleExperiment && loadingExperiment ? (
                <div className="text-center py-12 text-slate-600 dark:text-slate-400">
                  Carregando experimento...
                </div>
              ) : !experiment ? (
                <div className="text-center py-12 text-slate-600 dark:text-slate-400">
                  {showSingleExperiment
                    ? 'Experimento não encontrado.'
                    : 'Selecione um experimento para registrar o resultado.'}
                </div>
              ) : (
                <>
                  <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                      Título
                    </p>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                      {experiment.hypothesis || `Experimento #${experiment.id}`}
                    </h2>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                      Hipótese
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {experiment.hypothesis || '—'}
                    </p>
                    {(experiment.target_value != null && experiment.target_value !== '') ||
                    (experiment.expected_result != null && experiment.expected_result !== '') ? (
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                        <span className="font-medium">Target:</span>{' '}
                        {String(experiment.target_value ?? experiment.expected_result ?? '—')}
                      </p>
                    ) : null}
                    {(experiment.cutoff_line != null && experiment.cutoff_line !== '') ||
                    (experiment.min_to_validate != null && experiment.min_to_validate !== '') ? (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        <span className="font-medium">Linha de corte:</span>{' '}
                        {String(experiment.cutoff_line ?? experiment.min_to_validate ?? '—')}
                      </p>
                    ) : null}
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <label
                        htmlFor="final_value"
                        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                      >
                        Resultado Quantitativo
                      </label>
                      <input
                        type="number"
                        id="final_value"
                        name="final_value"
                        step="any"
                        value={formData.final_value}
                        onChange={handleChange}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0 dark:focus:ring-offset-slate-800"
                        placeholder="Valor final alcançado na métrica (ex: 15.5, 1000)"
                      />
                    </div>

                    <div>
                      <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                        Status Final *
                      </span>
                      <div className="flex gap-4">
                        <button
                          type="button"
                          onClick={() => setResultFinal('sucesso')}
                          className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-4 px-6 text-lg font-semibold transition-colors ${
                            resultFinal === 'sucesso'
                              ? 'bg-emerald-600 text-white ring-2 ring-emerald-500 ring-offset-2'
                              : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                          }`}
                        >
                          <CheckCircle className="h-6 w-6" aria-hidden />
                          SUCESSO
                        </button>
                        <button
                          type="button"
                          onClick={() => setResultFinal('falha')}
                          className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-4 px-6 text-lg font-semibold transition-colors ${
                            resultFinal === 'falha'
                              ? 'bg-red-600 text-white ring-2 ring-red-500 ring-offset-2'
                              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-2 border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/30'
                          }`}
                        >
                          <XCircle className="h-6 w-6" aria-hidden />
                          FALHA
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="learnings"
                        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                      >
                        O que aprendemos com este teste? *
                      </label>
                      <textarea
                        id="learnings"
                        name="learnings"
                        required
                        rows={6}
                        value={formData.learnings}
                        onChange={handleChange}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0 dark:focus:ring-offset-slate-800 resize-y"
                        placeholder="Descreva o aprendizado gerado com este experimento..."
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {loading ? 'Salvando...' : 'Salvar Resultado'}
                      </button>
                      <button
                        type="button"
                        onClick={goToNovoCiclo}
                        disabled={loadingNovoCiclo}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden />
                        {loadingNovoCiclo ? 'Gerando...' : 'Gerar Novo Ciclo'}
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
