# Atlas Access V1 — runbook de implantação

Estado em 2026-10-18: **LIVE NO**. Engenharia entrega código/evidência;
Helena aplica migrations, configura e opera; PDG aprova release e ativação.
Este documento não autoriza pagamentos, envios externos ou alteração do Master.
Evidência local: [E2E conjunto](joint-e2e-2026-10-18.md).
Operação financeira existente: [runtime ARO](../40_ARO_RUNTIME_RUNBOOK.md).

## Artefactos e ordem de merge (a executar pelos responsáveis)

1. EspelhoMeu [#32](https://github.com/atlashub-digital/espelhomeu/pull/32):
   política base, sessões de sete dias e testes negativos.
2. EspelhoMeu [#33](https://github.com/atlashub-digital/espelhomeu/pull/33):
   persistência, identidade, transports, binding e Reader. Depende da política #32;
   aplicar `0004_access_v1.sql` antes de ativar a API. Incorporar e validar o
   [patch do store](joint-e2e-consumer-store.patch) descrito na
   [lacuna encontrada](joint-e2e-contract-gap.md). Sem isso, E2E persistente falha.
3. ARO [#25](https://github.com/atlashub-digital/atlashub-finance/pull/25):
   emissor de proof/claim. Sua migration depende da fundação ARO já instalada,
   não da tabela do EspelhoMeu. A dependência entre repositórios é de contrato
   e ativação: consumidor pode ser publicado desativado antes do emissor.

Merge e deploy são etapas distintas. Publicar ambos com flags OFF, aplicar as
migrations e só depois configurar o consumidor com o endpoint do emissor.
Código consumidor de referência: `espelhomeu/access-v1`, commit
`dabc2e49171cc8f23e6e70ddfdb60fe89b3eaab5`, `apps/api/src/access/`,
`apps/api/src/routes/access.ts`, `apps/web/src/lib/commerce-access.ts` e
`apps/api/automation/access-test-server.ts`. O E2E substitui o bootstrap simulado
por `scripts/e2e/joint-access.mts` deste repositório; não altera o motor financeiro.

## Migrations e proteção de dados

Helena: inventariar versões/checksums, backup restaurável e espaço, ensaiar em
clone isolado, registrar SHA de ambas as imagens e obter janela de alteração.
Não imprimir DSNs, não usar `set -x`; owner DSN somente no processo de migration,
runtime com permissões mínimas. Nunca aplicar `infra/test/atlashub_substrate.sql`
a bases vivas. Nenhuma fixture ou mudança sintética de status deste E2E é smoke
de produção.

ARO, ordem lexical:

1. `infra/migrations/202610150001_aro_v1_additive.sql` (se ainda não aplicada).
   Altera tabelas partilhadas; rever constraints/RLS com o schema instalado.
2. `infra/migrations/202610180001_hosted_claim.sql`: coluna
   `aro_checkout_session.hostedClaimEligible DEFAULT false`, tabela
   `aro_checkout_claim`, RLS/grants. Não torna sessões antigas elegíveis.

Na imagem ARO já construída, com DATABASE_URL owner injetada pelo gestor de
secrets, executar `node dist/migrate-cli.js`. Alternativa no checkout:

```bash
npm run build
npm run migrate --workspace=@aro/api
```

O runner usa `aro_schema_migrations`, checksum e transação por arquivo. Não editar
migration aplicada nem reaplicar SQL manualmente. Validar inventário sem credenciais:

```sql
SELECT name, checksum FROM aro_schema_migrations ORDER BY name;
SELECT to_regclass('public.aro_checkout_claim');
SELECT column_default FROM information_schema.columns
WHERE table_name='aro_checkout_session' AND column_name='hostedClaimEligible';
```

EspelhoMeu: `apps/api/drizzle/0000_goofy_marrow.sql` → `0001_fast_romulus.sql`
→ `0003_aro_webhook_receipts.sql` → `0004_access_v1.sql`. Não existe 0002 no
journal inspecionado; não inventar. Rodar `pnpm --filter api db:migrate` na raiz
EspelhoMeu com DATABASE_URL da base do consumidor, conferindo o journal Drizzle.
`0004` cria `access_v1_records` com RLS. Garantir papel backend autorizado;
nenhum grant a anon/browser. Não executar o SQL bruto sobre tabela existente.
Os stores de ARO e Access podem usar bases distintas.

Critérios: sem erro/checksum divergente; contagens de pedidos e entitlements vivos
preservadas; health com DB up; runtime ARO membro de `aro_runtime`. DDL pode bloquear:
Helena deve limitar espera de lock e abortar/reagendar se houver contenção.

## Configuração e secrets (somente nomes)

Helena mantém valores em gestor de secrets/env protegido do deployment, separados
por ambiente. Engenharia fornece nomes; PDG aprova uso comercial. Nenhum valor
em Git, logs, browser ou output de CI. Não copiar secrets do Master para preview.

| Serviço | Nomes | Responsável/escopo |
|---|---|---|
| ARO API | `DATABASE_URL`, `ARO_CHECKOUT_SECRET_KEY`, `ARO_OPERATOR_JWT_SECRET`, `ARO_CLAIM_SERVER_KEY` | Helena; DB runtime; claim key de servidor ativa e scoped a espelhomeu |
| ARO API | `ARO_PUBLIC_BASE_URL`, `ARO_HOSTED_CHECKOUT_ENABLED`, `ARO_WORKER_ENABLED`, `LOG_LEVEL`, `NODE_ENV` | Helena; HTTPS público, ingress fechado e forwarded headers sobrescritos |
| EspelhoMeu API | `DATABASE_URL`, `ACCESS_V1_ENCRYPTION_KEY` | Helena; chave AES 256 bits em hexadecimal, estável entre réplicas |
| EspelhoMeu API | `SUPABASE_URL_MASTER`, `SUPABASE_SERVICE_ROLE_KEY_MASTER` | Helena, aprovação de acesso ao Master; nunca no frontend |
| EspelhoMeu API | `ACCESS_V1_ARO_CLAIM_URL`, `ACCESS_V1_ARO_SERVER_KEY` | Helena; URL HTTPS terminada em `/v1/checkout-claims`; mesma key scoped do emissor |
| EspelhoMeu API | `ACCESS_V1_SMTP_HOST`, `ACCESS_V1_SMTP_PORT`, `HOSTINGER_EMAIL_TOKEN`, `ATENDIMENTO_EVOLUTION_KEY` | Helena; SMTP TLS, Evolution interna/instância canónica; sem alterar configuração global do Master |
| EspelhoMeu API | `ACCESS_V1_ENABLED`, `ACCESS_V1_EMAIL_TRANSPORT`, `ACCESS_V1_WA_TRANSPORT`, `ACCESS_V1_LIVE_ENABLED`, `ACCESS_V1_EMAIL_ALLOWLIST`, `ACCESS_V1_WA_ALLOWLIST`, `ACCESS_V1_PUBLIC_ORIGIN`, `WEB_ORIGINS` | Helena configura; PDG aprova destinatários e ativação |
| EspelhoMeu web/BFF | `ACCESS_V1_ENABLED`, `ACCESS_V1_API_URL` | Helena; HTTPS da API; cookies Host Secure HttpOnly SameSite=Lax |
| Preview/test somente | `ACCESS_V1_TEST_MODE`, `ACCESS_V1_TEST_TOKEN` | Credencial efémera; jamais production |

Provider secrets e webhook já existentes seguem docs/40; não provisionar providers
para este E2E. Rotação da claim key precisa ser coordenada nos dois serviços;
interrompe proofs em trânsito. Rotação de encryption key invalida dados cifrados:
exige procedimento de migração/logout, não trocar durante rollout normal.

## Flags por ambiente

| Configuração | Preview padrão | Staging padrão | Production até aprovação |
|---|---|---|---|
| `ACCESS_V1_ENABLED` (API e web) | false | false; true só na janela de smoke | false |
| `ACCESS_V1_EMAIL_TRANSPORT` | off | off; live só com gate/destinatário controlado | off |
| `ACCESS_V1_WA_TRANSPORT` | off | off; live só com gate/consentimento controlado | off |
| `ACCESS_V1_LIVE_ENABLED` | false | false | false |
| allowlists e-mail/WA | vazias | somente destinatários aprovados | vazias até plano de release |
| `ACCESS_V1_TEST_MODE` | false; true só em teste isolado | false | false |
| `ACCESS_V1_TEST_TOKEN` | ausente salvo teste isolado | ausente | ausente |
| `ARO_HOSTED_CHECKOUT_ENABLED` | false salvo E2E | false salvo smoke isolado | false para rollout Access até gate |
| `ACCESS_V1_ARO_CLAIM_URL` | ausente salvo E2E | configurar após migrations | ausente até ativação |

Após aprovação: ENABLED=true nos dois componentes, endpoint/key configurados,
transports `live` apenas para os canais aprovados. Em production o transporte
exige também LIVE_ENABLED=true. **As allowlists só restringem não-production no
código atual**: não constituem gate de destinatários em production. Se for exigido
canário allowlisted em production, implementar esse gate antes de ativar LIVE.
Em staging `live` pode enviar mesmo com LIVE_ENABLED=false: manter transport off
até aprovação. Workers financeiros existentes não devem ser desligados por este rollout.

## Checklist pós-deploy executável

Executar primeiro em staging isolado; preencher hora/SHA/responsável/status.
Nunca usar UPDATE de estado ou fixtures na base viva. Em produção, verificações
financeiras só com transação já aprovada autorizada e sem gerar pagamento novo.
As variáveis shell abaixo são fornecidas pelo ambiente privado; não colar valores.

```bash
curl --fail --silent --show-error "$ARO_BASE/health"
curl --fail --silent --show-error "$ACCESS_API/health"
```

- [ ] Flags OFF: `/api/access/session` deve retornar 404, E7 permanece funcional.
- [ ] Com Access ON: sem cookie, `GET /access/session` retorna 401; Reader pago
  continua reservado. Origem indevida em POST retorna 403.
- [ ] E-mail: POST BFF `/api/access/challenges`, JSON
  `{project:"espelhomeu",channel:"email",method:"otp",identifier:destinatario}`.
  Receber OTP no destinatário aprovado (não copiar para evidência). POST
  `/api/access/challenges/verify` com project/challenge_id/secret; esperar 200,
  cookie Secure/HttpOnly e `/api/access/session` 200. Repetir OTP deve dar 401.
- [ ] WhatsApp: mesmo percurso, channel `whatsapp`, E.164 e
  `transactionalConsent:true`. Receber no dispositivo aprovado; verificar código,
  sessão e opt-out. Sem consentimento 400; após opt-out não entregar novo challenge.
Exemplo executável para challenge no BFF (usar um arquivo privado
`$OTP_REQUEST_FILE` com JSON válido, destinatário controlado e consentimento quando WA):

```bash
curl --fail --silent --show-error -X POST "$WEB_BASE/api/access/challenges" \
  -H "Origin: $WEB_BASE" -H 'Content-Type: application/json' \
  --data-binary @"$OTP_REQUEST_FILE" > "$PRIVATE_CHALLENGE_RESPONSE"
# Verificação: arquivo privado contém project/challenge_id/secret; não imprimir.
curl --fail --silent --show-error -X POST "$WEB_BASE/api/access/challenges/verify" \
  -H "Origin: $WEB_BASE" -H 'Content-Type: application/json' \
  --data-binary @"$OTP_VERIFY_FILE" --cookie-jar "$PRIVATE_COOKIE_JAR" > /dev/null
curl --fail --silent --show-error "$WEB_BASE/api/access/session" \
  --cookie "$PRIVATE_COOKIE_JAR" > /dev/null
```

Arquivos temporários devem ter permissão 0600 e ser removidos ao final; não anexar
respostas, código ou cookie como evidência. Repetir para cada canal aprovado.

- [ ] Claim: obter proof por POST `/v1/checkout-sessions/{id}/claim-proof`, body `{}`,
  header `X-ARO-Checkout-Secret`, apenas de sessão hosted elegível APPROVED/ACTIVE.
  Handoff por POST/memória, sem URL/storage/log. Enviar JSON recebido
  project/orderId/checkoutSessionId/offerId/proof (sem timestamps) ao BFF
  `/api/access/aro/claim` com cookie da sessão e Origin permitido: esperar 200.
- [ ] Reader `/ler/7-dias-para-me-escolher`: conteúdo integral só após autorização;
  backend `/access/entitlements` contém p01. Não usar cookie E7 para esta prova.
- [ ] Replay retorna 409. Claim expirada após 120 s retorna 409 no consumidor;
  issuer retorna 403 para proof vencida. PENDING não emite proof (409).
- [ ] No staging sintético: REFUNDED entre emissão/troca, CHARGEBACK, revogação,
  outra sessão e cross-tenant recusados. Reader já autorizado deve fechar após
  reversão/revogação e quando ARO estiver indisponível. Nenhuma claim negativa consumida.
- [ ] Novo dispositivo exige nova posse; logout invalida sessão; expirado não abre
  Reader. Cookies e provas nunca no relatório.

E2E backend reproduzível e sem pagamentos: seguir comandos na evidência conjunta.
Entrega SMTP/WA e browser reais continuam gates separados; não inferir entrega de
resposta 2xx do provider. Se qualquer passo falhar, flags OFF e investigar.

## Monitorização e resposta

Logs estruturados por serviço/request-id/status/latência, sem body de OTP/claim,
cookies, Authorization, proof, checkout secret, DSN ou PII. ARO já redige headers;
não ativar debug HTTP/SMTP. Consumer access routes silenciosas; telemetria adicional
precisa de sanitização explícita. Não exportar `access_v1_records.value` para logs.

Auditoria ARO: `aro.claim.proof_issued`, `aro.claim.consumed`; consumo e audit na
mesma transação. Consultas privadas agregadas:

```sql
SELECT action, count(*) FROM "AuditEvent"
WHERE action IN ('aro.claim.proof_issued','aro.claim.consumed')
  AND at > CURRENT_TIMESTAMP - interval '1 hour' GROUP BY action;
SELECT count(*) AS claims FROM aro_checkout_claim;
SELECT jsonb_typeof(value) AS kind, count(*) FROM access_v1_records GROUP BY 1;
```

Mínimos a instrumentar por Helena antes de LIVE: health/DB, taxas 2xx/401/403/409/5xx
por endpoint, p95 e timeout de exchange/resolve, consumo/audit, tentativas de replay,
OTP accepted/failed por canal, breaker aberto, verificação falhada/rate limit,
Reader negado após reversão. Sem identificador do comprador em label.
Alertas iniciais: DB down imediato; qualquer consumo sem audit imediato; 5xx >1%
em 5 min; três falhas de entrega/circuito aberto; crescimento de timeouts.
Esses limites são proposta operacional, não dashboards já implantados.

## Rollback

1. Helena desliga `ACCESS_V1_ENABLED` na web e API, transports `off`,
   LIVE_ENABLED=false; remove claim URL do consumidor e a configuração opt-in de
   claims do emissor. Se hosted checkout já for usado por outro fluxo, preservar
   seu flag e desabilitar só a claim key. Não interromper workers/pagamentos.
   Reiniciar/redeploy e verificar 404 Access, E7/health estáveis. Meta: 5–10 min,
   estimativa a validar no staging. Desligar transporte sozinho não revoga sessões.
2. Preservar migrations aditivas e dados por padrão; voltar às imagens anteriores
   conhecidas, depois reverter merges por PR na ordem #25 → #33 → #32. Não fazer
   reset/force-push. Reversão de código/rollout: estimativa 10–20 min.
3. Se remoção de schema for indispensável: impedir writers, exportar backup de
   claims/auditoria/records, testar restauração e obter aprovação de Helena/PDG.
   SQL destrutivo abaixo só após essa decisão; não é rollback automático.

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Conteúdo de infra/migrations/rollback/202610180001_hosted_claim.down.sql:
DROP TABLE IF EXISTS aro_checkout_claim;
ALTER TABLE aro_checkout_session DROP COLUMN "hostedClaimEligible";
DELETE FROM aro_schema_migrations WHERE name='202610180001_hosted_claim.sql';
COMMIT;
```

Remover claims apaga proteção de replay: proibir novos exchanges até expirar todo
proof antigo, rodar key e definir plano de reativação que não reabilite sessões
consumidas. Reaplicar migration dá DEFAULT false às sessões anteriores.
Não executar rollback da fundação ARO com dados vivos: altera tabelas financeiras
partilhadas. Usar forward fix/restore coordenado.

Rollback SQL do consumidor (apenas base Access parada e backup aprovado):

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TABLE access_v1_records;
COMMIT;
```

Isso encerra sessões/bindings/cooldowns; não apaga ordens/entitlements. Drizzle não
possui down automático neste repo: após DROP não reexecutar migrate esperando
recriação; o journal ainda marca 0004 aplicada. Recuperar backup ou preparar
migration forward explícita. Não apagar journal global. Schema rollback/restore:
30–60 min estimados conforme volume; sem RTO garantido antes do ensaio.

## Gates de ativação pendentes

- [ ] Incorporar correção JSONB no #33 e repetir E2E sem patch local.
- [ ] Helena: migrations/checksums/RLS e backup/restore/rollback ensaiados.
- [ ] PDG + Helena: autorização de acesso ao Master e validação de identidade;
  SMTP Master/Hostinger/remetente/TLS e entrega controlada, sem mudar template
  global compartilhado; OTP WA com consentimento e dispositivo real.
- [ ] PDG: allow-list de destinatários, política de canário e limitação production
  resolvida; aprovação explícita de envios comerciais (não concedida por este brief).
- [ ] Engenharia + Helena: handoff hosted no browser real sem URL/storage,
  Reader/BFF fail-closed sem capacidade E7, novo dispositivo e logout.
- [ ] Helena: ingress HTTPS e headers confiáveis, envs separados, sem test mode,
  monitorização/alertas e dono de incidente.
- [ ] PDG: aprovação final de release; Helena: smoke operacional e janela de ativação.

Nenhum merge, deploy, pagamento real ou envio comercial foi executado nesta tarefa.
