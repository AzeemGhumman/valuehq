import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { aws } from '@config/aws';

// DynamoDB Local accepts any credentials.
const local = aws.dynamoEndpoint ? { endpoint: aws.dynamoEndpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } } : {};

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: aws.region, ...local }), {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false },
});

export const TABLE = aws.tableName;
