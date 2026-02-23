import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import OpenAI from 'openai'
import { createServerClient } from '@supabase/auth-helpers-nextjs'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Configuração Supabase ausente.' },
        { status: 500 }
      )
    }
    const cookieStore = cookies()
    const supabaseAuth = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options ?? {})
          )
        },
      },
    })
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Não autorizado. Faça login para continuar.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { structuredAnalysis, targetMetric, contextId, goal_id: goalIdFromBody } = body

    if (!structuredAnalysis) {
      return NextResponse.json(
        { error: 'Análise estruturada é obrigatória' },
        { status: 400 }
      )
    }

    // goal_id obrigatório: body ou contexto (diagnóstico); aceita UUID (string) ou número; será salvo em experiments.goal_id
    let goal_id: number | string | null =
      goalIdFromBody != null && goalIdFromBody !== ''
        ? typeof goalIdFromBody === 'string' && (goalIdFromBody as string).length > 10 && (goalIdFromBody as string).includes('-')
          ? goalIdFromBody
          : Number(goalIdFromBody)
        : null
    if ((goal_id == null || (typeof goal_id === 'number' && Number.isNaN(goal_id))) && contextId != null) {
      const { data: context } = await supabaseAuth
        .from('contexts')
        .select('goal_id')
        .eq('id', contextId)
        .single()
      if (context?.goal_id != null && context.goal_id !== '') {
        goal_id =
          typeof context.goal_id === 'string' && context.goal_id.length > 10 && context.goal_id.includes('-')
            ? context.goal_id
            : Number(context.goal_id)
      }
    }
    if (goal_id == null || (typeof goal_id === 'number' && Number.isNaN(goal_id))) {
      return NextResponse.json(
        { error: 'É obrigatório informar uma meta (goal_id). Selecione uma Meta Global no Diagnóstico antes de gerar experimentos.' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY não configurada' },
        { status: 500 }
      )
    }

    // Se goal_id foi enviado, busca título e métrica da meta para a IA
    let goalTitle = ''
    let goalMetric = targetMetric
    if (goal_id) {
      const { data: goal } = await supabaseAuth
        .from('goals')
        .select('title, target_metric')
        .eq('id', goal_id)
        .single()
      if (goal) {
        goalTitle = goal.title ?? ''
        if (goal.target_metric) goalMetric = goal.target_metric
      }
    }

    // Instrução de persona e idioma
    const systemInstruction =
      'Você é um estrategista de Growth brasileiro. Responda obrigatoriamente em português do Brasil. Todos os campos de título, hipótese e resultado esperado devem ser traduzidos e adaptados culturalmente.'

    // Monta o prompt da tarefa usando a meta específica (título e métrica)
    let taskPrompt =
      'Com base no contexto estruturado e na métrica selecionada, gere 3 experimentos estruturados com hipótese, variável, valor atual e resultado esperado. Responda obrigatoriamente em formato JSON com uma estrutura que contenha um array chamado "experiments" com 3 objetos, cada um contendo os campos: "hypothesis", "variable", "current_value" e "expected_result".'
    
    if (goalTitle) {
      taskPrompt += ` A meta em foco é: "${goalTitle}".`
    }
    if (goalMetric) {
      taskPrompt += ` A métrica alvo é: ${goalMetric}. Use esta métrica para orientar as hipóteses e resultados esperados.`
    }

    // Chama a OpenAI para gerar experimentos
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `${systemInstruction}\n\n${taskPrompt}`,
        },
        {
          role: 'user',
          content: `Contexto estruturado:\n${JSON.stringify(structuredAnalysis, null, 2)}`,
        },
      ],
      response_format: { type: 'json_object' },
    })

    const experimentsJson = completion.choices[0]?.message?.content

    if (!experimentsJson) {
      return NextResponse.json(
        { error: 'Erro ao gerar experimentos da OpenAI' },
        { status: 500 }
      )
    }

    const experiments = JSON.parse(experimentsJson)

    // Garante que temos um array de experimentos
    let experimentsArray = []
    if (experiments.experiments && Array.isArray(experiments.experiments)) {
      experimentsArray = experiments.experiments
    } else if (Array.isArray(experiments)) {
      experimentsArray = experiments
    } else {
      // Tenta extrair experimentos do objeto
      experimentsArray = Object.values(experiments).filter(
        (exp: any) => exp && typeof exp === 'object'
      )
    }

    // Limita a 3 experimentos
    experimentsArray = experimentsArray.slice(0, 3)

    // Salva os 3 experimentos com goal_id e user_id (obrigatório para RLS)
    const rows = experimentsArray.map((exp: any) => ({
      user_id: user.id,
      hypothesis: exp.hypothesis ?? '',
      variable: exp.variable ?? '',
      current_value: exp.current_value ?? null,
      expected_result: exp.expected_result ?? null,
      context_id: contextId ?? null,
      goal_id,
      status: 'backlog',
    }))

    const { data: saved, error } = await supabaseAuth
      .from('experiments')
      .insert(rows)
      .select()

    if (error) {
      throw error
    }

    return NextResponse.json(
      {
        success: true,
        experiments: saved ?? [],
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Erro na API de geração de experimentos:', error)
    
    // Trata erros específicos da OpenAI
    if (error.status === 400) {
      return NextResponse.json(
        {
          error: `Erro na requisição à OpenAI: ${error.message || 'Formato de requisição inválido'}`,
        },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      {
        error: error.message || 'Erro ao gerar experimentos',
      },
      { status: 500 }
    )
  }
}
