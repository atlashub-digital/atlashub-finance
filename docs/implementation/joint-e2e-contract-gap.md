# Lacuna encontrada antes da correção — 2026-10-18

O consumidor EspelhoMeu dabc2e49171cc8f23e6e70ddfdb60fe89b3eaab5,
`apps/api/src/access/store.ts`, passa `JSON.stringify(value)` a um parâmetro
inferido como JSONB por postgres-js. O driver serializa novamente: `jsonb_typeof(value)`
retorna `string`, não `object`. Challenge HTTP retorna 200 mas previewSecret retorna
null; sessão não pode ser criada. Isso bloqueia o E2E real com persistência.

Correção mínima proposta: `sql.json(JSON.parse(JSON.stringify(value)))` em vez de `JSON.stringify(value)`
(normalização JSON compatível com o tipo RecordValue e serialização explícita do driver).
Não muda contrato HTTP nem motor financeiro. Patch adjunto aplicado somente à
cópia local do consumidor para a execução; deve entrar no PR #33 antes do release.
Registos já gravados como strings requerem backup e reparação controlada por Helena,
antes de reativar Access. Não converter valores indiscriminadamente.

O bootstrap original `automation/access-test-server.ts` também usa ARO/GoTrue/WA
simulados e memoryStore. O runner conjunto substitui apenas esse bootstrap por
rotas/serviço/store reais, PostgreSQL e remoteAroClaim reais. Identidade WA usa
posse sintética via preview sem entrega externa. Reader é verificado pelo endpoint
de autorização que o Reader consulta; não é evidência de renderização no browser.
