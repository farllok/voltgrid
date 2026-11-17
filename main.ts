// make.fun entry point: stage the static game and its screenshots into MAKEFUN_OUTPUT_DIR,
// then write the deterministic dossier.json that buildDossier derives from those files.
//
//   node --experimental-strip-types main.ts
//   MAKEFUN_OUTPUT_DIR=out node --experimental-strip-types main.ts

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, DossierError } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(process.cwd(), process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

function stage(name: string, required: boolean): void {
  const source = join(here, name);
  if (!existsSync(source)) {
    if (required) throw new Error(`missing required directory: ${source}`);
    console.warn(`[makefun] no ${name}/ directory, skipping`);
    return;
  }
  cpSync(source, join(outputDir, name), { recursive: true, force: true });
}

try {
  // The grader mounts /output as a writable directory on a read-only system, so the
  // directory itself must never be removed: only the two staged trees inside it.
  mkdirSync(outputDir, { recursive: true });
  rmSync(join(outputDir, 'game'), { recursive: true, force: true });
  rmSync(join(outputDir, 'screenshots'), { recursive: true, force: true });
  rmSync(join(outputDir, 'dossier.json'), { force: true });
  stage('game', true);
  stage('screenshots', false);

  const dossier = buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
  const digest = createHash('sha256').update(dossier).digest('hex');
  console.log(`[makefun] output: ${outputDir}`);
  console.log(`[makefun] dossier.json: ${dossier.length} bytes`);
  console.log(`[makefun] sha256: ${digest}`);
} catch (error) {
  if (error instanceof DossierError) {
    console.error(`[makefun] dossier refused (${error.limit ?? 'input'}): ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
