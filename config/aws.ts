// AWS resources. Deployed stacks set these in template.yaml; locally they come from .env.local.
// Which account and profile everything uses: config/account.ts.
export const aws = {
  region: process.env.AWS_REGION ?? 'us-east-1',
  tableName: process.env.TABLE_NAME ?? 'valuehq-local',
  // Only set for DynamoDB Local (http://localhost:8000).
  dynamoEndpoint: process.env.DYNAMODB_ENDPOINT || undefined,
  stateMachineArn: process.env.STATE_MACHINE_ARN || undefined,
  // Where the workers store crawls: the S3 data bucket in AWS, or a local folder (DATA_DIR=.data) on your Mac.
  dataBucket: process.env.DATA_BUCKET || undefined,
  dataDir: process.env.DATA_DIR || undefined,
} as const;
