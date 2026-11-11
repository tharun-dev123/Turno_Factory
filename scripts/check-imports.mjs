// Import-restriction check: UI code must reach data only through cellService / authService.
// Independent of ESLint so it can run anywhere (CI, pre-commit).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = new URL('../src', import.meta.url).pathname;

const FORBIDDEN_OUTSIDE_SERVICES = [
  { test: /services\/mock/, why: 'mock data layer' },
  { test: /services\/repository/, why: 'data-source selection point' },
  { test: /services\/contracts/, why: 'data-source contracts' },
  { test: /['"]@react-native-async-storage\/async-storage['"]/, why: 'raw local storage' },
  { test: /['"]expo-secure-store['"]/, why: 'raw secure storage' },
  { test: /@\/validation\//, why: 'barcode validators (use cellService)' },
];

const MOCK_IMPORT = /from\s+['"][^'"]*\/mock(\/[^'"]*)?['"]/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(root).filter((f) => /\.(ts|tsx)$/.test(f));
const problems = [];

for (const file of files) {
  const rel = relative(root, file).split(sep).join('/');
  const source = readFileSync(file, 'utf8');
  const importLines = source.split('\n').filter((line) => /^\s*(import|export)\b.*from\b|^\s*import\s+['"]/.test(line));
  const inServices = rel.startsWith('services/');
  const inValidation = rel.startsWith('validation/');

  for (const line of importLines) {
    if (!inServices && !inValidation) {
      for (const rule of FORBIDDEN_OUTSIDE_SERVICES) {
        if (rule.test.test(line)) problems.push(`${rel}: forbidden import of ${rule.why}\n    ${line.trim()}`);
      }
    }
    if (inServices && !rel.startsWith('services/mock/') && rel !== 'services/repository.ts' && MOCK_IMPORT.test(line)) {
      problems.push(`${rel}: only services/repository.ts may import the mock layer\n    ${line.trim()}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Import restriction check FAILED (${problems.length}):\n` + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`Import restriction check passed (${files.length} files scanned).`);
