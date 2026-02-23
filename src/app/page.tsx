'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@/lib/supabase-client'
import {
  Target,
  FileSearch,
  FlaskConical,
  ClipboardCheck,
  Inbox,
  Zap,
  ChevronRight,
  Gauge,
  Pencil,
} from 'lucide-react'

interface Experiment {
  id: number
  hypothesis?: string
  variable?: string
  status?: string
  result?: string
  created_at?: string
  current_value?: string | number
  expected_result?: string | number
  min_to_validate?: string | number
  target_value?: string | number | null
  cutoff_line?: string | number | null
  goal_id?: number | null
  [key: string]: any
}

interface Metrics {
  backlog: number
  active: number
}

interface Goal {
  id: number
  title?: string
  target_value?: number
  target_metric?: string
  current_cycle?: number
  [key: string]: any
}

export default function Home() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [metrics, setMetrics] = useState<Metrics>({ backlog: 0, active: 0 })
  const [loading, setLoading] = useState(true)
  const [goals, setGoals] = useState<Goal[]>([])
  const [latestGoal, setLatestGoal] = useState<Goal | null>(null)
  const [allExperimentsForGoal, setAllExperimentsForGoal] = useState<Experiment[]>([])
  const [editingParamsId, setEditingParamsId] = useState<number | null>(null)
  const [paramsDraft, setParamsDraft] = useState<{ expected_result: string; min_to_validate: string }>({ expected_result: '', min_to_validate: '' })
  const [savingParams, setSavingParams] = useState(false)
  const [editingCardId, setEditingCardId] = useState<number | null>(null)
  const [cardDraft, setCardDraft] = useState<{ hypothesis: string; variable: string; expected_result: string; cutoff_line: string }>({
    hypothesis: '',
    variable: '',
    expected_result: '',
    cutoff_line: '',
  })
  const [savingCard, setSavingCard] = useState(false)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const [activeRes, backlogRes, activeCountRes, goalsRes, experimentsRes] = await Promise.all([
        supabase
          .from('experiments')
          .select('*')
          .eq('status', 'em_execucao')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('experiments')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'backlog')
          .eq('user_id', user.id),
        supabase
          .from('experiments')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'em_execucao')
          .eq('user_id', user.id),
        supabase
          .from('goals')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('experiments')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['em_execucao', 'concluido']),
      ])

      const backlogCount = backlogRes.count ?? 0
      const activeCount = activeCountRes.count ?? 0
      const total = backlogCount + activeCount
      console.log('Experimentos encontrados no banco: ' + total)

      setExperiments(activeRes.data || [])
      setMetrics({
        backlog: backlogCount,
        active: activeCount,
      })
      setGoals(goalsRes.data || [])
      setLatestGoal(goalsRes.data?.[0] ?? null)
      setAllExperimentsForGoal(experimentsRes.data || [])
    } catch (err) {
      console.error('Erro ao buscar dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Progresso da Meta Global: experimentos vinculados ao goal_id desta meta.
   * Usa target_value salvo no card (Ajustar parâmetros) como base; fallback para expected_result.
   * Média dos target_value para referência; a barra avança conforme experimentos são validados (result === 'validado').
   */
  const getGlobalProgress = (goal: Goal | null) => {
    if (!goal) return { achieved: 0, total: 0, averageTarget: 0, pct: 0, hasGoal: false }
    const linked = allExperimentsForGoal.filter((exp) => exp.goal_id === goal.id)
    if (linked.length === 0) return { achieved: 0, total: 0, averageTarget: 0, pct: 0, hasGoal: true }

    const targetValues = linked
      .map((exp) => Number(exp.target_value ?? exp.expected_result ?? 0))
      .filter((n) => !Number.isNaN(n) && n > 0)
    const averageTarget =
      targetValues.length === 0 ? 0 : targetValues.reduce((a, b) => a + b, 0) / targetValues.length
    const validatedCount = linked.filter((exp) => exp.result === 'validado' || exp.result === 'sucesso').length
    const total = linked.length
    const pct = total === 0 ? 0 : Math.min(100, Math.max(0, (validatedCount / total) * 100))
    return {
      achieved: validatedCount,
      total,
      averageTarget: Math.round(averageTarget * 100) / 100,
      pct,
      hasGoal: true,
    }
  }

  const openAjustarParams = (exp: Experiment) => {
    setEditingParamsId(exp.id)
    const target = exp.target_value ?? exp.expected_result
    const cutoff = exp.cutoff_line ?? exp.min_to_validate
    setParamsDraft({
      expected_result: target != null && target !== '' ? String(target) : '',
      min_to_validate: cutoff != null && cutoff !== '' ? String(cutoff) : '',
    })
  }

  const cancelAjustarParams = () => {
    setEditingParamsId(null)
    setParamsDraft({ expected_result: '', min_to_validate: '' })
  }

  /** Sugestão de linha de corte: 50% do resultado esperado quando é aumento percentual (ex: +20% → +10%). */
  const getSuggestedCutoff = (expected: string | number | null | undefined): string => {
    if (expected == null || expected === '') return ''
    const s = String(expected).trim()
    const match = s.match(/([+-]?\d+(?:[.,]\d+)?)\s*%?/)
    if (!match) return ''
    const num = parseFloat(match[1].replace(',', '.'))
    if (Number.isNaN(num)) return ''
    const half = num * 0.5
    if (s.includes('%')) return `${half}%`
    return String(half)
  }

  const openEditCard = (exp: Experiment) => {
    setEditingCardId(exp.id)
    const expectedStr = exp.expected_result != null && exp.expected_result !== '' ? String(exp.expected_result) : ''
    const cutoff = exp.cutoff_line ?? exp.min_to_validate
    const cutoffStr = cutoff != null && cutoff !== '' ? String(cutoff) : getSuggestedCutoff(exp.expected_result)
    setCardDraft({
      hypothesis: exp.hypothesis ?? '',
      variable: exp.variable ?? '',
      expected_result: expectedStr,
      cutoff_line: cutoffStr,
    })
  }

  const cancelEditCard = () => {
    setEditingCardId(null)
    setCardDraft({ hypothesis: '', variable: '', expected_result: '', cutoff_line: '' })
  }

  /** Persiste Título, Hipótese, Métrica, Resultado Esperado e Linha de Corte no Supabase. */
  const handleSaveCardEdit = async (experimentId: number | string) => {
    if (experimentId == null || experimentId === undefined) {
      alert('Erro: ID do experimento não informado.')
      return
    }
    const id = typeof experimentId === 'string' && experimentId.trim() === '' ? null : experimentId
    if (id === null) {
      alert('Erro: ID do experimento inválido.')
      return
    }

    setSavingCard(true)
    try {
      const editedHypothesis = cardDraft.hypothesis.trim() || null
      const editedVariable = cardDraft.variable.trim() || null
      const editedTarget = cardDraft.expected_result.trim() || null
      const editedCutoff = cardDraft.cutoff_line.trim() || null

      const { error } = await supabase
        .from('experiments')
        .update({
          hypothesis: editedHypothesis,
          variable: editedVariable,
          expected_result: editedTarget,
          target_value: editedTarget,
          cutoff_line: editedCutoff,
        })
        .eq('id', id)

      if (error) throw error

      setExperiments((prev) =>
        prev.map((e) =>
          String(e.id) === String(id)
            ? { ...e, hypothesis: editedHypothesis ?? undefined, variable: editedVariable ?? undefined, expected_result: editedTarget ?? undefined, target_value: editedTarget ?? undefined, cutoff_line: editedCutoff ?? undefined }
            : e
        )
      )
      cancelEditCard()
      alert('Salvo com sucesso!')
      await fetchDashboardData()
      router.refresh()
    } catch (err: any) {
      console.error('Erro ao salvar edição do card:', err)
      const msg = err?.message || err?.error_description || String(err)
      alert(`Não foi possível salvar: ${msg}`)
    } finally {
      setSavingCard(false)
    }
  }

  /** Atualiza target_value e cutoff_line na tabela experiments. O gráfico da Meta Global usa target_value como base. */
  const handleSaveParameters = async (expId: number) => {
    setSavingParams(true)
    try {
      const targetValue = paramsDraft.expected_result.trim() || null
      const cutoffLine = paramsDraft.min_to_validate.trim() || null

      const { error } = await supabase
        .from('experiments')
        .update({
          target_value: targetValue,
          cutoff_line: cutoffLine,
        })
        .eq('id', expId)

      if (error) throw error

      setExperiments((prev) =>
        prev.map((e) =>
          e.id === expId
            ? { ...e, target_value: targetValue, cutoff_line: cutoffLine }
            : e
        )
      )
      cancelAjustarParams()
      await fetchDashboardData()
      router.refresh()
    } catch (err) {
      console.error('Erro ao salvar parâmetros:', err)
    } finally {
      setSavingParams(false)
    }
  }

  const getResultBadge = (result: string) => {
    if (result === 'success') {
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          Sucesso
        </span>
      )
    }
    if (result === 'failure') {
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-200">
          Falha
        </span>
      )
    }
    return null
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

  /** Calcula progresso (0–100) e se atingiu o target. Usa target_value ou expected_result. */
  const getProgress = (exp: Experiment) => {
    const current = Number(exp.current_value)
    const targetNum = exp.target_value ?? exp.expected_result
    const target = Number(targetNum)
    if (target === 0 || Number.isNaN(target)) return { pct: 0, reached: false }
    if (Number.isNaN(current)) return { pct: 0, reached: false }
    const pct = Math.min(100, Math.max(0, (current / target) * 100))
    return { pct, reached: pct >= 100 }
  }

  const globalProgress = getGlobalProgress(latestGoal)

  const renderExperimentCard = (exp: Experiment) => {
    const { pct, reached } = getProgress(exp)
    const targetVal = exp.target_value ?? exp.expected_result
    const cutoffVal = exp.cutoff_line ?? exp.min_to_validate
    const suggestedCutoff = getSuggestedCutoff(exp.expected_result)
    const cutoffDisplay = cutoffVal != null && cutoffVal !== '' ? String(cutoffVal) : (suggestedCutoff ? `${suggestedCutoff} (sugerido)` : '—')
    const hasTarget =
      targetVal != null &&
      targetVal !== '' &&
      !Number.isNaN(Number(targetVal)) &&
      Number(targetVal) !== 0
    const targetLabel = String(targetVal ?? '—')
    const minToValidate = cutoffVal != null && cutoffVal !== '' ? String(cutoffVal) : targetLabel
    const isEditingCard = editingCardId === exp.id

    return (
      <div
        key={exp.id}
        className="flex min-h-[200px] flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="flex items-start justify-between gap-2">
          {isEditingCard ? (
            <div className="flex-1 space-y-2">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Título</label>
              <input
                type="text"
                value={cardDraft.hypothesis}
                onChange={(e) => setCardDraft((c) => ({ ...c, hypothesis: e.target.value }))}
                placeholder="Título do experimento"
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Hipótese</label>
              <input
                type="text"
                value={cardDraft.hypothesis}
                onChange={(e) => setCardDraft((c) => ({ ...c, hypothesis: e.target.value }))}
                placeholder="Hipótese a testar"
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Métrica</label>
              <input
                type="text"
                value={cardDraft.variable}
                onChange={(e) => setCardDraft((c) => ({ ...c, variable: e.target.value }))}
                placeholder="Ex: Conversão, ROI"
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Resultado Esperado</label>
              <input
                type="text"
                value={cardDraft.expected_result}
                onChange={(e) => setCardDraft((c) => ({ ...c, expected_result: e.target.value }))}
                placeholder="Ex: +20%, 89kg"
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Linha de Corte Sugerida</label>
              <input
                type="text"
                value={cardDraft.cutoff_line}
                onChange={(e) => setCardDraft((c) => ({ ...c, cutoff_line: e.target.value }))}
                placeholder="Mínimo para não ser fracasso (ex: +10%)"
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleSaveCardEdit(exp.id)}
                  disabled={savingCard}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {savingCard ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={cancelEditCard}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <h3 className="text-lg font-semibold leading-snug text-slate-900 dark:text-white">
                {exp.hypothesis || `Experimento #${exp.id}`}
              </h3>
              <button
                type="button"
                onClick={() => openEditCard(exp)}
                className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-600 dark:hover:text-slate-200"
                aria-label="Editar"
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
            </>
          )}
        </div>
        {!isEditingCard && (
          <>
            <div className="mt-2 flex flex-wrap gap-2">
              {exp.variable && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-600 dark:text-slate-200">
                  {exp.variable}
                </span>
              )}
              {exp.created_at && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-600 dark:text-slate-300">
                  {formatDate(exp.created_at)}
                </span>
              )}
            </div>
            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">Linha de Corte Sugerida:</span> {cutoffDisplay}
            </div>
          </>
        )}
        {!isEditingCard && (
        <div className="mt-4 space-y-3">
          {editingParamsId === exp.id ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Target — Onde queremos chegar
                  </label>
                  <input
                    type="text"
                    value={paramsDraft.expected_result}
                    onChange={(e) => setParamsDraft((p) => ({ ...p, expected_result: e.target.value }))}
                    placeholder="Ex: 89kg"
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Linha de Corte — Mínimo para não ser fracasso
                  </label>
                  <input
                    type="text"
                    value={paramsDraft.min_to_validate}
                    onChange={(e) => setParamsDraft((p) => ({ ...p, min_to_validate: e.target.value }))}
                    placeholder="Ex: 95kg"
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveParameters(exp.id)}
                  disabled={savingParams}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-600"
                >
                  {savingParams ? 'Salvando...' : 'Salvar parâmetros'}
                </button>
                <button
                  type="button"
                  onClick={cancelAjustarParams}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                >
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500 dark:text-slate-400">Target (onde queremos chegar)</span>
                <span className="font-medium text-slate-900 dark:text-white">{targetLabel}</span>
                <span className="text-slate-500 dark:text-slate-400">Linha de Corte (mín. para não ser fracasso)</span>
                <span className="font-medium text-slate-900 dark:text-white">{minToValidate}</span>
              </div>
              <button
                type="button"
                onClick={() => openAjustarParams(exp)}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                Ajustar parâmetros
              </button>
            </>
          )}
        </div>
        )}
        {!isEditingCard && hasTarget && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span>Valor atual: {exp.current_value != null && exp.current_value !== '' ? String(exp.current_value) : '—'}</span>
              <span>{pct.toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
              <div
                className={`h-full rounded-full transition-all ${
                  reached ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-brand-500 dark:bg-brand-400'
                }`}
                style={{ width: `${pct}%` }}
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        )}
        {!isEditingCard && (
        <div className="mt-auto flex items-center justify-end gap-2 pt-4">
          {exp.result && getResultBadge(exp.result)}
          <Link
            href={`/registrar-resultado?id=${exp.id}`}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
          >
            Registrar
          </Link>
        </div>
        )}
      </div>
    )
  }

  const goalIds = new Set(goals.map((g) => g.id))
  /** Agrupa experimentos ativos por goal_id para exibir sob cada Meta Global */
  const activeByGoal = (() => {
    const byGoal = new Map<number | 'none', Experiment[]>()
    byGoal.set('none', [])
    experiments.forEach((exp) => {
      const key =
        exp.goal_id != null && goalIds.has(exp.goal_id) ? exp.goal_id : 'none'
      if (!byGoal.has(key)) byGoal.set(key, [])
      byGoal.get(key)!.push(exp)
    })
    return byGoal
  })()

  const actions = [
    { href: '/novo-objetivo', label: 'Metas', icon: Target },
    { href: '/diagnostico', label: 'Diagnóstico', icon: FileSearch },
    { href: '/gerar-experimentos', label: 'Gerar', icon: FlaskConical },
    { href: '/registrar-resultado', label: 'Resultados', icon: ClipboardCheck },
  ]

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Dashboard
          </h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Growth Everything — visão geral e ações rápidas
          </p>
        </div>

        {/* Grid de 4 cards de ação */}
        <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {actions.map(({ href, label, icon: Icon }) => (
            label === 'Metas' ? (
              <Link
                key={href}
                href={href}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm transition-all hover:border-brand-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-brand-600"
              >
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400 group-hover:bg-brand-100 dark:group-hover:bg-brand-900/50 mx-auto">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <span className="font-semibold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400">
                  {label}
                </span>
                {globalProgress.hasGoal && (
                  <div className="mt-3 w-full text-left">
                    <div className="mb-2 flex items-center gap-1.5">
                      <Gauge className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden />
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-600 dark:text-slate-300">
                        Velocidade — Ciclo: {latestGoal?.current_cycle ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                      <span>{globalProgress.achieved} / {globalProgress.total} validados</span>
                      <span>{globalProgress.pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
                      <div
                        className={`h-full rounded-full transition-all ${
                          globalProgress.pct >= 100 ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-brand-500 dark:bg-brand-400'
                        }`}
                        style={{ width: `${globalProgress.pct}%` }}
                        role="progressbar"
                        aria-valuenow={globalProgress.pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                  </div>
                )}
                <ChevronRight className="mt-1 h-4 w-4 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 mx-auto" aria-hidden />
              </Link>
            ) : (
              <Link
                key={href}
                href={href}
                className="group flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm transition-all hover:border-brand-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-brand-600"
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400 group-hover:bg-brand-100 dark:group-hover:bg-brand-900/50">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <span className="font-semibold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400">
                  {label}
                </span>
                <ChevronRight className="mt-1 h-4 w-4 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </Link>
            )
          ))}
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Coluna principal: experimentos ativos agrupados por Meta Global */}
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
              Experimentos ativos
            </h2>
            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
                <p className="text-slate-600 dark:text-slate-400">Carregando...</p>
              </div>
            ) : experiments.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
                <p className="text-slate-600 dark:text-slate-400">
                  Nenhum experimento ativo
                </p>
                <Link
                  href="/gerar-experimentos"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  Gerar experimentos
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Grupos por Meta Global (ordem das metas) */}
                {goals.map((goal) => {
                  const groupExps = activeByGoal.get(goal.id) || []
                  if (groupExps.length === 0) return null
                  return (
                    <section key={goal.id}>
                      <h3 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-200">
                        Meta Global: {goal.title || `Meta #${goal.id}`}
                      </h3>
                      <div className="space-y-4">
                        {groupExps.map((exp) => renderExperimentCard(exp))}
                      </div>
                    </section>
                  )
                })}
                {/* Experimentos sem meta */}
                {(activeByGoal.get('none') || []).length > 0 && (
                  <section>
                    <h3 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-200">
                      Sem meta
                    </h3>
                    <div className="space-y-4">
                      {(activeByGoal.get('none') || []).map((exp) => renderExperimentCard(exp))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>

          {/* Seção lateral: Métricas Rápidas */}
          <div className="lg:col-span-1">
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
              Métricas Rápidas
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Inbox className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
                  </div>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    Testes no Backlog
                  </span>
                </div>
                <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {loading ? '—' : metrics.backlog}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 dark:bg-brand-900/30">
                    <Zap className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden />
                  </div>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    Testes Ativos
                  </span>
                </div>
                <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {loading ? '—' : metrics.active}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
