import HeaderWrapper from '@/components/HeaderWrapper'
import './globals.css'

export const metadata = {
  title: 'Growth Everything',
  description: 'Growth Everything — visão geral, metas, diagnóstico e esteira de experimentos.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-br">
      <body>
        <HeaderWrapper />
        <main>{children}</main>
      </body>
    </html>
  )
}