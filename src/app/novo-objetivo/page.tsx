'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'

export default function NovoObjetivo() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    target_metric: '',
    target_value: '',
    platform: '',
    current_cpa: '',
    desired_cpa: '',
    current_ctr: '',
    daily_test_budget: '',
  })

  useEffect(() => {
    const loadUser = async () => {
      await supabase.auth.getSession()
      const { data: { user: u } } = await supabase.auth.getUser()
      setUser(u ?? null)
    }
    loadUser()
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      await supabase.auth.getSession()
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) {
        setError('Você precisa estar logado para cadastrar um objetivo.')
        setLoading(false)
        return
      }

      const { data, error: supabaseError } = await supabase
        .from('goals')
        .insert([
          {
            user_id: currentUser.id,
            title: formData.title,
            description: formData.description,
            target_metric: formData.target_metric,
            target_value: parseFloat(formData.target_value),
            ad_platform: formData.platform || null,
          },
        ])
        .select()

      if (supabaseError) {
        throw supabaseError
      }

      setSuccess(true)
      setFormData({
        title: '',
        description: '',
        target_metric: '',
        target_value: '',
        platform: '',
        current_cpa: '',
        desired_cpa: '',
        current_ctr: '',
        daily_test_budget: '',
      })

      // Redireciona após 2 segundos
      setTimeout(() => {
        router.push('/')
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar objetivo')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
            Novo Objetivo
          </h1>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
            Cadastre um novo objetivo para acompanhar seus experimentos
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 sm:p-8 space-y-6"
        >
          {/* Mensagem de sucesso */}
          {success && (
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Objetivo cadastrado com sucesso! Redirecionando...
              </p>
            </div>
          )}

          {/* Mensagem de erro (não exibe "precisa estar logado" quando a sessão está ativa) */}
          {error && !(user && error.includes('logado')) && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {error}
              </p>
            </div>
          )}

          {/* Campo Título */}
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              Título *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              required
              value={formData.title}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0 dark:focus:ring-offset-slate-800"
              placeholder="Ex: Aumentar conversão"
            />
          </div>

          {/* Campo Descrição */}
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              Descrição *
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={4}
              value={formData.description}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0 dark:focus:ring-offset-slate-800 resize-none"
              placeholder="Descreva o objetivo em detalhes..."
            />
          </div>

          {/* Campo Plataforma de Tráfego Pago */}
          <div>
            <label
              htmlFor="platform"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              Plataforma de Tráfego Pago *
            </label>
            <select
              id="platform"
              name="platform"
              required
              value={formData.platform}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0 dark:focus:ring-offset-slate-800"
            >
              <option value="">Selecione a plataforma</option>
              <option value="Facebook Ads">Facebook Ads</option>
              <option value="Google Ads">Google Ads</option>
              <option value="TikTok Ads">TikTok Ads</option>
              <option value="YouTube Ads">YouTube Ads</option>
            </select>
          </div>

          {/* Campos sugeridos para gestores de tráfego */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="current_cpa"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                CPA atual (R$) — opcional
              </label>
              <input
                type="number"
                id="current_cpa"
                name="current_cpa"
                step="any"
                value={formData.current_cpa}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0 dark:focus:ring-offset-slate-800"
                placeholder="Ex: 35"
              />
            </div>
            <div>
              <label
                htmlFor="desired_cpa"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                CPA desejado (R$) — opcional
              </label>
              <input
                type="number"
                id="desired_cpa"
                name="desired_cpa"
                step="any"
                value={formData.desired_cpa}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0 dark:focus:ring-offset-slate-800"
                placeholder="Ex: 25"
              />
            </div>
            <div>
              <label
                htmlFor="current_ctr"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                CTR atual (%) — opcional
              </label>
              <input
                type="number"
                id="current_ctr"
                name="current_ctr"
                step="any"
                value={formData.current_ctr}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0 dark:focus:ring-offset-slate-800"
                placeholder="Ex: 1.2"
              />
            </div>
            <div>
              <label
                htmlFor="daily_test_budget"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                Orçamento diário de teste (R$) — opcional
              </label>
              <input
                type="number"
                id="daily_test_budget"
                name="daily_test_budget"
                step="any"
                value={formData.daily_test_budget}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0 dark:focus:ring-offset-slate-800"
                placeholder="Ex: 300"
              />
            </div>
          </div>

          {/* Campo Métrica Alvo */}
          <div>
            <label
              htmlFor="target_metric"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              Métrica Alvo *
            </label>
            <input
              type="text"
              id="target_metric"
              name="target_metric"
              required
              value={formData.target_metric}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0 dark:focus:ring-offset-slate-800"
              placeholder="Ex: ROI, Conversão, Receita"
            />
          </div>

          {/* Campo Valor Alvo */}
          <div>
            <label
              htmlFor="target_value"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              Valor Alvo *
            </label>
            <input
              type="number"
              id="target_value"
              name="target_value"
              required
              step="any"
              value={formData.target_value}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0 dark:focus:ring-offset-slate-800"
              placeholder="Ex: 15.5, 1000, 25"
            />
          </div>

          {/* Botões */}
          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Cadastrando...' : 'Cadastrar Objetivo'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
