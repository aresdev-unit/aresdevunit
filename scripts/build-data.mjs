import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDataset,
  buildCatalog,
  buildRelationIndex,
  buildPerTableJson,
} from '../packages/web/src/lib/build-data-core.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(repoRoot, 'packages', 'web');
const defaultWorkspaceRoot = path.resolve(repoRoot, '..');
const workspaceRoot = process.env.TRUNK_GL_ROOT
  ? path.resolve(process.env.TRUNK_GL_ROOT)
  : defaultWorkspaceRoot;
const generatedDir = path.join(appRoot, 'src', 'generated');
const cacheDir = path.join(generatedDir, '.cache');

if (!fs.existsSync(workspaceRoot)) {
  throw new Error(`Workspace root not found: ${workspaceRoot}`);
}

// Parse optional --folders arg for incremental builds
const foldersArgIndex = process.argv.indexOf('--folders');
const folders =
  foldersArgIndex !== -1 && process.argv[foldersArgIndex + 1]
    ? process.argv[foldersArgIndex + 1].split(',')
    : undefined;

// Build full dataset
const dataset = buildDataset({ workspaceRoot, appRoot, folders, cacheDir });

// Ensure output directories exist
fs.mkdirSync(path.join(generatedDir, 'tables'), { recursive: true });

const isPartialUpdate = Boolean(folders);

if (!isPartialUpdate) {
  // 1. Write backward-compat table-index.json
  const tableIndexPath = path.join(generatedDir, 'table-index.json');
  fs.writeFileSync(tableIndexPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

  // 2. Write catalog.json
  const catalog = buildCatalog(dataset);
  const catalogPath = path.join(generatedDir, 'catalog.json');
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  // 3. Write relation-index.json
  const relationIndex = buildRelationIndex(dataset);
  const relationIndexPath = path.join(generatedDir, 'relation-index.json');
  fs.writeFileSync(relationIndexPath, `${JSON.stringify(relationIndex, null, 2)}\n`, 'utf8');

  console.log(`[build-data] Generated ${dataset.tableCount} tables, ${dataset.relationCount} relations`);
  console.log(`  table-index.json    -> ${tableIndexPath}`);
  console.log(`  catalog.json        -> ${catalogPath}`);
  console.log(`  relation-index.json -> ${relationIndexPath}`);
} else {
  console.log(`[build-data] Partial update for folders: ${folders.join(', ')}`);
  console.log(`  Skipping table-index.json, catalog.json, relation-index.json (partial build)`);
}

// 4. Write per-table JSON files (always written, both full and partial builds)
let tableFilesWritten = 0;
for (const table of dataset.tables) {
  const tableJson = buildPerTableJson(table);
  const tablePath = path.join(generatedDir, 'tables', `${table.tableId}.json`);
  fs.writeFileSync(tablePath, `${JSON.stringify(tableJson, null, 2)}\n`, 'utf8');
  tableFilesWritten += 1;
}

console.log(`  tables/*.json       -> ${tableFilesWritten} files written`);
