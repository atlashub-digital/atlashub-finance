# ARO P0 — missão única de ativação na VPS (17/10/2026)

**Aprovação de direção:** concluir o ARO já implementado, sem criar outra infraestrutura nem duplicar o checkout. Engenharia e Helena executam esta missão ponta a ponta; reportar uma única vez por resultados verificáveis.

## Estado verificado na AtlasHub Master (consulta somente leitura)

- `atlashub-si`, `espelhomeu`, `atlas-club`: registados, status `active`, cada um com 2 chaves API *ativas* (não revela chaves).
- PixGo, MisticPay e Stripe: contas registadas como `active`; 4 rotas preconfiguradas (PIX PixGo prioritário, fallback MisticPay; cartões Stripe EUR/USD). Status na BD **não prova credencial válida nem saúde do provider**.
- `atlashub-si`: webhook configurado, 4 origens permitidas.
- Três ofertas LL01 já existentes no catálogo financeiro ARO: `ll01-antecipado-br` 39700, `ll01-regular-br` 49700, `ll01-reserva10-br` 35730 centavos, BRL, *active*.
- `commerce_order`, `aro_checkout_session`, `aro_payment_attempt`, `crm_contact`, `aro_webhook_delivery` e `aro_refund`: tabelas presentes com dados.
- 2 tentativas APPROVED, 14 PENDING, 2 UNKNOWN, 17 FAILED na BD (histórico desconhecido; nunca inferir produção homologada).
- ARO hosted checkout na main SHA `f137ad31` tem testes + Docker verdes, **feature `ARO_HOSTED_CHECKOUT_ENABLED=false` por padrão**.
- Hermes tinha contrato observer e API `/v1/operator/projects/:project/revenue/overview`. Esta missão acrescenta `/v1/operator/projects/:project/operations/p0` para estado operacional sem PII.

## Execução na ordem, sem reuniões intermédias

### A. Infraestrutura (Helena — em runtime existente)

1. Confirmar **VPS correta, compose project já em utilização, DNS e Caddy TLS** antes de atualizar. O conector desta conversa não fornece consola da VPS; **não foi efetuado deploy de runtime aqui**.
2. Obter branch main após PR de diagnostics CI verde e capturar commit SHA; construir imagem Docker com tag imutável (não `latest`) usando `infra/docker/Dockerfile`.
3. Confirmar configurações **dentro do cofre/env host**, sem imprimir segredos: `DATABASE_URL` = runtime role `aro_runtime` da AtlasHub Master, `ARO_PUBLIC_BASE_URL` HTTPS real, `ARO_CHECKOUT_SECRET_KEY`, `ARO_OPERATOR_JWT_SECRET`, credentials de PixGo/MisticPay/Stripe com env ref `ARO_SECRET_*__*`, project webhook secrets. Nunca copiar secrets para issue/Telegram.
4. Confirmar snapshot/backup recente. `aro_schema_migrations` e tabelas já existem na Master: **NÃO reaplicar migração inaugural cegamente**. Só executar migração se houver delta verificado e homologado; nenhum DDL adicional é necessário a este PR de observer.
5. Usar **o compose stack e Caddy existentes**, sem criar outro serviço em porta conflitante. Validar `/health`, Caddy encaminhando `/pay/*`, `/assets/*`, `/v1/*`; habilitar TLS/CSP e allowlist de origens.

Comandos de referência **na VPS já configurada**, no mesmo projeto compose:

```bash
git fetch origin && git checkout main && git pull --ff-only
SHA=$(git rev-parse --short HEAD)
docker build -f infra/docker/Dockerfile -t "aro-api:$SHA" .
# Validar qual o docker compose project/serviço atual ANTES do seguinte comando:
ARO_IMAGE="aro-api:$SHA" docker compose -f infra/docker/compose.aro.yml config --services
ARO_IMAGE="aro-api:$SHA" docker compose -f infra/docker/compose.aro.yml up -d --no-deps aro-api
ARO_BASE_URL="https://<host-ARO-real>" node scripts/aro-p0-smoke.mjs
```

**NOTA:** `ARO_IMAGE` no comando não fica persistido entre atualizações do compose; fixar a tag imutável na configuração gerida pela Helena. Guardar a tag anterior para rollback. Confirmar `edge` network externa, env file e compose project já usados pela VPS.

### B. PIX controlado (Helena + responsável financeiro)

1. Primeiro smoke não financeiro com `ARO_HOSTED_CHECKOUT_ENABLED=false`: API health/db. Depois habilitar em **ambiente de teste isolado** ou janela controlada (não para tráfego público ainda) e reiniciar serviço.
2. Sem criar dados de comprador ou emitir PIX, testar link de oferta canónica:
```bash
ARO_BASE_URL="https://<host-ARO-real>" \
  ARO_PROJECT_SERVER_KEY="<injetada pelo gestor de segredos>" \
  ARO_OFFER_CODE="ll01-antecipado-br" \
  node scripts/aro-p0-smoke.mjs --checkout-link
```
3. Validar link Pix em WhatsApp (browser standalone) e botão em site autorizado (popup iframe). Não colocar a SERVER KEY no JavaScript nem numa URL. Modelo `/pay/:token` gera preço do catálogo, nunca usa valor livre do browser.
4. Certificação E2E **apenas com comprador e pagamento controlados autorizados**: pedido → provider PIX → webhook com HMAC validado → pagamento APPROVED → entitlement ACTIVE → projeto regista inscrição ou desbloqueia Reader → CRM/Atendimento.Center. Testar falha de provider, retry sem duplicar PIX, fechar/reabrir, webhook duplicado, estorno e reconciliação.
5. Se qualquer gate falhar: feature flag OFF para visitantes e conservar implementação anterior de cada projeto. Não fornecer link de venda como LIVE.

### C. Gestão de projetos / CRM / reporting

- Chaves públicas e de servidor são emitidas com `node dist/admin-cli.js issue-key <project> public|server`; **texto integral entregue uma vez** a destino secreto. Guardar na BD só hash/prefix/escopos. Para webhook, segredo de projeto separado de provider.
- `aro_project_config` guarda endpoint webhook, referência ao segredo, origins; `aro_provider_account` e `aro_payment_route` guardam contas, market, currency, prioridades; **creds dos providers ficam no secret manager, não em plaintext na BD**.
- No ARO, `crm_contact` e `commerce_order` são dados transacionais. Leads de marketing continuam CRM central Atendimento.Center, sincronizados por eventos com `project,contact,external_reference` e consentimento separado. Não assumir sincronização se integração de webhook/outbox falhar.
- Reporting P0: endpoint revenue overview existente + novo `/v1/operator/projects/:project/operations/p0` (JWT operator com `revenue:read`). Apenas valores por projeto e moeda, tentativas PENDING/UNKNOWN, webhooks pendentes e fees observadas. **Não declarar saldo disponível/payout com base em APPROVED**.
- Hermes inicia read-only como observer com token curto e scopes por projeto. Alterações de provider credentials, mudança de routing, pagamentos, refunds, payouts e scripts na VPS continuam com autorização e auditoria humanas. Hermes pode implementar PRs de adapters em branches e propor novas configurações, nunca marcar pagamento como aprovado.

## Definição final de pronto (um relatório, não 10 rondas)

Entregar exatamente uma tabela com `PASS|FAIL|BLOCKED` para: VPS/HTTPS, health, Master DB, providers/rotas, API projects/keys, 3 ofertas LL01, checkout-link, PIX QR/copia-cola standalone, popup, webhook assinado, entidade/order/CRM, E2E APPROVED + entitlement, report Hermes, fallback/rollback, fluxos existentes. Inclui evidência sanitizada e SHA; **não expor dados de clientes, chaves ou documentos**. Fechar com `ARO V1 LIVE: YES/NO`.

Separadamente: API de ofertas rápidas/serviços avulsos ([issue #21](https://github.com/atlashub-digital/atlashub-finance/issues/21)) e treasury/ledger de payout são evoluções, **não bloqueiam o PIX P0 com ofertas já aprovadas**.
