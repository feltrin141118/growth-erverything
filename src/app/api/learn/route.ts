import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { supabase } from '@/lib/supabase'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { experimentId } = body

    if (!experimentId) {
      return NextResponse.json(
        { error: 'ID do experimento é obrigatório' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY não configurada' },
        { status: 500 }
      )
    }

    // Busca os dados do experimento no banco
    const { data: experiment, error: fetchError } = await supabase
      .from('experiments')
      .select('*')
      .eq('id', experimentId)
      .single()

    if (fetchError || !experiment) {
      return NextResponse.json(
        { error: 'Experimento não encontrado' },
        { status: 404 }
      )
    }

    // Verifica se o experimento foi completado
    if (experiment.status !== 'completed') {
      return NextResponse.json(
        { error: 'Experimento ainda não foi completado' },
        { status: 400 }
      )
    }

    // Prepara a descrição do experimento
    const experimentDescription = [
      experiment.hypothesis && `Hipótese: ${experiment.hypothesis}`,
      experiment.variable && `Variável: ${experiment.variable}`,
      experiment.current_value !== undefined && `Valor Atual: ${experiment.current_value}`,
      experiment.expected_result !== undefined && `Resultado Esperado: ${experiment.expected_result}`,
      experiment.final_value !== undefined && experiment.final_value !== null && `Valor Final Alcançado: ${experiment.final_value}`,
      experiment.result && `Resultado: ${experiment.result === 'success' ? 'Sucesso' : 'Falha'}`,
      experiment.learnings && `Aprendizados: ${experiment.learnings}`,
    ]
      .filter(Boolean)
      .join('\n')

    // Monta o prompt para a OpenAI
    const prompt = `O experimento teve o resultado ${experiment.result === 'success' ? 'Sucesso' : 'Falha'}. Com base nisso, qual deve ser a próxima grande prioridade para este negócio? Responda de forma clara e objetiva, focando em ações práticas.`

    // Chama a OpenAI para gerar a recomendação
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Você é um consultor estratégico especializado em análise de experimentos e priorização de ações para negócios.',
        },
        {
          role: 'user',
          content: `Detalhes do experimento:\n${experimentDescription}\n\n${prompt}`,
        },
      ],
    })

    const recommendation = completion.choices[0]?.message?.content

    if (!recommendation) {
      return NextResponse.json(
        { error: 'Erro ao gerar recomendação da OpenAI' },
        { status: 500 }
      )
    }

    // Salva a recomendação no banco de dados
    const { data, error: updateError } = await supabase
      .from('experiments')
      .update({
        recommendation: recommendation.trim(),
      })
      .eq('id', experimentId)
      .select()

    if (updateError) {
      throw updateError
    }

    return NextResponse.json(
      {
        success: true,
        recommendation,
        experiment: data?.[0],
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Erro na API de aprendizado:', error)
    return NextResponse.json(
      {
        error: error.message || 'Erro ao processar aprendizado',
      },
      { status: 500 }
    )
  }
}
