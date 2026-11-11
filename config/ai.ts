// AI provider settings. Not used yet: reserved for extraction, Briefs and Ask.
// Keep keys out of code: deployed stacks should read them from SSM Parameter Store.
export const ai = {
  provider: process.env.AI_PROVIDER ?? 'anthropic',
  model: process.env.AI_MODEL ?? '',
  apiKeyParameter: process.env.AI_API_KEY_PARAM ?? '/valuehq/ai-api-key',
} as const;
