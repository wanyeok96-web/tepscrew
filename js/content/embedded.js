/**
 * Embedded content for file:// (double-click) execution.
 * Paths must match fetchJson() callers.
 */

import foundation from '../../data/foundation.json';
import vocabulary from '../../data/vocabulary.json';
import grammar from '../../data/grammar.json';
import reading from '../../data/reading.json';
import listening from '../../data/listening.json';
import packManifest from '../../data/packs/manifest.json';
import pack001 from '../../data/packs/TEPS_Crew_Pack_001.json';
import pack002 from '../../data/packs/TEPS_Crew_Pack_002.json';

const EMBEDDED = {
  './data/foundation.json': foundation,
  './data/vocabulary.json': vocabulary,
  './data/grammar.json': grammar,
  './data/reading.json': reading,
  './data/listening.json': listening,
  './data/packs/manifest.json': packManifest,
  './data/packs/TEPS_Crew_Pack_001.json': pack001,
  './data/packs/TEPS_Crew_Pack_002.json': pack002,
};

function normalizePath(path) {
  if (!path) return '';
  let p = String(path).replace(/\\/g, '/');
  if (p.startsWith('/')) p = `.${p}`;
  if (!p.startsWith('./')) p = `./${p.replace(/^\.\//, '')}`;
  return p;
}

export function getEmbeddedJson(path) {
  return EMBEDDED[normalizePath(path)];
}

export function hasEmbeddedJson(path) {
  return getEmbeddedJson(path) !== undefined;
}
