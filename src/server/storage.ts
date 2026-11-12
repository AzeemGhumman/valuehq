// Read-only access to the workers' data: the S3 data bucket in AWS, or a local folder (DATA_DIR) on your Mac.
// Paths follow workers/valuehq_workers/layout.py.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { GetObjectCommand, ListObjectsV2Command, NoSuchKey, S3Client } from '@aws-sdk/client-s3';
import { aws } from '@config/aws';

const s3 = new S3Client({ region: aws.region });
const localRoot = aws.dataDir ? path.resolve(process.cwd(), aws.dataDir) : undefined;

export const storageAvailable = () => !!(aws.dataBucket || localRoot);
export const storageLabel = () => (aws.dataBucket ? `s3://${aws.dataBucket}` : localRoot ?? 'not configured');

export async function getBytes(key: string): Promise<Buffer | null> {
  if (localRoot) {
    try {
      return await readFile(path.join(localRoot, key));
    } catch {
      return null;
    }
  }
  if (!aws.dataBucket) return null;
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: aws.dataBucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  } catch (e) {
    if (e instanceof NoSuchKey || (e as { name?: string }).name === 'NoSuchKey') return null;
    throw e;
  }
}

export async function getText(key: string): Promise<string | null> {
  const bytes = await getBytes(key);
  if (!bytes) return null;
  return (key.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8');
}

export async function getJson<T>(key: string): Promise<T | null> {
  const text = await getText(key);
  return text ? (JSON.parse(text) as T) : null;
}

export async function getJsonl<T>(key: string): Promise<T[]> {
  const text = await getText(key);
  return text ? text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as T) : [];
}

// Names directly under a prefix ending in '/', like `ls`: folders only.
export async function folders(prefix: string): Promise<string[]> {
  if (localRoot) {
    try {
      return (await readdir(path.join(localRoot, prefix), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      return [];
    }
  }
  if (!aws.dataBucket) return [];
  const out: string[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: aws.dataBucket, Prefix: prefix, Delimiter: '/', ContinuationToken: token }));
    for (const p of res.CommonPrefixes ?? []) if (p.Prefix) out.push(p.Prefix.slice(prefix.length).replace(/\/$/, ''));
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}
