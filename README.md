# Distributed Wagering Processor

Serviço backend para processamento de transações de apostas de múltiplos
provedores de jogos, desenvolvido como desafio técnico.

## Principais características

- API HTTP para abertura e consulta de carteiras e processamento de
  transações.
- Persistência financeira em PostgreSQL com NestJS, TypeScript e
  MikroORM.
- Ledger de créditos e débitos com saldo anterior e posterior.
- Idempotência para reduzir o risco de aplicar a mesma operação
  financeira mais de uma vez.
- Processamento assíncrono com SQS, LocalStack, Inbox e Outbox.
- Health checks para monitorar a aplicação e suas dependências.
- Endpoint de reconciliação para comparar o saldo da carteira com o
  saldo calculado pelo ledger.

Para detalhes sobre os componentes, o fluxo financeiro e as decisões
técnicas, consulte [ARCHITECTURE.md](./ARCHITECTURE.md).

## Tecnologias

- NestJS
- TypeScript
- Bun
- PostgreSQL 16
- MikroORM
- Amazon SQS API / LocalStack
- Docker Compose

## Pré-requisitos

- Bun instalado
- Docker Engine ou Docker Desktop com Docker Compose
- Git

## Como executar localmente

### 1. Instalar dependências

```bash
bun install
```

### 2. Configurar variáveis de ambiente

Altere o arquivo `.env.example` na raiz do projeto, retirando o `.example`:

```dotenv
DATABASE_URL=postgresql://wagering:wagering@localhost:5432/wagering

AWS_REGION=us-east-1
AWS_ENDPOINT_URL=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

SQS_WAGER_TRANSACTIONS_QUEUE_URL=http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/wager-transactions.fifo
SQS_WAGER_TRANSACTION_REQUESTS_QUEUE_URL=http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/wager-transaction-requests.fifo
```

Confirme se os valores correspondem ao `compose.yaml` e à configuração
da aplicação.

### 3. Iniciar a infraestrutura

```bash
docker compose up -d
```

O comando inicia os serviços configurados no `compose.yaml`, incluindo
PostgreSQL e LocalStack. As filas SQS utilizadas pela aplicação precisam
existir no LocalStack.

### 4. Iniciar a aplicação

```bash
bun run start:dev
```

### 5. Compilar e executar testes

```bash
bun run build
bun run test
```

Use os nomes de scripts definidos no `package.json` caso sejam
diferentes.

## Endpoints disponíveis

---

Método Rota Descrição

---

`POST` `/wallets` Abre uma carteira

`GET` `/wallets/:walletId` Consulta os dados da
carteira

`GET` `/wallets/:walletId/ledger?cursor=...&limit=50` Consulta o ledger com
paginação

`POST` `/wallets/:walletId/reconciliation` Compara o saldo
armazenado com o
calculado pelo ledger

`POST` `/wagering/transactions` Processa uma transação
de aposta

`GET` `/wagering/transactions/:transactionId` Consulta uma transação
pelo ID interno

`GET` `/providers/:providerId/wagering/transactions/:externalTransactionId` Consulta uma transação
por provedor e ID
externo

`GET` `/health/live` Verifica se o processo
está ativo

`GET` `/health/ready` Verifica a
disponibilidade de
PostgreSQL e SQS
-----------------------------------------------------------------------------------------------------------------------

### Observações

- A abertura de carteira com saldo inicial positivo cria uma transação
  interna `OPENING` e um lançamento `CREDIT` no ledger na mesma
  transação SQL.
- A reconciliação retorna os saldos armazenado e calculado, a
  diferença, o indicador de consistência e a quantidade de lançamentos
  considerados.
- A autenticação não foi implementada nesta versão; a decisão e a
  abordagem recomendada para produção estão descritas em
  `ARCHITECTURE.md`.

## Documentação

- [ARCHITECTURE.md](./ARCHITECTURE.md) --- componentes, fluxo de
  processamento, consistência financeira, idempotência, mensageria e
  limitações técnicas.

## Status do projeto

Implementação de desafio técnico. Consulte `ARCHITECTURE.md` para
conhecer as limitações e os pontos que ainda precisam ser concluídos ou
verificados antes de um uso em produção.
