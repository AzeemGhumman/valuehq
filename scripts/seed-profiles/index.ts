// Add a profile by creating a file like comena.ts and listing it here.
import { comena } from './comena';
import { halyard } from './halyard';
import type { SeedProfile } from './types';

export const PROFILES: Record<string, SeedProfile> = { comena, halyard };
