#!/bin/bash
set -euo pipefail

echo "Configurando filas SQS..."

awslocal sqs create-queue \
  --queue-name wager-transactions-dlq.fifo \
  --attributes '{"FifoQueue":"true"}' \
  >/dev/null

DLQ_URL=$(awslocal sqs get-queue-url \
  --queue-name wager-transactions-dlq.fifo \
  --query 'QueueUrl' \
  --output text)

DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

python3 - "$DLQ_ARN" <<'PY'
import json
import sys

dlq_arn = sys.argv[1]

attributes = {
    "FifoQueue": "true",
    "ContentBasedDeduplication": "false",
    "RedrivePolicy": json.dumps({
        "deadLetterTargetArn": dlq_arn,
        "maxReceiveCount": "3"
    })
}

with open("/tmp/wager-queue-attributes.json", "w") as file:
    json.dump(attributes, file)
PY

awslocal sqs create-queue \
  --queue-name wager-transactions.fifo \
  --attributes file:///tmp/wager-queue-attributes.json \
  >/dev/null

echo "Filas configuradas com sucesso:"
awslocal sqs list-queues

python3 - "$DLQ_ARN" <<'PY'
import json
import sys

dlq_arn = sys.argv[1]

attributes = {
    "FifoQueue": "true",
    "ContentBasedDeduplication": "false",
    "RedrivePolicy": json.dumps({
        "deadLetterTargetArn": dlq_arn,
        "maxReceiveCount": "3"
    })
}

with open("/tmp/wager-requests-queue-attributes.json", "w") as file:
    json.dump(attributes, file)
PY

awslocal sqs create-queue \
  --queue-name wager-transaction-requests.fifo \
  --attributes file:///tmp/wager-requests-queue-attributes.json \
  >/dev/null