import fs from 'node:fs';
import path from 'node:path';
import * as XLSXModule from 'xlsx';

const XLSX = XLSXModule.default ?? XLSXModule;

const TABLE_DIR_PATTERN = /DataT(?:able|eble)_GL$/;
const SEGMENT_TABLE_PATTERN = /\.[^.]+\.seg$/i;
const COPY_NAME_PATTERN = /(복사본|사본|copy)/i;
const OVERRIDE_PATH = ['src', 'config', 'relation-overrides.json'];
const CONFIDENCE_SCORE = { inferred: 1, explicit: 2, override: 3 };
const DEFAULT_DESCRIPTION = '설명 없음';
const DIGIT_SUFFIX_PATTERN = /(?:_|)(\d+)$/;
const SUPPLEMENT_SCAN_WIDTH = 8;
const RELATION_PREFIXES = new Set([
  'req',
  'need',
  'cost',
  'reward',
  'enter',
  'sweep',
  'open',
  'unlock',
  'price',
  'buy',
  'sell',
  'use',
  'time',
  'pk',
  'upgrade',
  'material',
  'equip',
  'piece',
  'current',
  'royalpass',
  'season',
]);
const SPECIAL_REFERENCE_COLUMNS = new Set(['item_group']);
const COLUMN_REFERENCE_ALIASES = {
  option_type: [{ targetTable: 'OptionType', targetColumn: 'optionType' }],
};
const COLUMN_NAME_ALIASES = {
  option_type: { targetTable: 'OptionType', targetColumn: 'optionType' },
  positive_option_type: { targetTable: 'OptionType', targetColumn: 'optionType' },
  negative_option_type: { targetTable: 'OptionType', targetColumn: 'optionType' },
  contents_id: { targetTable: 'contents_settings', targetColumn: 'contents_id', skipIfKey: true },
};

function normalizeValue(value) {
  return String(value ?? '').replace(/\r/g, '\n').trim();
}

function normalizeFieldName(value) {
  return normalizeValue(value).replace(/^[#!]+/, '').split('|')[0].trim();
}

function normalizeFieldToken(value) {
  return normalizeFieldName(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isContinuationText(value) {
  return /^(?:\u3134|\u2517|\u2514)/.test(normalizeValue(value));
}

function appendContinuationText(base, continuation) {
  const left = normalizeValue(base);
  const right = normalizeValue(continuation);
  if (!right) {
    return left;
  }
  return left ? `${left}\n${right}` : right;
}

function normalizeReferenceToken(value) {
  return normalizeFieldToken(value).replace(/[^a-z0-9]/g, '');
}

function normalizeTableToken(value) {
  return normalizeValue(value).replace(/\.csv$/i, '').trim();
}

function getEquivalentReferenceNames(columnName) {
  const names = new Set();
  const normalized = normalizeFieldToken(columnName);

  if (normalized.endsWith('_index')) {
    names.add(normalized.replace(/_index$/, '_id'));
  }

  if (normalized.endsWith('_id')) {
    names.add(normalized.replace(/_id$/, '_index'));
  }

  return [...names];
}

function splitCsvLine(line) {
  return line.split(',').map((part) => part.trim());
}

function fallbackType(segments) {
  const types = segments.filter((segment, index) => index > 0 && segment !== 'key');
  return types[0] || 'uint';
}

function getCanonicalTableId(tableId) {
  if (!tableId) {
    return '';
  }
  return tableId.replace(SEGMENT_TABLE_PATTERN, '');
}

function isIgnoredTableFile(fileName) {
  return COPY_NAME_PATTERN.test(fileName);
}

function isBlankRow(row) {
  return row.every((cell) => !normalizeValue(cell));
}

function trimTrailingBlanks(values) {
  const cells = [...values].map(normalizeValue);
  while (cells.length > 0 && !cells[cells.length - 1]) {
    cells.pop();
  }
  return cells;
}

function uniqueInOrder(values, getKey = (value) => value) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const key = getKey(value);
    if (!value || !key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }

  return result;
}

function flattenRows(rows, from, to) {
  return rows
    .slice(Math.max(0, from), Math.max(0, to))
    .flatMap((row) => row.map(normalizeValue))
    .filter(Boolean)
    .join('\n');
}

export function parseHeaderToken(token) {
  const rawHeader = normalizeValue(token);
  const segments = rawHeader.split('|').map((part) => part.trim()).filter(Boolean);
  const rawName = segments[0] ?? '';

  return {
    rawHeader,
    rawName,
    name: normalizeFieldName(rawName),
    dataType: fallbackType(segments),
    isKey: segments.includes('key'),
    isComment: rawName.startsWith('#') || rawName.startsWith('!'),
  };
}

function parseCsvSections(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\n/).map((line) => line.replace(/\r$/, ''));
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('##')) {
      const sectionName = normalizeTableToken(trimmed.slice(2).split(',')[0]);
      if (currentSection && currentSection.headers.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        tableId: sectionName,
        headers: [],
      };
      continue;
    }

    if (!currentSection) {
      continue;
    }

    if (currentSection.headers.length === 0) {
      currentSection.headers = splitCsvLine(trimmed).filter(Boolean).map(parseHeaderToken);
    }
  }

  if (currentSection && currentSection.headers.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}

function findDataTableDirs(workspaceRoot) {
  return fs
    .readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && TABLE_DIR_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'ko'));
}

function findManualFiles(dirPath) {
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.toLowerCase().endsWith('.xlsx') && !name.startsWith('~$'))
    .sort((a, b) => a.localeCompare(b, 'ko'));
}

function loadWorkbookSheets(workbookPath) {
  const workbook = XLSX.readFile(workbookPath, { cellText: true, dense: true });
  return workbook.SheetNames.map((sheetName) => ({
    sheetName,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    }),
  }));
}

function loadWorkbookSheetsWithCache(workbookPath, cacheDir) {
  if (!cacheDir) return loadWorkbookSheets(workbookPath);

  const cacheFile = path.join(cacheDir, '.manual-cache.json');
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {
    // no cache yet
  }

  const absPath = path.resolve(workbookPath);
  const stat = fs.statSync(absPath);
  const mtime = stat.mtimeMs;
  const size = stat.size;

  if (cache[absPath] && cache[absPath].mtime === mtime && cache[absPath].size === size) {
    return cache[absPath].sheets;
  }

  const sheets = loadWorkbookSheets(workbookPath);
  cache[absPath] = { mtime, size, sheets };

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache), 'utf8');

  return sheets;
}

function findHeaderBlocks(rows) {
  const blocks = [];

  for (let index = 0; index < Math.min(rows.length, 200); index += 1) {
    const normalized = rows[index].map((cell) => normalizeValue(cell).toLowerCase());
    const fieldNameIndex = normalized.indexOf('fieldname');
    const dataTypeIndex = normalized.indexOf('datatype');
    const descriptionIndex = normalized.indexOf('description');

    if (fieldNameIndex === -1 || dataTypeIndex === -1 || descriptionIndex === -1) {
      continue;
    }

    let endIndex = index + 1;
    while (endIndex < rows.length) {
      const row = rows[endIndex].map(normalizeValue);
      const fieldValue = normalizeFieldName(row[fieldNameIndex] ?? '');
      const rowHasTableHeader = normalizeValue(rows[endIndex][0] ?? '').startsWith('##');

      if (rowHasTableHeader) {
        break;
      }

      if (!fieldValue && isBlankRow(rows[endIndex])) {
        break;
      }

      endIndex += 1;
    }

    blocks.push({
      headerRowIndex: index,
      endRowIndex: endIndex,
      fieldNameIndex,
      dataTypeIndex,
      descriptionIndex,
      leadText: flattenRows(rows, index - 6, index),
    });
  }

  return blocks;
}

function isSupplementTitle(value) {
  return /^[#!]?[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function isSupplementStartCell(row, columnIndex) {
  const title = normalizeValue(row?.[columnIndex]);
  if (!title || !isSupplementTitle(title)) {
    return false;
  }

  const previous = normalizeValue(row?.[columnIndex - 1]);
  return columnIndex === 0 || previous === '' || previous === '▶' || previous === '->';
}

function findNextSupplementStartColumn(row, columnIndex) {
  if (!row) {
    return -1;
  }

  for (let index = columnIndex + 1; index < row.length; index += 1) {
    if (isSupplementStartCell(row, index)) {
      return index;
    }
  }

  return -1;
}

function buildSyntheticHeaders(width) {
  return [...Array(width)].map((_, index) => {
    if (index === 0) {
      return '번호';
    }
    if (index === 1) {
      return '설명';
    }
    return `추가 ${index - 1}`;
  });
}

function extractSupplementTables(rows, mainBlock) {
  const supplements = [];
  const seen = new Set();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < rows[rowIndex].length; columnIndex += 1) {
      if (
        mainBlock &&
        rowIndex >= mainBlock.headerRowIndex &&
        rowIndex < mainBlock.endRowIndex &&
        columnIndex <= mainBlock.descriptionIndex + 1
      ) {
        continue;
      }

      const title = normalizeValue(rows[rowIndex][columnIndex]);
      if (!title || !isSupplementStartCell(rows[rowIndex], columnIndex)) {
        continue;
      }

      const shiftedColumnIndex =
        columnIndex > 0 &&
        normalizeValue(rows[rowIndex + 1]?.[columnIndex - 1]) &&
        !normalizeValue(rows[rowIndex][columnIndex - 1])
          ? columnIndex - 1
          : columnIndex;

      const nextStartColumn = findNextSupplementStartColumn(rows[rowIndex], columnIndex);
      const maxColumnExclusive =
        nextStartColumn !== -1 ? nextStartColumn : shiftedColumnIndex + SUPPLEMENT_SCAN_WIDTH;
      const headerRowSlice = trimTrailingBlanks(
        (rows[rowIndex] ?? []).slice(shiftedColumnIndex, maxColumnExclusive)
      );

      const nextRow = trimTrailingBlanks(
        (rows[rowIndex + 1] ?? []).slice(shiftedColumnIndex, maxColumnExclusive)
      );
      const inlineHeaderMode =
        mainBlock &&
        rowIndex === mainBlock.headerRowIndex &&
        headerRowSlice.length >= 2 &&
        title.startsWith('#');
      if (!inlineHeaderMode && nextRow.length === 0) {
        continue;
      }

      const looksLikeHeaderRow =
        !inlineHeaderMode &&
        nextRow.length >= 2 &&
        !/^[0-9-]+$/.test(nextRow[0] ?? '') &&
        nextRow[0] !== '' &&
        !/[가-힣]/.test(nextRow[0]);
      const dataStartIndex = inlineHeaderMode ? rowIndex + 1 : looksLikeHeaderRow ? rowIndex + 2 : rowIndex + 1;
      const explicitHeaders = inlineHeaderMode ? headerRowSlice : looksLikeHeaderRow ? nextRow : [];
      const tableRows = [];
      let maxWidth = explicitHeaders.length;
      let cursor = dataStartIndex;
      let blankRowStreak = 0;

      while (cursor < rows.length) {
        const row = rows[cursor] ?? [];
        const candidateTitle = normalizeValue(row[columnIndex]);
        const candidateRow = trimTrailingBlanks(row.slice(shiftedColumnIndex, maxColumnExclusive));

        if (candidateRow.length === 0) {
          blankRowStreak += 1;
          if (blankRowStreak >= 3) {
            break;
          }
          cursor += 1;
          continue;
        }
        blankRowStreak = 0;

        if (
          cursor > dataStartIndex &&
          candidateTitle &&
          candidateTitle !== title &&
          isSupplementTitle(candidateTitle) &&
          candidateRow.filter(Boolean).length <= 2
        ) {
          break;
        }

        maxWidth = Math.max(maxWidth, candidateRow.length);
        tableRows.push(candidateRow);
        cursor += 1;
      }

      if (tableRows.length === 0 || maxWidth === 0) {
        continue;
      }

      const id = normalizeFieldToken(title);
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);

      const headers =
        explicitHeaders.length > 0
          ? [...Array(maxWidth)].map((_, index) => explicitHeaders[index] || `열 ${index + 1}`)
          : buildSyntheticHeaders(maxWidth);

      supplements.push({
        id,
        title,
        headers,
        rows: tableRows.map((row) => [...Array(maxWidth)].map((_, index) => row[index] ?? '')),
      });
    }
  }

  return supplements;
}

function isRemarkTitle(value) {
  return /^▶\s*/.test(value);
}

function isRemarkListItem(value) {
  return /^(?:※|\u3134|예[:：]|[0-9]+\))/.test(value);
}

function normalizeRemarkRow(row) {
  return trimTrailingBlanks(row.map(normalizeValue)).filter((cell) => cell !== '');
}

function mergeRemarkContinuationRows(rows) {
  const merged = [];

  for (const row of rows) {
    if (row.length === 0) {
      continue;
    }

    if (isContinuationText(row[0]) && merged.length > 0) {
      const previousRow = merged[merged.length - 1];
      const previousCellIndex = Math.max(previousRow.length - 1, 0);
      previousRow[previousCellIndex] = appendContinuationText(previousRow[previousCellIndex], row.join(' '));
      continue;
    }

    merged.push([...row]);
  }

  return merged;
}

function extractManualRemarks(rows, mainBlock) {
  if (!mainBlock) {
    return [];
  }

  const remarkColumns = mainBlock.descriptionIndex + 2;
  const sourceRows = rows.slice(mainBlock.endRowIndex);
  const blocks = [];
  let currentBlock = null;
  let untitledIndex = 1;

  const pushCurrent = () => {
    if (!currentBlock || currentBlock.rows.length === 0) {
      currentBlock = null;
      return;
    }

    const normalizedRows = mergeRemarkContinuationRows(
      currentBlock.rows.map(normalizeRemarkRow).filter((row) => row.length > 0)
    );
    if (normalizedRows.length === 0) {
      currentBlock = null;
      return;
    }

    const fallbackTitle = currentBlock.title || `비고 ${untitledIndex++}`;
    const firstRowKey = normalizedRows[0]?.join('_').slice(0, 80) ?? '';
    blocks.push({
      id: normalizeFieldToken(`${fallbackTitle}_${firstRowKey}`) || `remark-${blocks.length + 1}`,
      title: fallbackTitle,
      rows: normalizedRows,
    });
    currentBlock = null;
  };

  for (const rawRow of sourceRows) {
    const row = (rawRow ?? []).slice(0, remarkColumns).map(normalizeValue);
    const trimmedRow = trimTrailingBlanks(row);
    const firstCell = trimmedRow.find((cell) => cell);

    if (!firstCell) {
      pushCurrent();
      continue;
    }

    if (firstCell.startsWith('#')) {
      pushCurrent();
      continue;
    }

    if (isRemarkTitle(firstCell)) {
      pushCurrent();
      currentBlock = {
        title: firstCell.replace(/^▶\s*/, '').trim() || `비고 ${untitledIndex}`,
        rows: [],
      };
      continue;
    }

    const meaningfulRow = trimmedRow.filter((cell) => cell !== '');
    if (meaningfulRow.length === 0) {
      continue;
    }

    if (!currentBlock) {
      currentBlock = {
        title: isRemarkListItem(firstCell) ? '비고' : `비고 ${untitledIndex}`,
        rows: [],
      };
    }

    if (isContinuationText(firstCell) && currentBlock.rows.length > 0) {
      const previousRow = currentBlock.rows[currentBlock.rows.length - 1];
      const previousCellIndex = Math.max(previousRow.length - 1, 0);
      previousRow[previousCellIndex] = appendContinuationText(previousRow[previousCellIndex], meaningfulRow.join(' '));
      continue;
    }

    currentBlock.rows.push(meaningfulRow);
  }

  pushCurrent();
  return blocks;
}

function findManualDocEndRow(rows, mainBlock, csvFieldMap) {
  let endIndex = mainBlock.headerRowIndex + 1;

  while (endIndex < rows.length) {
    const row = rows[endIndex].map(normalizeValue);
    const fieldCell = normalizeValue(row[mainBlock.fieldNameIndex] ?? '');
    const fieldToken = normalizeFieldToken(fieldCell);
    const hasDataType = normalizeValue(row[mainBlock.dataTypeIndex] ?? '') !== '';
    const hasDescription = normalizeValue(row[mainBlock.descriptionIndex] ?? '') !== '';
    const rowHasTableHeader = fieldCell.startsWith('##');

    if (rowHasTableHeader) {
      break;
    }

    const descriptionCell = normalizeValue(row[mainBlock.descriptionIndex] ?? '');
    const noteCell = normalizeValue(row[mainBlock.descriptionIndex + 1] ?? '');

    if (!fieldCell && isBlankRow(rows[endIndex])) {
      break;
    }

    if (!fieldCell && (isContinuationText(descriptionCell) || isContinuationText(noteCell))) {
      endIndex += 1;
      continue;
    }

    if (fieldCell && (csvFieldMap.has(fieldToken) || hasDataType || hasDescription)) {
      endIndex += 1;
      continue;
    }

    break;
  }

  return endIndex;
}

function scoreBlockForTable(block, tableId) {
  const candidates = [
    tableId,
    getCanonicalTableId(tableId),
    tableId.split('_')[0],
    tableId.replace(/_(call|talk)$/i, ''),
  ].filter(Boolean);
  const lead = block.leadText.toLowerCase();
  const exact = candidates.find((candidate) => lead.includes(candidate.toLowerCase()));
  if (exact) {
    return exact === tableId ? 4 : 3;
  }
  return 1;
}

function scoreSheetForTable(sheet, tableId, csvBaseName = '') {
  const sheetName = sheet.sheetName.toLowerCase();
  const normalizedTableId = tableId.toLowerCase();
  const canonicalTableId = getCanonicalTableId(tableId).toLowerCase();
  const prefixTableId = tableId.replace(/_(call|talk)$/i, '').toLowerCase();
  const normalizedCsvBase = csvBaseName.toLowerCase();

  if (normalizedCsvBase && sheetName === normalizedCsvBase) {
    return 11;
  }

  if (sheetName === normalizedTableId) {
    return 10;
  }
  if (sheetName === canonicalTableId) {
    return 9;
  }
  if (sheetName === prefixTableId) {
    return 8;
  }

  const text = flattenRows(sheet.rows, 0, Math.min(sheet.rows.length, 80)).toLowerCase();
  if (normalizedCsvBase && text.includes(normalizedCsvBase)) {
    return 8;
  }
  if (text.includes(normalizedTableId)) {
    return 7;
  }
  if (text.includes(canonicalTableId)) {
    return 6;
  }
  if (prefixTableId && text.includes(prefixTableId)) {
    return 5;
  }
  return 0;
}

function extractInlineNote(row, startIndex) {
  return normalizeValue(row[startIndex]);
}

function extractReferenceTokens(text) {
  return [...normalizeValue(text).matchAll(/#([A-Za-z][A-Za-z0-9_]*)/g)].map((match) =>
    match[1].toLowerCase()
  );
}

function extractLooseReferenceTokens(text) {
  const tokens = new Set();
  const value = normalizeValue(text);

  for (const match of value.matchAll(/\b([A-Za-z][A-Za-z0-9]*)\s*(ID|INDEX|TYPE|GROUP)\b/g)) {
    tokens.add(`${match[1].toLowerCase()}_${match[2].toLowerCase()}`);
  }

  return [...tokens];
}

function inferSupplementKeys(column) {
  const keys = new Set([
    ...extractReferenceTokens(column.description),
    ...extractReferenceTokens(column.note),
  ]);

  if (/^task_arg\d+$/i.test(column.name)) {
    keys.add('task_type');
  }

  if (/^link_arg\d+$/i.test(column.name)) {
    keys.add('link_type');
  }

  return [...keys];
}

function attachManualTables(columns, supplements) {
  if (supplements.length === 0) {
    return columns;
  }

  const supplementMap = new Map(supplements.map((table) => [table.id, table]));

  return columns.map((column) => {
    const manualTables = inferSupplementKeys(column)
      .map((token) => supplementMap.get(token))
      .filter(Boolean);

    return {
      ...column,
      manualTables,
    };
  });
}

function shareWorkbookSupplements(tables) {
  const workbookSupplements = new Map();

  for (const table of tables) {
    const workbooks = String(table.manualWorkbook ?? '')
      .split(/\s*,\s*/)
      .filter(Boolean);

    for (const workbook of workbooks) {
      const supplementMap = workbookSupplements.get(workbook) ?? new Map();
      for (const manualTable of table.manualSupplements ?? []) {
        if (!supplementMap.has(manualTable.id)) {
          supplementMap.set(manualTable.id, manualTable);
        }
      }
      for (const column of table.columns) {
        for (const manualTable of column.manualTables ?? []) {
          if (!supplementMap.has(manualTable.id)) {
            supplementMap.set(manualTable.id, manualTable);
          }
        }
      }
      workbookSupplements.set(workbook, supplementMap);
    }
  }

  for (const table of tables) {
    const workbooks = String(table.manualWorkbook ?? '')
      .split(/\s*,\s*/)
      .filter(Boolean);
    if (workbooks.length === 0) {
      continue;
    }

    const supplementMap = new Map();
    for (const workbook of workbooks) {
      for (const [id, manualTable] of workbookSupplements.get(workbook) ?? new Map()) {
        if (!supplementMap.has(id)) {
          supplementMap.set(id, manualTable);
        }
      }
    }

    for (const column of table.columns) {
      if ((column.manualTables ?? []).length > 0) {
        continue;
      }

      const candidateIds = uniqueInOrder([
        ...inferSupplementKeys(column),
        getColumnFamilyBase(column.name),
        normalizeFieldToken(column.name),
      ]);

      const manualTables = candidateIds.map((id) => supplementMap.get(id)).filter(Boolean);
      if (manualTables.length > 0) {
        column.manualTables = manualTables;
      }
    }
  }

  return tables;
}

function extractManualDocs(rows, csvHeaders, tableId) {
  const blocks = findHeaderBlocks(rows);
  if (blocks.length === 0) {
    return { intro: '', docsByField: {}, supplements: [], remarks: [] };
  }

  const csvFieldMap = new Map(csvHeaders.map((header) => [normalizeFieldToken(header.name), header.name]));
  const mainBlock = [...blocks].sort(
    (left, right) => scoreBlockForTable(right, tableId) - scoreBlockForTable(left, tableId)
  )[0];
  const effectiveEndRowIndex = findManualDocEndRow(rows, mainBlock, csvFieldMap);
  const docsByField = {};
  let lastFieldName = null;
  let noteAnchorFieldName = null;
  const intro = flattenRows(rows, 0, mainBlock.headerRowIndex)
    .split('\n')
    .filter(Boolean)
    .slice(-8)
    .join('\n');

  for (const rawRow of rows.slice(mainBlock.headerRowIndex + 1, effectiveEndRowIndex)) {
    const row = rawRow.map(normalizeValue);
    const fieldToken = normalizeFieldToken(row[mainBlock.fieldNameIndex] ?? '');
    const fieldName = csvFieldMap.get(fieldToken);
    if (!fieldName) {
      if (!noteAnchorFieldName) {
        continue;
      }

      const descriptionContinuation = normalizeValue(row[mainBlock.descriptionIndex]);
      const noteContinuation = extractInlineNote(row, mainBlock.descriptionIndex + 1);
      if (isContinuationText(noteContinuation)) {
        docsByField[noteAnchorFieldName].note = appendContinuationText(
          docsByField[noteAnchorFieldName].note,
          noteContinuation
        );
      } else if (isContinuationText(descriptionContinuation)) {
        if (docsByField[noteAnchorFieldName].note) {
          docsByField[noteAnchorFieldName].note = appendContinuationText(
            docsByField[noteAnchorFieldName].note,
            descriptionContinuation
          );
        } else {
          docsByField[noteAnchorFieldName].description = appendContinuationText(
            docsByField[noteAnchorFieldName].description,
            descriptionContinuation
          );
        }
      }
      continue;
    }

    if (docsByField[fieldName]) {
      continue;
    }

    let description = normalizeValue(row[mainBlock.descriptionIndex]) || DEFAULT_DESCRIPTION;
    let note = extractInlineNote(row, mainBlock.descriptionIndex + 1);

    const isNoteContinuation = Boolean(noteAnchorFieldName && isContinuationText(note));
    const isDescriptionContinuation = Boolean(noteAnchorFieldName && isContinuationText(description));

    if (isNoteContinuation) {
      docsByField[noteAnchorFieldName].note = appendContinuationText(docsByField[noteAnchorFieldName].note, note);
      note = '';
    } else if (isDescriptionContinuation) {
      if (docsByField[noteAnchorFieldName].note) {
        docsByField[noteAnchorFieldName].note = appendContinuationText(
          docsByField[noteAnchorFieldName].note,
          description
        );
      } else {
        docsByField[noteAnchorFieldName].description = appendContinuationText(
          docsByField[noteAnchorFieldName].description,
          description
        );
      }
      description = DEFAULT_DESCRIPTION;
    }

    docsByField[fieldName] = {
      dataType: normalizeValue(row[mainBlock.dataTypeIndex]) || 'uint',
      description,
      note,
    };
    lastFieldName = fieldName;
    if (!isNoteContinuation && !isDescriptionContinuation) {
      noteAnchorFieldName = fieldName;
    }
  }

  return {
    intro,
    docsByField,
    supplements: extractSupplementTables(rows, { ...mainBlock, endRowIndex: effectiveEndRowIndex }),
    remarks: extractManualRemarks(rows, { ...mainBlock, endRowIndex: effectiveEndRowIndex }),
  };
}

function chooseManualSheetCandidates(manuals, tableId, csvBaseName = '') {
  const ranked = [];

  for (const manual of manuals) {
    for (const sheet of manual.sheets) {
      const score = scoreSheetForTable(sheet, tableId, csvBaseName);
      if (score > 0) {
        ranked.push({
          workbook: manual.name,
          sheetName: sheet.sheetName,
          rows: sheet.rows,
          score,
        });
      }
    }
  }

  if (ranked.length === 0) {
    return [];
  }

  ranked.sort((left, right) => right.score - left.score || left.sheetName.localeCompare(right.sheetName, 'ko'));
  return ranked;
}

function countDocumentedFields(manualData) {
  return Object.values(manualData.docsByField ?? {}).filter(
    (doc) => normalizeValue(doc.description) && normalizeValue(doc.description) !== DEFAULT_DESCRIPTION
  ).length;
}

function readOverrides(appRoot) {
  return JSON.parse(fs.readFileSync(path.join(appRoot, ...OVERRIDE_PATH), 'utf8'));
}

export function updateRelationOverrides({
  appRoot,
  sourceTable,
  sourceColumn,
  targetTable,
  targetColumn,
  reason,
}) {
  const overridePath = path.join(appRoot, ...OVERRIDE_PATH);
  const overrides = readOverrides(appRoot).filter(
    (item) => !(item.sourceTable === sourceTable && item.sourceColumn === sourceColumn)
  );

  if (targetTable && targetColumn) {
    overrides.push({
      sourceTable,
      sourceColumn,
      targetTable,
      targetColumn,
      mode: 'force',
      reason: reason || 'manual override',
    });
  }

  fs.writeFileSync(overridePath, `${JSON.stringify(overrides, null, 2)}\n`, 'utf8');
}

function createComponentTable({
  workspaceRoot,
  folderName,
  csvPath,
  section,
  manualSheet,
  manualData,
}) {
  const tableId = getCanonicalTableId(section.tableId);
  const columns = attachManualTables(
    section.headers.map((header) => {
      const doc = manualData.docsByField[header.name] ?? {};
      return {
        name: header.name,
        rawHeader: header.rawHeader,
        dataType: doc.dataType || header.dataType || 'uint',
        isKey: header.isKey,
        isComment: header.isComment,
        description: doc.description || DEFAULT_DESCRIPTION,
        note: doc.note || '',
        relation: null,
        manualTables: [],
      };
    }),
    manualData.supplements ?? []
  );

  return {
    rawTableId: section.tableId,
    canonicalTableId: tableId,
    folderName,
    folderGroup: folderName
      .replace(/\s*DataT(?:able|eble)_GL$/, '')
      .replace(/_DataT(?:able|eble)_GL$/, ''),
    csvPath: path.relative(workspaceRoot, csvPath).replace(/\\/g, '/'),
    manualWorkbook: manualSheet?.workbook ?? null,
    manualSheet: manualSheet?.sheetName ?? null,
    tableIntro: manualData.intro,
    manualSupplements: manualData.supplements ?? [],
    manualRemarks: manualData.remarks ?? [],
    columns,
  };
}

function mergeColumns(componentTables) {
  const columnMap = new Map();

  for (const component of componentTables) {
    for (const column of component.columns) {
      const existing = columnMap.get(column.name);

      if (!existing) {
        columnMap.set(column.name, { ...column });
        continue;
      }

      existing.rawHeader ||= column.rawHeader;
      existing.dataType =
        (!existing.dataType || existing.dataType === 'uint') && column.dataType
          ? column.dataType
          : existing.dataType;
      existing.isKey = existing.isKey || column.isKey;
      existing.isComment = existing.isComment || column.isComment;
      if (existing.description === DEFAULT_DESCRIPTION && column.description !== DEFAULT_DESCRIPTION) {
        existing.description = column.description;
      }
      if (!existing.note && column.note) {
        existing.note = column.note;
      }
      if (existing.manualTables.length === 0 && column.manualTables.length > 0) {
        existing.manualTables = column.manualTables;
      }
    }
  }

  return [...columnMap.values()];
}

function buildTables(workspaceRoot, { folders, cacheDir } = {}) {
  const components = [];

  const allDirs = findDataTableDirs(workspaceRoot);
  const dirs = folders ? allDirs.filter((d) => folders.includes(d)) : allDirs;

  for (const folderName of dirs) {
    const folderPath = path.join(workspaceRoot, folderName);
    const manuals = findManualFiles(folderPath).map((name) => ({
      name,
      sheets: loadWorkbookSheetsWithCache(path.join(folderPath, name), cacheDir),
    }));

    const csvFiles = fs
      .readdirSync(folderPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.csv'))
      .map((entry) => entry.name)
      .filter((name) => !isIgnoredTableFile(name))
      .sort((a, b) => a.localeCompare(b, 'ko'));

    for (const csvFile of csvFiles) {
      const csvPath = path.join(folderPath, csvFile);
      const sections = parseCsvSections(csvPath);
      const csvBaseName = path.parse(csvFile).name;

      for (const section of sections) {
        const manualCandidates = chooseManualSheetCandidates(manuals, section.tableId, csvBaseName).map(
          (manualSheet) => {
            const csvNamedSheet =
              manualSheet.sheetName === '히스토리'
                ? manuals
                    .flatMap((manual) =>
                      manual.sheets.map((sheet) => ({
                        workbook: manual.name,
                        sheetName: sheet.sheetName,
                        rows: sheet.rows,
                      }))
                    )
                    .find((sheet) => sheet.sheetName.toLowerCase() === csvBaseName.toLowerCase()) ?? manualSheet
                : manualSheet;
            const manualData = extractManualDocs(csvNamedSheet.rows, section.headers, section.tableId);

            return {
              manualSheet: csvNamedSheet,
              manualData,
              docCount: countDocumentedFields(manualData),
              score: manualSheet.score,
            };
          }
        );

        manualCandidates.sort(
          (left, right) =>
            right.docCount - left.docCount ||
            right.score - left.score ||
            left.manualSheet.sheetName.localeCompare(right.manualSheet.sheetName, 'ko')
        );

        const bestManual = manualCandidates[0] ?? null;
        const manualSheet = bestManual?.manualSheet ?? null;
        const manualData = bestManual?.manualData ?? { intro: '', docsByField: {}, supplements: [], remarks: [] };

        components.push(
          createComponentTable({
            workspaceRoot,
            folderName,
            csvPath,
            section,
            manualSheet,
            manualData,
          })
        );
      }
    }
  }

  const groups = new Map();

  for (const component of components) {
    const list = groups.get(component.canonicalTableId) ?? [];
    list.push(component);
    groups.set(component.canonicalTableId, list);
  }

    return shareWorkbookSupplements(
      [...groups.entries()]
      .map(([tableId, componentTables]) => {
        const columns = mergeColumns(componentTables);
        const csvPaths = [...new Set(componentTables.map((item) => item.csvPath))];
        const manualWorkbooks = [...new Set(componentTables.map((item) => item.manualWorkbook).filter(Boolean))];
        const manualSheets = [...new Set(componentTables.map((item) => item.manualSheet).filter(Boolean))];
      const intros = [...new Set(componentTables.map((item) => item.tableIntro).filter(Boolean))];

      return {
        tableId,
        tableSlug: tableId.replace(/[^A-Za-z0-9_]+/g, '_'),
        displayName: tableId,
        folderName: componentTables[0].folderName,
        folderGroup: componentTables[0].folderGroup,
        csvPath: csvPaths.join(', '),
        manualWorkbook: manualWorkbooks.length > 0 ? manualWorkbooks.join(', ') : null,
        manualSheet: manualSheets.length > 0 ? manualSheets.join(', ') : null,
        tableIntro: intros.join('\n\n'),
        manualSupplements: uniqueInOrder(
          componentTables.flatMap((item) => item.manualSupplements ?? []),
          (item) => `${item.id}:${item.title}`
        ),
        manualRemarks: uniqueInOrder(
          componentTables.flatMap((item) => item.manualRemarks ?? []),
          (item) => `${item.id}:${item.title}`
        ),
        keyColumns: columns.filter((column) => column.isKey).map((column) => column.name),
        columns,
        outboundRelations: [],
        inboundRelations: [],
        unresolvedCandidates: [],
        };
      })
      .sort((left, right) => left.tableId.localeCompare(right.tableId, 'ko'))
    );
  }

function buildKeyIndex(tables) {
  const index = new Map();
  for (const table of tables) {
    for (const column of table.columns.filter(
      (item) =>
        item.isKey ||
        SPECIAL_REFERENCE_COLUMNS.has(item.name) ||
        /(?:^|_)(?:id|index)$/.test(item.name) ||
        /(?:^|_)(?:type|group)$/.test(item.name)
    )) {
        const names = new Set([column.name]);
        const digitless = column.name.replace(/([_]?)(\d+)$/, '');
        if (digitless && digitless !== column.name) {
          names.add(digitless);
        }
        for (const equivalent of getEquivalentReferenceNames(column.name)) {
          names.add(equivalent);
        }

        for (const name of names) {
          const list = index.get(name) ?? [];
          list.push({ tableId: table.tableId, columnName: column.name, isKey: column.isKey });
          index.set(name, list);
      }
    }
  }
  return index;
}

function buildReferenceColumnIndex(tables) {
  const index = new Map();

  for (const table of tables) {
    for (const column of table.columns.filter(
      (item) =>
        item.isKey ||
        SPECIAL_REFERENCE_COLUMNS.has(item.name) ||
        /(?:id|index|type|group)/i.test(item.name)
    )) {
        const token = normalizeReferenceToken(column.name);
        if (!token) {
          continue;
        }
        const list = index.get(token) ?? [];
        list.push({ tableId: table.tableId, columnName: column.name, isKey: column.isKey });
        index.set(token, list);

        for (const equivalent of getEquivalentReferenceNames(column.name)) {
          const equivalentToken = normalizeReferenceToken(equivalent);
          if (!equivalentToken) {
            continue;
          }
          const equivalentList = index.get(equivalentToken) ?? [];
          equivalentList.push({ tableId: table.tableId, columnName: column.name, isKey: column.isKey });
          index.set(equivalentToken, equivalentList);
        }
      }
    }

  return index;
}

function tokenizeColumnName(name) {
  return normalizeFieldToken(name)
    .split('_')
    .filter(Boolean);
}

function buildInferenceCandidates(columnName) {
  const normalized = normalizeFieldToken(columnName);
  const tokens = tokenizeColumnName(columnName);
  const strippedTokens = [...tokens];

  while (strippedTokens.length > 1 && RELATION_PREFIXES.has(strippedTokens[0])) {
    strippedTokens.shift();
  }

  const variants = new Set([normalized]);
  const digitless = normalized.replace(DIGIT_SUFFIX_PATTERN, '');
  if (digitless && digitless !== normalized) {
    variants.add(digitless);
  }

  const trimNumericTail = (parts) => {
    const next = [...parts];
    while (next.length > 1 && /^\d+$/.test(next[next.length - 1])) {
      next.pop();
    }
    return next;
  };

  const sources = [tokens, strippedTokens, trimNumericTail(tokens), trimNumericTail(strippedTokens)].filter(
    (parts) => parts.length > 0
  );
  for (const parts of sources) {
    for (let size = Math.min(3, parts.length); size >= 1; size -= 1) {
      variants.add(parts.slice(-size).join('_'));
    }
  }

  return [...variants].filter(Boolean);
}

function getCoreSourceTokens(columnName) {
  const tokens = tokenizeColumnName(columnName);
  while (tokens.length > 1 && RELATION_PREFIXES.has(tokens[0])) {
    tokens.shift();
  }
  return tokens;
}

function shouldSkipBareInference(sourceColumnName, targetTableId, targetColumnName, matchedBy = '') {
  const source = normalizeFieldToken(sourceColumnName);
  const targetTable = normalizeFieldToken(targetTableId);
  const targetColumn = normalizeFieldToken(targetColumnName);
  const matchedToken = normalizeFieldToken(matchedBy);
  const isGenericMatchedToken =
    matchedToken === 'id' ||
    matchedToken === 'index' ||
    matchedToken === 'type' ||
    matchedToken === 'group' ||
    matchedToken === 'group_id' ||
    matchedToken === 'type_id' ||
    matchedToken === 'group_index' ||
    matchedToken === 'type_index';

  if (
    isGenericMatchedToken &&
    !source.includes(targetTable) &&
    source !== `${targetTable}_${matchedToken}` &&
    source !== targetColumn
  ) {
    return true;
  }

  if (source.includes(targetTable)) {
    return false;
  }

  if (source !== targetColumn) {
    return false;
  }

  if (SPECIAL_REFERENCE_COLUMNS.has(source)) {
    return false;
  }

  return !/(?:^|_)(?:id|index|type|group)$/.test(source);
}

function scoreInferredCandidate(sourceColumnName, target, variants) {
  const source = normalizeFieldToken(sourceColumnName);
  const strippedSourceTokens = getCoreSourceTokens(sourceColumnName);
  const sourceBaseTable = strippedSourceTokens[0] ?? '';
  const targetTable = normalizeFieldToken(target.tableId);
  const targetColumn = normalizeFieldToken(target.columnName);
  const matchedBy = normalizeFieldToken(target.matchedBy ?? '');
  let score = 0;

  if (target.isKey) {
    score += 20;
  } else if (SPECIAL_REFERENCE_COLUMNS.has(targetColumn)) {
    score += 12;
  } else if (/(?:^|_)(?:id|index)$/.test(targetColumn)) {
    score += 14;
  } else if (/(?:^|_)(?:type|group)$/.test(targetColumn)) {
    score += 8;
  }

  if (variants[0] === targetColumn) {
    score += 16;
  }

  score += Math.min(matchedBy.length, 24);

  if (source === targetColumn) {
    score += 10;
  }

  if (source.includes(targetTable)) {
    score += 12;
  }

  if (sourceBaseTable && sourceBaseTable === targetTable) {
    score += 18;
  }

  if (sourceBaseTable && targetTable.startsWith(`${sourceBaseTable}_`)) {
    score -= 22;
  }

  if (
    sourceBaseTable &&
    targetTable === sourceBaseTable &&
    target.isKey &&
    /(?:^|_)(?:id|index|type|group)$/.test(targetColumn)
  ) {
    score += 16;
  }

  if (source.endsWith(`_${targetColumn}`)) {
    score += 10;
  }

  if (source.includes(`${targetTable}_${targetColumn}`)) {
    score += 12;
  }

  return score;
}

function pickTargetColumn(targetTable) {
  return targetTable.keyColumns[0] ?? targetTable.columns[0]?.name ?? '';
}

function buildTableAliasMap(tables) {
  const aliasMap = new Map();

  for (const table of tables) {
    aliasMap.set(table.tableId, table.tableId);
  }

  return aliasMap;
}

function resolveTableAlias(tableId, aliasMap) {
  if (!tableId) {
    return '';
  }
  return aliasMap.get(tableId) ?? getCanonicalTableId(tableId);
}

function explicitCandidatesFromText(text, tableMap, aliasMap, referenceColumnIndex) {
  const value = normalizeValue(text);
  if (!value) {
    return [];
  }

  const results = [];
  const explicitTableColumns = new Set();
  const push = (targetTable, targetColumn, evidence) => {
    const resolvedTableId = resolveTableAlias(targetTable, aliasMap);
    if (resolvedTableId.startsWith('#') || !tableMap.has(resolvedTableId)) {
      return;
    }
    if (targetColumn) {
      explicitTableColumns.add(resolvedTableId);
    }
    results.push({ targetTable: resolvedTableId, targetColumn, confidence: 'explicit', evidence });
  };

  for (const match of value.matchAll(/([A-Za-z0-9_.]+)\s*\uD14C\uC774\uBE14\uC758\s*([A-Za-z0-9_]+)\s*(?:\uAC12|\uCEEC\uB7FC|\uD544\uB4DC)?/g)) {
    push(match[1], match[2], match[0]);
  }

  for (const match of value.matchAll(/\[([A-Za-z0-9_.]+)\]\s*\uD14C\uC774\uBE14\uC758\s*([A-Za-z0-9_]+)\s*(?:\uAC12|\uCEEC\uB7FC|\uD544\uB4DC)?/g)) {
    push(match[1], match[2], match[0]);
  }

  for (const match of value.matchAll(/\[([A-Za-z0-9_.]+)\]\s*\uD14C\uC774\uBE14/g)) {
    if (!explicitTableColumns.has(resolveTableAlias(match[1], aliasMap))) {
      push(match[1], null, match[0]);
    }
  }

  for (const match of value.matchAll(/([A-Za-z0-9_.]+)\s*\uD14C\uC774\uBE14/g)) {
    if (!explicitTableColumns.has(resolveTableAlias(match[1], aliasMap))) {
      push(match[1], null, match[0]);
    }
  }

  for (const match of value.matchAll(/([A-Za-z0-9_.]+)\.csv/g)) {
    push(match[1], null, match[0]);
  }

  for (const match of value.matchAll(/([A-Za-z0-9_.]+)\s*->\s*([A-Za-z0-9_]+)/g)) {
    push(match[1], match[2], match[0]);
  }

  const rankReferenceCandidates = (token, candidates) => {
    const normalizedToken = normalizeReferenceToken(token);

    return [...candidates]
      .map((candidate) => {
        const candidateTable = normalizeFieldToken(candidate.tableId);
        const candidateColumn = normalizeFieldToken(candidate.columnName);
        let score = 0;

        if (candidate.isKey) {
          score += 20;
        }
        if (candidateColumn === token) {
          score += 16;
        }
        if (normalizeReferenceToken(candidateColumn) === normalizedToken) {
          score += 12;
        }
        if (
          token.startsWith(`${candidateTable}_`) ||
          candidateTable === token.replace(/_(id|index|type|group)$/i, '')
        ) {
          score += 18;
        }

        return { ...candidate, score };
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          Number(right.isKey) - Number(left.isKey) ||
          left.tableId.localeCompare(right.tableId, 'en')
      );
  };

  for (const token of [...new Set([...extractReferenceTokens(value), ...extractLooseReferenceTokens(value)])]) {
    const aliasTargets = COLUMN_REFERENCE_ALIASES[token] ?? [];
    for (const aliasTarget of aliasTargets) {
      push(aliasTarget.targetTable, aliasTarget.targetColumn, `#${token}`);
    }

    if (aliasTargets.length > 0) {
      continue;
    }

    const normalizedToken = normalizeReferenceToken(token);
    const candidates = rankReferenceCandidates(token, referenceColumnIndex.get(normalizedToken) ?? []);

    if (candidates.length === 0) {
      continue;
    }

    if (candidates.length === 1 || candidates[0].score - candidates[1].score >= 4) {
      push(candidates[0].tableId, candidates[0].columnName, `#${token}`);
      continue;
    }

    for (const candidate of candidates) {
      push(candidate.tableId, candidate.columnName, `#${token}`);
    }
  }

  return results;
}
function inferRelation(column, table, keyIndex) {
  const columnBase = getColumnFamilyBase(column.name);
  const manualTableIds = new Set((column.manualTables ?? []).map((item) => normalizeFieldToken(item.id)));

  if (manualTableIds.has(columnBase)) {
    return null;
  }

  const aliasedRelation = COLUMN_NAME_ALIASES[columnBase];
  if (aliasedRelation && (!aliasedRelation.skipIfKey || !column.isKey)) {
    if (aliasedRelation.targetTable === table.tableId) {
      return null;
    }
    return {
      targetTable: aliasedRelation.targetTable,
      targetColumn: aliasedRelation.targetColumn,
      confidence: 'inferred',
      evidence: `column:${column.name}`,
    };
  }

  if (column.isKey) {
    return null;
  }

  const variants = buildInferenceCandidates(column.name);
  const candidates = variants
    .flatMap((name) => (keyIndex.get(name) ?? []).map((item) => ({ ...item, matchedBy: name })))
    .filter((item) => item.tableId !== table.tableId)
    .filter((item) => !shouldSkipBareInference(column.name, item.tableId, item.columnName, item.matchedBy));

  const uniqueCandidates = candidates.filter(
    (candidate, index, array) =>
      array.findIndex(
        (item) => item.tableId === candidate.tableId && item.columnName === candidate.columnName
      ) === index
  );

  const rankedCandidates = uniqueCandidates
    .map((candidate) => ({
      ...candidate,
      score: scoreInferredCandidate(column.name, candidate, variants),
    }))
    .filter((candidate) => candidate.score >= 18)
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.isKey) - Number(left.isKey) ||
        left.tableId.localeCompare(right.tableId, 'en')
    );

  if (rankedCandidates.length === 1) {
    return {
      targetTable: rankedCandidates[0].tableId,
      targetColumn: rankedCandidates[0].columnName,
      confidence: 'inferred',
      evidence: `column:${column.name}`,
    };
  }

  if (rankedCandidates.length > 1) {
    if (rankedCandidates[0].score - rankedCandidates[1].score >= 4) {
      return {
        targetTable: rankedCandidates[0].tableId,
        targetColumn: rankedCandidates[0].columnName,
        confidence: 'inferred',
        evidence: `column:${column.name}`,
      };
    }

    return {
      unresolved: rankedCandidates.map((candidate) => ({
        targetTable: candidate.tableId,
        targetColumn: candidate.columnName,
        evidence: `score:${candidate.score}`,
      })),
    };
  }

  return null;
}

function relationKey(edge) {
  return `${edge.sourceTable}::${edge.sourceColumn}::${edge.targetTable}::${edge.targetColumn}`;
}

function getColumnFamilyBase(columnName) {
  return normalizeFieldToken(columnName).replace(/(?:_|)\d+$/, '');
}

function mergeRelation(store, edge) {
  const current = store.get(relationKey(edge));
  if (!current || CONFIDENCE_SCORE[edge.confidence] >= CONFIDENCE_SCORE[current.confidence]) {
    store.set(relationKey(edge), edge);
  }
}

function applyOverrides(relations, tables, overrides, aliasMap) {
  const tableMap = new Map(tables.map((table) => [table.tableId, table]));
  const store = new Map(relations.map((edge) => [relationKey(edge), edge]));

  for (const override of overrides) {
    const sourceTable = resolveTableAlias(override.sourceTable, aliasMap);
    const targetTableId = override.targetTable
      ? resolveTableAlias(override.targetTable, aliasMap)
      : '';

    if (override.mode === 'ignore') {
      for (const [key, edge] of store.entries()) {
        if (
          edge.sourceTable === sourceTable &&
          edge.sourceColumn === override.sourceColumn &&
          (!override.targetTable || edge.targetTable === targetTableId) &&
          (!override.targetColumn || edge.targetColumn === override.targetColumn)
        ) {
          store.delete(key);
        }
      }
      continue;
    }

    const target = tableMap.get(targetTableId);
    if (!target) {
      continue;
    }

    for (const [key, edge] of store.entries()) {
      if (edge.sourceTable === sourceTable && edge.sourceColumn === override.sourceColumn) {
        store.delete(key);
      }
    }

    mergeRelation(store, {
      sourceTable,
      sourceColumn: override.sourceColumn,
      targetTable: targetTableId,
      targetColumn: override.targetColumn || pickTargetColumn(target),
      confidence: 'override',
      evidence: override.reason,
    });
  }

  return [...store.values()];
}

function attachRelations(tables, overrides) {
  const tableMap = new Map(tables.map((table) => [table.tableId, table]));
  const aliasMap = buildTableAliasMap(tables);
  const keyIndex = buildKeyIndex(tables);
  const referenceColumnIndex = buildReferenceColumnIndex(tables);
  const relations = [];

  for (const table of tables) {
    for (const column of table.columns) {
      if (column.isComment) {
        continue;
      }

        const explicitCandidates = [column.description, column.note]
          .flatMap((text) => explicitCandidatesFromText(text, tableMap, aliasMap, referenceColumnIndex))
          .filter((candidate) => {
            if (!candidate.evidence?.startsWith('#')) {
              return true;
            }

            const token = candidate.evidence.slice(1).toLowerCase();
            return !(column.manualTables ?? []).some(
              (manualTable) => normalizeFieldToken(manualTable.id) === token
            );
          })
          .filter(
            (candidate, index, arr) =>
              arr.findIndex(
                (item) =>
                item.targetTable === candidate.targetTable &&
                item.targetColumn === candidate.targetColumn
            ) === index
        );

      if (explicitCandidates.length === 1) {
        const targetTable = tableMap.get(explicitCandidates[0].targetTable);
        relations.push({
          sourceTable: table.tableId,
          sourceColumn: column.name,
          targetTable: explicitCandidates[0].targetTable,
          targetColumn: explicitCandidates[0].targetColumn || pickTargetColumn(targetTable),
          confidence: explicitCandidates[0].confidence,
          evidence: explicitCandidates[0].evidence,
        });
        continue;
      }

      if (explicitCandidates.length > 1) {
        table.unresolvedCandidates.push({
          columnName: column.name,
          reason: 'multiple-explicit',
          candidates: explicitCandidates.map((candidate) => ({
            targetTable: candidate.targetTable,
            targetColumn: candidate.targetColumn,
            evidence: candidate.evidence,
          })),
        });
        continue;
      }

      const inferred = inferRelation(column, table, keyIndex);
      if (inferred?.unresolved) {
        table.unresolvedCandidates.push({
          columnName: column.name,
          reason: 'multiple-inferred',
          candidates: inferred.unresolved,
        });
        continue;
      }

      if (inferred) {
        relations.push({
          sourceTable: table.tableId,
          sourceColumn: column.name,
          targetTable: inferred.targetTable,
          targetColumn: inferred.targetColumn,
          confidence: inferred.confidence,
          evidence: inferred.evidence,
        });
      }
    }
  }

  const finalRelations = applyOverrides(relations, tables, overrides, aliasMap).filter((edge, _, list) => {
    if (edge.confidence !== 'inferred') {
      return true;
    }

    return !list.some(
      (other) =>
        other !== edge &&
        other.sourceTable === edge.targetTable &&
        other.targetTable === edge.sourceTable
    );
  });

  for (const table of tables) {
    table.outboundRelations = [];
    table.inboundRelations = [];
  }

  for (const edge of finalRelations) {
    const sourceTable = tableMap.get(edge.sourceTable);
    const targetTable = tableMap.get(edge.targetTable);
    if (!sourceTable || !targetTable) {
      continue;
    }

    sourceTable.outboundRelations.push(edge);
    targetTable.inboundRelations.push(edge);

    const sourceColumn = sourceTable.columns.find((column) => column.name === edge.sourceColumn);
    if (sourceColumn) {
      sourceColumn.relation = {
        targetTable: edge.targetTable,
        targetColumn: edge.targetColumn,
        confidence: edge.confidence,
        evidence: edge.evidence,
      };
    }
  }

  for (const table of tables) {
    const families = new Map();

    for (const column of table.columns) {
      const base = getColumnFamilyBase(column.name);
      if (!base || base === column.name) {
        continue;
      }

      const list = families.get(base) ?? [];
      list.push(column);
      families.set(base, list);
    }

    for (const columns of families.values()) {
      const template =
        columns.find((column) => column.relation)?.relation ??
        null;

      if (!template) {
        continue;
      }

      for (const column of columns) {
        if (column.relation) {
          continue;
        }

        column.relation = { ...template };
      }
    }
  }
}

function buildGraph(tables) {
  const edgeMap = new Map();

  for (const table of tables) {
    for (const relation of table.outboundRelations) {
      const key = [relation.sourceTable, relation.targetTable].sort().join('::');
      const current = edgeMap.get(key) ?? {
        source: relation.sourceTable,
        target: relation.targetTable,
        weight: 0,
      };
      current.weight += 1;
      edgeMap.set(key, current);
    }
  }

  return {
    nodes: tables.map((table) => ({
      id: table.tableId,
      label: table.tableId,
      group: table.folderGroup,
      outboundCount: table.outboundRelations.length,
      inboundCount: table.inboundRelations.length,
    })),
    edges: [...edgeMap.values()],
  };
}

export function buildDataset({ workspaceRoot, appRoot, folders, cacheDir }) {
  const tables = buildTables(workspaceRoot, { folders, cacheDir });
  const overrides = readOverrides(appRoot);
  attachRelations(tables, overrides);

  return {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    tableCount: tables.length,
    relationCount: tables.reduce((sum, table) => sum + table.outboundRelations.length, 0),
    tables,
    graph: buildGraph(tables),
  };
}

export function buildCatalog(dataset) {
  return {
    generatedAt: dataset.generatedAt,
    workspaceRoot: dataset.workspaceRoot,
    tableCount: dataset.tableCount,
    relationCount: dataset.relationCount,
    entries: dataset.tables.map((table) => ({
      tableId: table.tableId,
      tableSlug: table.tableSlug,
      displayName: table.displayName,
      folderName: table.folderName,
      folderGroup: table.folderGroup,
      csvPath: table.csvPath,
      manualWorkbook: table.manualWorkbook,
      manualSheet: table.manualSheet,
      keyColumns: table.keyColumns,
      columnCount: table.columns.length,
      outboundRelationCount: table.outboundRelations.length,
      inboundRelationCount: table.inboundRelations.length,
    })),
  };
}

export function buildRelationIndex(dataset) {
  const outbound = {};
  const inbound = {};

  for (const table of dataset.tables) {
    if (table.outboundRelations.length > 0) {
      outbound[table.tableId] = table.outboundRelations;
    }
    if (table.inboundRelations.length > 0) {
      inbound[table.tableId] = table.inboundRelations;
    }
  }

  return {
    generatedAt: dataset.generatedAt,
    outbound,
    inbound,
    graph: dataset.graph,
  };
}

export function buildPerTableJson(table) {
  return {
    tableId: table.tableId,
    tableSlug: table.tableSlug,
    displayName: table.displayName,
    folderName: table.folderName,
    folderGroup: table.folderGroup,
    csvPath: table.csvPath,
    manualWorkbook: table.manualWorkbook,
    manualSheet: table.manualSheet,
    tableIntro: table.tableIntro,
    keyColumns: table.keyColumns,
    columns: table.columns,
    manualSupplements: table.manualSupplements,
    manualRemarks: table.manualRemarks,
    outboundRelations: table.outboundRelations,
    inboundRelations: table.inboundRelations,
    unresolvedCandidates: table.unresolvedCandidates,
  };
}
