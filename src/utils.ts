import { Signale } from 'signale';
import sizeOf from 'image-size';

const logger = new Signale({
  scope: 'utils',
});

export const hashImage = async (buffer: ArrayBuffer) => {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(buffer));
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};
