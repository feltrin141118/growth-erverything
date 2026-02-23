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
    const { text, contextId, current_goal, goal_id } = body

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Texto é obrigatório' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY não configurada' },
        { status: 500 }
      )
    }

    let currentCycle = 0
    let lastSummary: string | null = null
    if (goal_id != null && goal_id !== '') {
      const { data: goal } = await supabaseAuth
        .from('goals')
        .select('current_cycle')
        .eq('id', goal_id)
        .single()
      if (goal?.current_cycle != null) currentCycle = Number(goal.current_cycle)
      const { data: lastContext } = await supabaseAuth
        .from('contexts')
        .select('summary')
        .eq('goal_id', goal_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lastContext?.summary && typeof lastContext.summary === 'string') lastSummary = lastContext.summary
    }

    const isCycleZero = currentCycle === 0
    const systemPrompt = isCycleZero
      ? `Analise o contexto enviado. Identifique variáveis, métricas e gargalos.
Retorne um JSON estruturado que inclua sua análise E um campo obrigatório "strategic_overview" (string).
Lógica para strategic_overview (Ciclo 0): analise apenas as informações iniciais. Se o texto for curto ou vago, sugira caminhos concretos (ex: "Faltam dados sobre métricas atuais", "Detalhe o resultado esperado").
Atue como um mentor: valide se o caminho escolhido faz sentido estatístico ou prático e dê dicas objetivas.`
      : `Analise o contexto enviado. Identifique variáveis, métricas e gargalos.
Você receberá o "summary" do ciclo anterior (contexto, hipótese testada e lições aprendidas). Compare o que foi aprendido com as novas intenções do contexto atual.
Retorne um JSON estruturado que inclua sua análise E um campo obrigatório "strategic_overview" (string).
Lógica para strategic_overview (Ciclo > 0): leia o summary do banco e as novas informações. Compare o que foi aprendido no teste passado com o que estamos tentando agora.
Atue como um mentor: valide se o caminho escolhido faz sentido estatístico ou prático e dê dicas objetivas.`

    let userContent = text
    if (!isCycleZero && lastSummary) {
      userContent = `[Summary do ciclo anterior]\n${lastSummary}\n\n[Contexto atual para análise]\n${text}`
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userContent,
        },
      ],
      response_format: { type: 'json_object' },
    })

    const structuredAnalysis = completion.choices[0]?.message?.content

    if (!structuredAnalysis) {
      return NextResponse.json(
        { error: 'Erro ao gerar análise da OpenAI' },
        { status: 500 }
      )
    }

    // Salva a análise estruturada no Supabase
    // Se contextId foi fornecido, atualiza o registro existente
    // Caso contrário, cria um novo registro
    let result
    if (contextId) {
      // Atualiza registro existente
      const updatePayload: Record<string, unknown> = {
        structured_analysis: structuredAnalysis,
      }
      if (current_goal !== undefined) {
        updatePayload.current_goal = current_goal
      }
      if (goal_id !== undefined) {
        updatePayload.goal_id = goal_id
      }
      const { data, error } = await supabaseAuth
        .from('contexts')
        .update(updatePayload)
        .eq('id', contextId)
        .select()

      if (error) {
        throw error
      }
      result = data
    } else {
      // Cria novo registro com conteúdo e análise; goal_id é obrigatório (UUID ou número da meta selecionada)
      const insertPayload: Record<string, unknown> = {
        user_id: user.id,
        raw_input: text,
        structured_analysis: structuredAnalysis,
        goal_id: goal_id ?? null,
      }
      if (current_goal !== undefined) {
        insertPayload.current_goal = current_goal
      }
      const { data, error } = await supabaseAuth
        .from('contexts')
        .insert([insertPayload])
        .select()

      if (error) {
        throw error
      }
      result = data
    }

    return NextResponse.json(
      {
        success: true,
        structuredAnalysis,
        context: result?.[0],
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Erro na API de diagnóstico:', error)
    return NextResponse.json(
      {
        error: error.message || 'Erro ao processar diagnóstico',
      },
      { status: 500 }
    )
  }
}
