// AWS resources. Deployed stacks set these in template.yaml; locally they come from .env.local.
export const aws = {
  region: process.env.AWS_REGION ?? 'us-east-1',
  tableName: process.env.TABLE_NAME ?? 'valuehq-local',
  // Only set for DynamoDB Local (http://localhost:8000).
  dynamoEndpoint: process.env.DYNAMODB_ENDPOINT || undefined,
  stateMachineArn: process.env.STATE_MACHINE_ARN || undefined,
  // Profile used by the command-line scripts for dev and prod.
  cliProfile: process.env.AWS_PROFILE ?? 'personal',
} as const;
