import { readFileSync, writeFileSync } from 'node:fs';

/** A failed compilation may leave source behind; never replace reviewed bytes. */
export function writeReviewedSource(file, source) {
  try {
    writeFileSync(file, source, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!readFileSync(file).equals(Buffer.from(source, 'utf8'))) {
      throw new Error('Existing staged source differs from the reviewed submission; refusing replacement.');
    }
  }
}
