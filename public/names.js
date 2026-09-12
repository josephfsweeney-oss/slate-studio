/* Name handling, shared by the server and the browser.
 * Matches build/build_roster.py and build/make_decks.py so a cutout filename
 * built on the Mac resolves to the same candidate here. */

const SUFFIX = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

/** "Kevin M. Nugent Jr" -> { first: "KEVIN M.", last: "NUGENT JR" } */
export function nameParts(name) {
  const toks = String(name || '').replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  let suf = '';
  if (toks.length && SUFFIX.has(toks[toks.length - 1].toLowerCase().replace(/[^a-z]/g, ''))) {
    suf = toks.pop().replace(/\./g, '');
  }
  const last = (toks.length ? toks[toks.length - 1] : name) + (suf ? ' ' + suf : '');
  const first = toks.slice(0, -1).join(' ');
  return { first: first.toUpperCase(), last: String(last).toUpperCase() };
}

/** "Karel A. Crawford" -> "Karel-A-Crawford", the cutout filename stem. */
export function slugify(name) {
  return String(name || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* The honorific a sitting member carries on a piece.
 *
 * It goes on the first-name line, not the surname, because the surname is the
 * thing a voter matches against the ballot and nothing may be in front of it.
 * "REP. TOM" over "PLOSZAJ" is how New Hampshire sets it. */
export const HONORIFIC = 'REP.';

/** The first-name line for a plate or a ballot row, with the honorific if due. */
export function firstLine(candidate, style = {}) {
  const first = String(candidate?.first || '').toUpperCase();
  const show = style.honorific !== false && candidate?.incumbent;
  if (!show) return first;
  return first ? `${HONORIFIC} ${first}` : HONORIFIC;
}

/** Surname + first initial, suffixes dropped. Used to reconcile sources. */
export function matchKey(name) {
  const toks = String(name || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/)
    .filter((t) => t && !SUFFIX.has(t));
  if (!toks.length) return '|';
  return `${toks[toks.length - 1]}|${toks.length > 1 ? toks[0][0] : ''}`;
}
