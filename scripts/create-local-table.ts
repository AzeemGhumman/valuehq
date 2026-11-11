// Creates the table in DynamoDB Local (same shape as template.yaml). Used by `npm run db:local`.
import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';

const endpoint = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const TableName = 'valuehq-local';
const client = new DynamoDBClient({ region: 'us-east-1', endpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });

async function waitForDb() {
  for (let i = 0; i < 30; i++) {
    try { await client.send(new DescribeTableCommand({ TableName: '__ping__' })); return; }
    catch (e) {
      if (e instanceof Error && e.name === 'ResourceNotFoundException') return;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`DynamoDB Local didn't respond at ${endpoint}. Is Docker running?`);
}

async function main() {
await waitForDb();
try {
  await client.send(new DescribeTableCommand({ TableName }));
  console.log(`Table ${TableName} already exists.`);
} catch {
  await client.send(new CreateTableCommand({
    TableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' }, { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' }, { AttributeName: 'GSI1SK', AttributeType: 'S' },
    ],
    KeySchema: [{ AttributeName: 'PK', KeyType: 'HASH' }, { AttributeName: 'SK', KeyType: 'RANGE' }],
    GlobalSecondaryIndexes: [{
      IndexName: 'GSI1',
      KeySchema: [{ AttributeName: 'GSI1PK', KeyType: 'HASH' }, { AttributeName: 'GSI1SK', KeyType: 'RANGE' }],
      Projection: { ProjectionType: 'ALL' },
    }],
  }));
  console.log(`Created table ${TableName} at ${endpoint}.`);
}
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
