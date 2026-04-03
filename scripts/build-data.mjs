import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataset } from '../packages/web/src/lib/build-data-core.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(repoRoot, 'packages', 'web');
const defaultWorkspaceRoot = path.resolve(repoRoot, '..');
const workspaceRoot = process.env.TRUNK_GL_ROOT
  ? path.resolve(process.env.TRUNK_GL_ROOT)
  : defaultWorkspaceRoot;
const outputPath = path.join(appRoot, 'src', 'generated', 'table-index.json');

if (!fs.existsSync(workspaceRoot)) {
  throw new Error(`Workspace root not found: ${workspaceRoot}`);
}

const dataset = buildDataset({ workspaceRoot, appRoot });

fs.writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
console.log(`Generated ${dataset.tables.length} tables -> ${outputPath}`);
