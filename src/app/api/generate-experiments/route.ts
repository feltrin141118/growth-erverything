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

    // Se goal_id foi enviado, busca título, métrica e plataforma da meta para a IA
    let goalTitle = ''
    let goalMetric = targetMetric
    let goalPlatform = ''
    if (goal_id) {
      const { data: goal } = await supabaseAuth
        .from('goals')
        .select('title, target_metric, ad_platform')
        .eq('id', goal_id)
        .single()
      if (goal) {
        goalTitle = goal.title ?? ''
        if (goal.target_metric) goalMetric = goal.target_metric
        if ((goal as any).ad_platform) goalPlatform = (goal as any).ad_platform
      }
    }

    // Instrução de persona e idioma (Sistema)
    const systemInstruction =
      'Você é um Gestor de Tráfego Sênior e Estrategista de Growth com 10 anos de experiência em contas de 7 dígitos no Meta Ads, Google Ads e TikTok Ads. Sua missão é analisar um diagnóstico de tráfego e gerar 5 experimentos de alta probabilidade de sucesso para otimizar o ROAS e baixar o CPA. Responda obrigatoriamente em português do Brasil.'

    // Monta o prompt da tarefa com diretrizes de especialista e formato de saída
    let taskPrompt = `
Diretrizes de Especialista:

1) Foco em Funil: identifique se o problema está no TOFU (Atração/CTR), MOFU (Engajamento/Retenção) ou BOFU (Conversão/Checkout).
2) Linha de Corte (Cutoff): cada experimento deve ter uma linha de corte financeira clara, por exemplo: "Pausar se o CPL ultrapassar R$ X após 500 impressões".
3) Hipóteses Atômicas: nunca sugira apenas "melhorar o criativo". Em vez disso, sugira hipóteses concretas como "Testar um gancho de curiosidade nos primeiros 3 segundos vs um gancho de dor direta".
4) Priorização ICE:
   - Impacto: o quanto isso move o ponteiro do lucro?
   - Confiança: você já viu isso funcionar antes?
   - Facilidade: dá para subir esse teste em 15 minutos?

Formato de Saída (JSON Estrito):
Retorne EXCLUSIVAMENTE um array JSON com 5 objetos, cada um com os campos:
- "title": título curto do experimento.
- "hypothesis": hipótese detalhada do teste.
- "metric": métrica específica de tráfego (ex.: CPC, CTR, ROAS, CPA, taxa de retenção de vídeo).
- "target": valor numérico desejado para a métrica.
- "cutoff_line": regra objetiva de pausa (linha de corte).
- "ice_score": pontuação ou breve justificativa de ICE.
`.trim()

    if (goalTitle) {
      taskPrompt += `\n\nA meta em foco é: "${goalTitle}".`
    }
    if (goalMetric) {
      taskPrompt += `\nA métrica alvo principal é: ${goalMetric}. Use essa métrica para orientar as hipóteses e os targets numéricos.`
    }
    if (goalPlatform) {
      taskPrompt += `\nA plataforma de tráfego pago em foco é: ${goalPlatform}. Adapte os experimentos especificamente para essa plataforma.`
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

    const experimentsParsed = JSON.parse(experimentsJson)

    // Garante que temos um array de experimentos (novo formato: array puro)
    let experimentsArray: any[] = []
    if (Array.isArray(experimentsParsed)) {
      experimentsArray = experimentsParsed
    } else if (experimentsParsed.experiments && Array.isArray(experimentsParsed.experiments)) {
      experimentsArray = experimentsParsed.experiments
    } else {
      experimentsArray = Object.values(experimentsParsed).filter(
        (exp: any) => exp && typeof exp === 'object'
      )
    }

    // Limita a 5 experimentos
    experimentsArray = experimentsArray.slice(0, 5)

    // Salva os experimentos com goal_id e user_id (obrigatório para RLS)
    const rows = experimentsArray.map((exp: any) => ({
      user_id: user.id,
      // title não existe na tabela; usamos hypothesis como campo principal do cartão
      hypothesis: exp.hypothesis ?? exp.title ?? '',
      variable: exp.metric ?? '',
      expected_result: exp.target ?? null,
      target_value: exp.target ?? null,
      cutoff_line: exp.cutoff_line ?? null,
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
