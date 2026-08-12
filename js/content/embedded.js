/**
 * Embedded content for file:// (double-click) execution.
 * Paths must match fetchJson() callers.
 */

import vocabulary from '../../data/vocabulary.json';
import grammar from '../../data/grammar.json';
import reading from '../../data/reading.json';
import listening from '../../data/listening.json';
import guide from '../../data/guide.json';
import packManifest from '../../data/packs/manifest.json';
import pack001 from '../../data/packs/TEPS_Crew_Pack_001.json';
import pack002 from '../../data/packs/TEPS_Crew_Pack_002.json';
import foundationManifest from '../../data/foundation/manifest.json';
import fLesson001 from '../../data/foundation/lessons/F-001.json';
import fLesson002 from '../../data/foundation/lessons/F-002.json';
import fLesson003 from '../../data/foundation/lessons/F-003.json';
import fLesson004 from '../../data/foundation/lessons/F-004.json';
import fLesson005 from '../../data/foundation/lessons/F-005.json';
import fLesson006 from '../../data/foundation/lessons/F-006.json';
import fLesson007 from '../../data/foundation/lessons/F-007.json';
import fLesson008 from '../../data/foundation/lessons/F-008.json';
import fLesson009 from '../../data/foundation/lessons/F-009.json';
import fLesson010 from '../../data/foundation/lessons/F-010.json';
import fLesson011 from '../../data/foundation/lessons/F-011.json';
import fLesson012 from '../../data/foundation/lessons/F-012.json';
import fLesson013 from '../../data/foundation/lessons/F-013.json';
import fLesson014 from '../../data/foundation/lessons/F-014.json';
import fLesson015 from '../../data/foundation/lessons/F-015.json';
import fLesson016 from '../../data/foundation/lessons/F-016.json';
import fLesson017 from '../../data/foundation/lessons/F-017.json';
import fLesson018 from '../../data/foundation/lessons/F-018.json';
import fLesson019 from '../../data/foundation/lessons/F-019.json';
import fLesson020 from '../../data/foundation/lessons/F-020.json';
import fLesson021 from '../../data/foundation/lessons/F-021.json';
import fLesson022 from '../../data/foundation/lessons/F-022.json';
import fLesson023 from '../../data/foundation/lessons/F-023.json';
import fLesson024 from '../../data/foundation/lessons/F-024.json';

const EMBEDDED = {
  './data/vocabulary.json': vocabulary,
  './data/grammar.json': grammar,
  './data/reading.json': reading,
  './data/listening.json': listening,
  './data/guide.json': guide,
  './data/packs/manifest.json': packManifest,
  './data/packs/TEPS_Crew_Pack_001.json': pack001,
  './data/packs/TEPS_Crew_Pack_002.json': pack002,
  './data/foundation/manifest.json': foundationManifest,
  './data/foundation/lessons/F-001.json': fLesson001,
  './data/foundation/lessons/F-002.json': fLesson002,
  './data/foundation/lessons/F-003.json': fLesson003,
  './data/foundation/lessons/F-004.json': fLesson004,
  './data/foundation/lessons/F-005.json': fLesson005,
  './data/foundation/lessons/F-006.json': fLesson006,
  './data/foundation/lessons/F-007.json': fLesson007,
  './data/foundation/lessons/F-008.json': fLesson008,
  './data/foundation/lessons/F-009.json': fLesson009,
  './data/foundation/lessons/F-010.json': fLesson010,
  './data/foundation/lessons/F-011.json': fLesson011,
  './data/foundation/lessons/F-012.json': fLesson012,
  './data/foundation/lessons/F-013.json': fLesson013,
  './data/foundation/lessons/F-014.json': fLesson014,
  './data/foundation/lessons/F-015.json': fLesson015,
  './data/foundation/lessons/F-016.json': fLesson016,
  './data/foundation/lessons/F-017.json': fLesson017,
  './data/foundation/lessons/F-018.json': fLesson018,
  './data/foundation/lessons/F-019.json': fLesson019,
  './data/foundation/lessons/F-020.json': fLesson020,
  './data/foundation/lessons/F-021.json': fLesson021,
  './data/foundation/lessons/F-022.json': fLesson022,
  './data/foundation/lessons/F-023.json': fLesson023,
  './data/foundation/lessons/F-024.json': fLesson024,
};

function normalizePath(path) {
  if (!path) return '';
  let p = String(path).split(String.fromCharCode(92)).join("/");
  if (p.startsWith('/')) p = '.' + p;
  if (!p.startsWith('./')) p = './' + p.replace(/^\.\//, '');
  return p;
}

export function getEmbeddedJson(path) {
  return EMBEDDED[normalizePath(path)];
}

export function hasEmbeddedJson(path) {
  return getEmbeddedJson(path) !== undefined;
}
