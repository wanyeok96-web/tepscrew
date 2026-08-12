import fs from 'fs';

const manifest = JSON.parse(
  fs.readFileSync('./data/foundation/manifest.json', 'utf8')
);

const importLines = [
  "import vocabulary from '../../data/vocabulary.json';",
  "import grammar from '../../data/grammar.json';",
  "import reading from '../../data/reading.json';",
  "import listening from '../../data/listening.json';",
  "import guide from '../../data/guide.json';",
  "import packManifest from '../../data/packs/manifest.json';",
  "import pack001 from '../../data/packs/TEPS_Crew_Pack_001.json';",
  "import pack002 from '../../data/packs/TEPS_Crew_Pack_002.json';",
  "import foundationManifest from '../../data/foundation/manifest.json';",
];

const entryLines = [
  "  './data/vocabulary.json': vocabulary,",
  "  './data/grammar.json': grammar,",
  "  './data/reading.json': reading,",
  "  './data/listening.json': listening,",
  "  './data/guide.json': guide,",
  "  './data/packs/manifest.json': packManifest,",
  "  './data/packs/TEPS_Crew_Pack_001.json': pack001,",
  "  './data/packs/TEPS_Crew_Pack_002.json': pack002,",
  "  './data/foundation/manifest.json': foundationManifest,",
];

manifest.lessons.forEach((lesson, index) => {
  const key = String(index + 1).padStart(3, '0');
  importLines.push(
    `import fLesson${key} from '../../data/foundation/lessons/${lesson.id}.json';`
  );
  entryLines.push(
    `  './data/foundation/lessons/${lesson.id}.json': fLesson${key},`
  );
});

const parts = [
  '/**',
  ' * Embedded content for file:// (double-click) execution.',
  ' * Paths must match fetchJson() callers.',
  ' */',
  '',
  ...importLines,
  '',
  'const EMBEDDED = {',
  ...entryLines,
  '};',
  '',
  'function normalizePath(path) {',
  "  if (!path) return '';",
  '  let p = String(path).split(String.fromCharCode(92)).join("/");',
  "  if (p.startsWith('/')) p = '.' + p;",
  "  if (!p.startsWith('./')) p = './' + p.replace(/^\\.\\//, '');",
  '  return p;',
  '}',
  '',
  'export function getEmbeddedJson(path) {',
  '  return EMBEDDED[normalizePath(path)];',
  '}',
  '',
  'export function hasEmbeddedJson(path) {',
  '  return getEmbeddedJson(path) !== undefined;',
  '}',
  '',
];

fs.writeFileSync('./js/content/embedded.js', parts.join('\n'));
console.log('embedded lessons', manifest.lessons.length);
