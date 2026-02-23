# Growth Everything

Micro-SaaS construído com **Next.js 14** (App Router) e **TailwindCSS**.

## Pré-requisitos

- Node.js 18+
- npm

## Como rodar

```bash
# Instalar dependências
npm install

# Desenvolvimento
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — build de produção
- `npm run start` — servidor de produção (após `npm run build`)
- `npm run lint` — ESLint

## Estrutura (App Router)

```
src/
  app/
    layout.tsx   # layout raiz
    page.tsx     # página inicial
    globals.css  # estilos globais + Tailwind
```

## Tecnologias

- Next.js 14 (App Router)
- React 18
- TypeScript
- TailwindCSS 3
- ESLint (next/core-web-vitals)
