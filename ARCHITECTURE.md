# Arquitetura --- Distributed Wagering Processor

## 1. Objetivo

O Distributed Wagering Processor recebe operações de apostas de
múltiplos provedores, atualiza saldos de carteiras, registra o histórico
financeiro e publica eventos de integração.

A arquitetura foi organizada em torno dos principais desafios do
domínio:

- Correção financeira e precisão monetária.
- Idempotência persistente.
- Controle de concorrência.
- Consistência entre o saldo armazenado e o ledger.
- Processamento assíncrono e recuperação após falhas.
- Separação de responsabilidades e clareza das decisões técnicas.

Este documento descreve o desenho implementado e identifica
explicitamente as limitações conhecidas.

## 2. Visão arquitetural

```
distributed-wagering-processor/
└── src/
    ├── health/
    │   ├── health.controller.ts
    │   └── health.module.ts
    │
    ├── inbox/
    │   ├── entities/
    │   │   └── inbox-message.entity.ts
    │   ├── repositories/
    │   │   └── inbox-message.repository.ts
    │   ├── inbox-consumer.service.ts
    │   └── inbox.module.ts
    │
    ├── ledger/
    │   ├── domain/
    │   │   ├── wallet-ledger-entry.spec.ts
    │   │   └── wallet-ledger-entry.ts
    │   ├── entities/
    │   │   └── wallet-ledger-entry.entity.ts
    │   ├── repositories/
    │   │   ├── wallet-ledger.repository-impl.ts
    │   │   └── wallet-ledger.repository.ts
    │   └── ledger.module.ts
    │
    ├── migrations/
    │   ├── .snapshot-wagering.json
    │   └── ... (demais migrations)
    │
    ├── outbox/
    │   ├── entities/
    │   │   └── outbox-event.entity.ts
    │   ├── repositories/
    │   │   ├── outbox-event.repository-impl.ts
    │   │   └── outbox-event.repository.ts
    │   ├── services/
    │   │   ├── outbox-publisher.integration.spec.ts
    │   │   ├── outbox-publisher.service.ts
    │   │   └── outbox-worker.service.ts
    │   └── outbox.module.ts
    │
    ├── shared/
    │   ├── domain/
    │   │   ├── ledger-direction.ts
    │   │   ├── money.spec.ts
    │   │   └── money.ts
    │   └── infrastructure/
    │       ├── database-transaction.module.ts
    │       ├── database-transaction.service.spec.ts
    │       ├── database-transaction.service.ts
    │       └── repositories-transaction.integration.spec.ts
    │
    ├── wager-transactions/
    │   ├── domain/
    │   │   ├── wager-transaction.spec.ts
    │   │   └── wager-transaction.ts
    │   ├── dto/
    │   │   └── process-wager-transaction.dto.ts
    │   ├── entities/
    │   │   └── wager-transaction.entity.ts
    │   ├── repositories/
    │   │   ├── wager-transaction.repository-impl.ts
    │   │   └── wager-transaction.repository.ts
    │   ├── use-cases/
    │   │   ├── process-wager-transaction.integration.spec.ts
    │   │   └── process-wager-transaction.use-case.ts
    │   ├── provider-wager-transactions.controller.ts
    │   ├── wager-processing.module.ts
    │   ├── wager-transaction.module.ts
    │   ├── wager-transactions.controller.ts
    │   └── wager-transactions.service.ts
    │
    ├── wallets/
    │   ├── domain/
    │   │   ├── wallet.spec.ts
    │   │   └── wallet.ts
    │   ├── dto/
    │   │   └── open-wallet.dto.ts
    │   ├── entities/
    │   │   └── wallet.entity.ts
    │   ├── repositories/
    │   │   ├── wallet.repository-impl.ts
    │   │   └── wallet.repository.ts
    │   ├── wallets.controller.ts
    │   ├── wallets.module.ts
    │   ├── wallets.service.integration.spec.ts
    │   └── wallets.service.ts
    │
    ├── app.controller.ts
    ├── app.module.ts
    ├── app.service.ts
    └── main.ts
```

### Responsabilidades dos módulos

- **`wallets`:** abertura e consulta de carteiras, consulta paginada
  do ledger e reconciliação.
- **`wager-transactions`:** domínio das transações de aposta,
  endpoints HTTP, repositórios e caso de uso de processamento.
- **`ledger`:** persistência de lançamentos de crédito/débito e
  cálculo do saldo líquido.
- **`outbox`:** persistência e publicação assíncrona de eventos.
- **`inbox`:** registro e deduplicação de mensagens recebidas.
- **`health`:** endpoints de liveness e readiness.

As consultas de transação por ID interno e por provedor/ID externo são
centralizadas em um serviço de leitura. As operações financeiras de
escrita utilizam o caso de uso de processamento de transações.

## 3. Fluxo de uma transação financeira

O fluxo geral de processamento é:

1.  A operação chega por HTTP ou por uma mensagem SQS.
2.  Os dados são validados e os registros existentes são consultados
    para detectar duplicidade ou conflito de idempotência.
3.  A carteira é carregada e bloqueada durante o processamento
    financeiro.
4.  As regras de domínio da operação são avaliadas.
5.  Quando a operação é processada, a transação, a atualização de saldo,
    o lançamento do ledger e o evento da Outbox são persistidos dentro
    da transação SQL nos fluxos implementados.
6.  O worker da Outbox publica os eventos pendentes no SQS.
7.  O consumidor da Inbox processa solicitações recebidas usando o mesmo
    caso de uso financeiro.

O objetivo do fluxo transacional é impedir que o saldo seja alterado sem
o lançamento correspondente no ledger, ou que a operação financeira seja
confirmada sem o evento da Outbox correspondente.

## 4. Modelo financeiro e invariantes

### Saldo materializado

A carteira armazena o saldo atual para permitir leituras eficientes e
verificações durante o processamento de operações.

### Ledger

Cada lançamento registra carteira, transação associada, direção
(`CREDIT` ou `DEBIT`), valor, moeda, saldo anterior, saldo posterior e
data de criação. O histórico financeiro deve ser tratado como
append-only: correções devem ocorrer por meio de operações
compensatórias, e não pela alteração de registros históricos.

### Saldo inicial

Ao criar uma carteira com saldo inicial positivo, o sistema cria uma
transação interna `OPENING` e um lançamento `CREDIT` na mesma transação
SQL da criação da carteira.

### Valores monetários

Os valores são representados como strings decimais nos limites da
API/domínio e armazenados em colunas numéricas do PostgreSQL. Cálculos
financeiros não devem depender de aritmética binária de ponto flutuante.
As operações também precisam validar moeda e respeitar as regras de
saldo mínimo definidas pelo domínio.

### Reconciliação

A rota `POST /wallets/:walletId/reconciliation` calcula o saldo líquido
dos lançamentos --- créditos menos débitos --- e compara o resultado com
o saldo armazenado na carteira.

A resposta inclui:

- `storedBalance`: saldo persistido e moeda.
- `calculatedBalance`: saldo reconstruído a partir dos lançamentos.
- `difference`: saldo armazenado menos saldo calculado.
- `consistent`: indica se a diferença é zero.
- `checkedEntries`: quantidade de lançamentos considerados.

A reconciliação não modifica o saldo da carteira. A consulta atual
valida o total líquido, mas não verifica individualmente se a sequência
de `balanceBefore` e `balanceAfter` é consistente em todos os
lançamentos.

## 5. Idempotência

A API aceita o cabeçalho `Idempotency-Key` e a implementação também
consulta identificadores de provedor e de transação externa.

O comportamento pretendido é:

- Mesma chave e mesmo payload de negócio: reutilizar o resultado
  existente sem repetir o efeito financeiro.
- Mesma chave com payload diferente: rejeitar como conflito.
- Repetição da identidade de provedor/transação externa: impedir
  duplicação do efeito financeiro.

O hash atual utiliza SHA-256 sobre uma representação JSON com
propriedades fixas. Ainda não existe canonicalização geral com ordenação
recursiva de chaves. Esse ponto precisa ser aprimorado para garantir
hashes consistentes com payloads equivalentes serializados em ordens
diferentes.

## 6. Concorrência e transações SQL

O fluxo financeiro utiliza um serviço de transação de banco de dados
para agrupar gravações relacionadas. A unidade atômica pretendida
contém:

- Registro da transação de aposta.
- Atualização do saldo da carteira.
- Lançamento do ledger.
- Evento da Outbox.

O bloqueio da carteira durante o processamento ajuda a serializar
operações concorrentes sobre a mesma carteira e reduz o risco de
atualizações de saldo incompatíveis.

### Limitação da Inbox

Quando uma solicitação chega pelo SQS, o registro da Inbox é salvo
depois que o caso de uso financeiro termina, e não na mesma transação
SQL. Portanto, a implementação ainda não garante atomicidade entre o
registro da Inbox e a operação financeira.

Se o processo falhar depois do commit financeiro e antes da gravação da
Inbox, a mensagem pode ser entregue novamente. A idempotência de negócio
reduz o risco de duplicar o efeito financeiro, mas não substitui a
atomicidade completa entre Inbox e operação financeira.

## 7. Mensageria assíncrona

### Outbox

A Outbox registra eventos de integração associados ao processamento
financeiro. Um worker busca eventos pendentes e tenta publicá-los na
fila SQS configurada. A publicação assíncrona separa a confirmação no
banco da entrega externa.

Fila de saída configurada por `SQS_WAGER_TRANSACTIONS_QUEUE_URL`.

### Inbox

O consumidor consulta a fila de solicitações, interpreta a mensagem,
verifica se já existe um registro de Inbox para o consumidor e o ID da
mensagem, chama o caso de uso de processamento e, em seguida, grava o
registro e exclui a mensagem da fila.

O SQS utiliza entrega _at-least-once_, o que significa que uma mensagem
pode ser entregue mais de uma vez. A deduplicação por mensagem e a
idempotência de negócio são importantes para evitar efeitos duplicados.

### Tratamento de falhas: pontos pendentes

Os seguintes requisitos precisam ser implementados ou verificados antes
de considerar o processamento robusto para produção:

- Gravar Inbox e alterações financeiras na mesma transação SQL.
- Classificar erros de negócio, transitórios e permanentes.
- Configurar tentativas limitadas, backoff e encaminhamento para
  dead-letter queue (DLQ).
- Garantir que a mensagem só seja excluída após o commit exigido.
- Tratar encerramento do processo com mensagens em andamento.
- Registrar métricas e logs para falhas, tentativas, encaminhamentos à
  DLQ e divergências de reconciliação.

Esses itens são limitações conhecidas, não funcionalidades que devem ser
presumidas como concluídas.

## 8. Paginação do ledger

O endpoint do ledger recebe `limit` e um cursor opaco que representa a
data/hora e o ID do último lançamento. O repositório usa esses campos
para continuar a consulta de maneira estável e o serviço busca um
registro adicional para determinar se há próxima página.

A ordenação utilizada na consulta precisa corresponder à comparação do
cursor para evitar omissões ou repetições entre páginas.

## 9. Observabilidade e health checks

- `GET /health/live`: indica se o processo está ativo.
- `GET /health/ready`: verifica a disponibilidade do PostgreSQL e do
  SQS.

A especificação permite que os endpoints de health permaneçam sem
autenticação.

## 10. Decisão sobre autenticação

A autenticação não foi implementada para priorizar os requisitos
financeiros e de processamento distribuído do desafio. Essa decisão deve
ser considerada explicitamente na avaliação.

Para produção, recomenda-se integrar um provedor de identidade externo
compatível com OIDC e validar a identidade e a autorização do provedor
por meio de um guard ou de uma porta de identidade. Não é necessário
criar um sistema próprio de senhas para este desafio. Mesmo mensagens
internas recebidas pelo SQS devem passar pela validação de domínio.

## 11. Infraestrutura local

O Docker Compose executa PostgreSQL 16 e LocalStack. A aplicação utiliza
`DATABASE_URL` para a conexão com o banco e as variáveis de ambiente
abaixo para configurar o SQS:

- `AWS_REGION`
- `AWS_ENDPOINT_URL`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `SQS_WAGER_TRANSACTIONS_QUEUE_URL`
- `SQS_WAGER_TRANSACTION_REQUESTS_QUEUE_URL`

As credenciais de exemplo destinam-se apenas ao desenvolvimento local.
Credenciais reais não devem ser versionadas.

## 12. Limitações e próximos passos

Principais pontos conhecidos a aprimorar:

1.  Tornar atômica a gravação da Inbox com a operação financeira.
2.  Validar retry, backoff, DLQ e encerramento seguro do consumidor.
3.  Cobrir com testes automatizados débitos concorrentes, mensagens
    duplicadas, conflitos de idempotência e casos extremos de reversão.
4.  Adicionar logs, métricas e alertas para falhas de mensageria e
    divergências.
5.  Integrar autenticação externa se exigida para implantação em
    produção.

A arquitetura documenta tanto o comportamento implementado quanto as
lacunas conhecidas, sem apresentar os pontos pendentes como concluídos.
