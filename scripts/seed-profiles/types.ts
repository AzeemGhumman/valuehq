// Shape of a seed profile: a complete sample setup for one workspace.
import type { Account, Company, Offering, Source, ValueRow } from '../../src/server/types';

export type SourceSeed = Pick<Source, 'kind' | 'label'> & Partial<Pick<Source, 'url' | 'mode'>>;

export interface SeedProfile {
  key: string;
  title: string;
  description: string;
  company: Omit<Company, 'createdBy' | 'updatedBy' | 'updatedAt'>;
  companySources: SourceSeed[];
  offerings: (Pick<Offering, 'name' | 'summary' | 'whoBuys'> & { valueRows: Omit<ValueRow, 'id'>[]; sources: SourceSeed[] })[];
  accounts: (Pick<Account, 'name' | 'domain' | 'unit' | 'industry' | 'ownership' | 'ticker' | 'priority' | 'stage' | 'notes'> & { sources: SourceSeed[] })[];
}
