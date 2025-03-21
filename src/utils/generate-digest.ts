import { Buffer } from 'buffer/index.js'; // this is the proper way to import the Buffer class from 'buffer'. It's needed to run Buffer in the browser.
import { createHash } from 'crypto';

export function generateFileDigest(buffer: Buffer): string {
  const algo = 'sha256';
  const digest = Buffer.from(hash(buffer, algo));
  const prefixeDigest = `${algo}-${digest}`;
  return prefixeDigest;
}

function hash(data: Buffer, algo: string): string {
  return createHash(algo).update(data).digest('hex');
}
