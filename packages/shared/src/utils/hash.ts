import * as crypto from 'crypto';

export function computeFileHash(content: string): string {
  return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
}
