/* Canvas sizes and copy templates.
 *
 * Templates carry tokens that get filled per district, so one piece of copy can
 * build all 174 districts in a batch run. */

/* `dpi` is what one inch of the finished piece measures here, and it is what
 * decides whether a canvas can be exported print ready. A screen canvas has no
 * dpi: bleed and crop marks mean nothing on an Instagram post. */
export const CANVASES = [
  { id: '1x1',     label: 'Square feed',       w: 1080, h: 1080, note: 'Instagram, X, Facebook feed' },
  { id: 'link',    label: 'Link card',         w: 1200, h: 628,  note: 'Facebook link preview, display' },
  { id: '16x9',    label: '16:9 slate',        w: 1920, h: 1080, note: 'Video slate, slide, OTT end card' },
  { id: 'story',   label: 'Story / Reel',      w: 1080, h: 1920, note: 'Instagram and Facebook stories' },
  { id: 'x-post',  label: 'X post',            w: 1600, h: 900,  note: 'X timeline image' },
  { id: 'email',   label: 'Email header',      w: 1200, h: 400,  note: 'Mailchimp header band' },

  // Display. Thin rails need the strip layout; the engine picks it on its own.
  { id: 'mrec',    label: 'Display 300x250',   w: 600,  h: 500,  note: 'Medium rectangle, at 2x' },
  { id: 'lead',    label: 'Display 728x90',    w: 1456, h: 180,  note: 'Leaderboard, at 2x' },
  { id: 'mobile',  label: 'Display 320x50',    w: 640,  h: 100,  note: 'Mobile banner, at 2x' },
  { id: 'skyline', label: 'Display 160x600',   w: 320,  h: 1200, note: 'Wide skyscraper, at 2x' },

  // Print. Every one of these exports with bleed and crop marks.
  { id: 'palm',    label: 'Palm card 4.25x11', w: 1275, h: 3300, dpi: 300, note: 'Rack card. Front or back.' },
  { id: 'hanger',  label: 'Door hanger 4.25x11', w: 1275, h: 3300, dpi: 300, die: 'hanger',
    note: 'Palm card trim with a hang die at the top.' },
  { id: 'walk',    label: 'Walk card 4x6',     w: 1200, h: 1800, dpi: 300, note: 'Pocket size, literature drop' },
  { id: 'flyer',   label: 'Flyer 8.5x11',      w: 2550, h: 3300, dpi: 300, note: 'Handout, table, lit drop' },
  { id: 'mail11',  label: 'Mail 11x5.5',       w: 3300, h: 1650, dpi: 300, note: 'Front or mail panel.' },
  { id: 'mail6',   label: 'Mail 11x6',         w: 3300, h: 1800, dpi: 300, note: 'Standard rate. Front or mail panel.' },
  { id: 'sign',    label: 'Yard sign 24x18',   w: 3600, h: 2700, dpi: 150, note: 'Landscape stake' },
  { id: 'sign-p',  label: 'Yard sign 18x24',   w: 2700, h: 3600, dpi: 150, note: 'Portrait stake' },
  { id: 'road',    label: 'Road sign 8x4 ft',  w: 4800, h: 2400, dpi: 50,  note: 'Big type only. Read at 40 mph.' },
];

/** The canvas record for an id, or the first one. */
export const canvasById = (id) => CANVASES.find((c) => c.id === id) || CANVASES[0];

export const TOKENS = [
  ['{{COUNTY}}', 'Rockingham'],
  ['{{DISTRICT}}', '25'],
  ['{{SEAT}}', 'Rockingham District 25'],
  ['{{TOWNS}}', 'Salem, or Derry and Londonderry'],
  ['{{TOWN}}', 'Salem, the first town listed'],
  ['{{PLACE}}', 'Salem Rockingham District 25'],
  ['{{REPUBLICANS}}', '9 Republicans, or 1 Republican'],
  ['{{TEAM}}', 'team, or candidate'],
  ['{{COUNT}}', '9'],
  ['{{SEATS}}', '9'],
  ['{{VOTEFOR}}', 'all 9, or one'],
  ['{{OVALS}}', 'all 9 ovals, or the oval'],
  ['{{SEATLINE}}', 'what this district elects, in a sentence'],
  ['{{NAMES}}', 'Ball, Huminick, Janigian and six more'],
  ['{{SURNAMES}}', 'Ball, Huminick, Janigian, ...'],
];

export const TEMPLATES = [
  {
    id: 'meet',
    label: 'Meet the slate',
    copy: {
      kicker: '{{SEAT}}',
      headline: 'Your Republican {{TEAM}} for {{TOWNS}}',
      subhead: '{{REPUBLICANS}} on the ballot for lower taxes and safer communities.',
      cta: '',
      footer: '',
    },
  },
  {
    id: 'vote',
    label: 'Vote Tuesday',
    copy: {
      kicker: '{{SEAT}}',
      headline: 'Vote Republican',
      subhead: 'Polls open Tuesday, November 3.',
      details: 'Bring a photo ID. Same-day registration is available at your polling place.',
      cta: 'Vote Republican on November 3',
      footer: '',
    },
  },
  {
    id: 'absentee',
    label: 'Absentee ballot',
    copy: {
      kicker: '{{SEAT}}',
      headline: 'Request your absentee ballot',
      subhead: 'If you cannot make it to the polls on November 3, vote from home.',
      details: 'Request the ballot from your town clerk.\nFill it out, sign the envelope, return it early.',
      cta: 'Ask your town clerk today',
      footer: '',
    },
  },
  {
    id: 'endorse',
    label: 'Endorsement',
    copy: {
      kicker: 'Endorsed',
      headline: 'Proud to support the {{SEAT}} Republican {{TEAM}}',
      subhead: '',
      cta: '',
      footer: '',
    },
  },
  {
    id: 'event',
    label: 'Event',
    copy: {
      kicker: 'Meet the candidates',
      headline: 'Town hall in {{TOWNS}}',
      subhead: 'Come meet the {{REPUBLICANS}} on your ballot.',
      details: 'Thursday, October 16\n6:30 PM\nAmerican Legion Post, Main Street',
      cta: 'All are welcome',
      footer: '',
    },
  },
  {
    id: 'thanks',
    label: 'Thank you',
    copy: {
      kicker: '{{SEAT}}',
      headline: 'Thank you, {{TOWNS}}',
      subhead: 'Your Republican {{TEAM}} is ready to get to work.',
      cta: '',
      footer: '',
    },
  },
  {
    id: 'allseats',
    label: 'Vote for all the seats',
    copy: {
      kicker: '{{SEAT}}',
      headline: 'Vote for {{VOTEFOR}}',
      subhead: '{{SEATLINE}}',
      details: 'Fill in the oval next to every Republican on the list.',
      cta: 'Fill in {{OVALS}}',
      footer: '',
    },
    style: { composition: 'ballot' },
  },
  {
    id: 'ballotguide',
    label: 'Ballot guide',
    copy: {
      kicker: 'How to vote {{SEAT}}',
      headline: 'Mark every one',
      subhead: 'Your ballot lists them in this order. Fill in {{OVALS}}.',
      details: '',
      cta: 'Vote Republican, November 3',
      footer: '',
    },
    style: { composition: 'ballot' },
  },
  {
    id: 'chase',
    label: 'Absentee chase',
    copy: {
      kicker: '{{SEAT}}',
      headline: 'Your ballot is still out',
      subhead: 'Town hall has not received it yet. It only counts if it gets back.',
      details: 'Sign the envelope. Seal it.\nMail it today, or drop it at the clerk.',
      cta: 'Send it back today',
      footer: '',
    },
  },
  {
    id: 'gotv72',
    label: '72 hours out',
    copy: {
      kicker: 'Three days left',
      headline: 'Polls close at 7',
      subhead: 'Tuesday, November 3. {{REPUBLICANS}} on your ballot in {{TOWNS}}.',
      details: 'No line is longer than four years of the alternative.',
      cta: 'Vote Tuesday',
      footer: '',
    },
  },
  {
    id: 'polling',
    label: 'Your polling place',
    copy: {
      kicker: '{{TOWNS}}',
      headline: 'Here is where you vote',
      subhead: 'Tuesday, November 3.',
      details: 'Polling place\nStreet address\nOpen 7:00 AM to 7:00 PM',
      cta: 'Bring a photo ID',
      footer: '',
    },
  },
  {
    id: 'register',
    label: 'Register at the polls',
    copy: {
      kicker: 'Not registered? Still vote.',
      headline: 'Register on Election Day',
      subhead: 'New Hampshire lets you register at your polling place and vote the same morning.',
      details: 'Bring a photo ID.\nBring proof you live in town.\nAllow yourself a few extra minutes.',
      cta: 'Same day, same ballot',
      footer: '',
    },
  },
  {
    id: 'volunteer',
    label: 'Volunteer recruit',
    copy: {
      kicker: '{{SEAT}}',
      headline: 'Knock doors with us',
      subhead: 'Two hours on a Saturday moves more votes than anything else we do.',
      details: 'Saturday, 10:00 AM\nMeet at the town common\nCoffee is on us',
      cta: 'Sign up to knock',
      footer: '',
    },
  },
  {
    id: 'donate',
    label: 'Chip in',
    copy: {
      kicker: '{{SEAT}}',
      headline: 'They are outspending us',
      subhead: 'Every dollar here goes to mail, doors and phones in {{TOWNS}}. Nothing else.',
      details: '',
      cta: 'Chip in today',
      footer: '',
    },
  },
  {
    id: 'record',
    label: 'The record',
    copy: {
      kicker: 'What this {{TEAM}} delivered',
      headline: 'Promises kept',
      subhead: '',
      details: '',
      cta: 'Send them back to Concord',
      footer: '',
      values: 'No income tax, No sales tax, Lower energy costs, Parents decide',
    },
    style: { composition: 'palmback' },
  },
  {
    id: 'palmback',
    label: 'Palm card back',
    copy: {
      kicker: 'Our record',
      headline: 'They keep their word',
      subhead: '',
      // The back generates its own oval instruction from the seat count, so a
      // call to action here would only be a second, stale copy of it.
      cta: '',
      values: 'No income tax, No sales tax, Safer streets, Parents decide',
      record: 'Held the line on spending\nStopped an income tax, again\nBacked local police and fire\nPut parents back in the classroom',
      callout: 'Concord works for you, not the other way around.',
      footer: '',
    },
    style: { composition: 'palmback' },
  },
  {
    id: 'contrast',
    label: 'Contrast',
    copy: {
      kicker: '{{SEAT}}',
      headline: 'The choice is clear',
      subhead: '',
      cta: 'Vote Republican, November 3',
      values: 'Lower taxes, Safer streets, Local control, Energy you can afford',
      contrast: 'An income tax, again\nHigher energy bills\nMandates from Concord\nParents shut out',
      footer: '',
    },
    style: { composition: 'versus' },
  },
  {
    id: 'spotlight',
    label: 'Candidate spotlight',
    copy: {
      kicker: '{{SEAT}}',
      headline: 'On your ballot',
      subhead: 'One of {{REPUBLICANS}} running in {{TOWNS}}.',
      callout: 'I am running to make this state affordable again.',
      cta: 'Vote Republican, November 3',
      footer: '',
    },
    style: { composition: 'spotlight' },
  },
  {
    id: 'poster',
    label: 'Social poster',
    copy: {
      kicker: '{{SEAT}}',
      headline: 'Vote {{CAND_LAST}} November 3',
      subhead: '',
      details: '',
      cta: 'Republican for State Representative',
      footer: '',
    },
    style: { composition: 'poster', flagBar: false },
  },
  {
    id: 'bare',
    label: 'Asset layer only',
    copy: { kicker: '', headline: '', subhead: '', details: '', cta: '', footer: '' },
    style: { bgType: 'transparent', flagBar: false },
  },
];

/* Palettes set the ground and both accents together, so a piece never ends up
 * half one scheme and half another. Green on navy is the Granite Guarantee look
 * and the default here; the red scheme is the one the transparent decks use. */
export const PALETTES = [
  {
    // The Granite Guarantee sheet itself: green and navy on white.
    id: 'guarantee', label: 'Granite Guarantee', ground: 'light',
    bgType: 'solid', bgColor: '#FFFFFF',
    accent: '#2F7C4E', plateColor: '#12314E', plateAccent: '#95DAB1',
    bar: ['#2F7C4E', '#12314E'],
  },
  {
    /* The committee's own mail colourway: navy type on white with the red
     * blocks, or white on navy with them. The Granite Guarantee sheet is green
     * and navy; the mail the committee has actually run is navy and red, and
     * both are brand. */
    id: 'classic', label: 'Classic red', ground: 'light',
    bgType: 'solid', bgColor: '#F4F5F7',
    accent: '#BF0A30', plateColor: '#12314E', plateAccent: '#FFFFFF',
    bar: ['#BF0A30', '#12314E'],
  },
  {
    id: 'classic-navy', label: 'Classic red on navy', ground: 'dark',
    bgType: 'solid', bgColor: '#12314E',
    accent: '#BF0A30', plateColor: '#0D2740', plateAccent: '#FFFFFF',
    bar: ['#BF0A30', '#FFFFFF'],
  },
  {
    id: 'navy', label: 'Navy', ground: 'dark',
    bgType: 'solid', bgColor: '#12314E',
    accent: '#2F7C4E', plateColor: '#0D2740', plateAccent: '#95DAB1',
    bar: ['#2F7C4E', '#95DAB1'],
  },
  {
    id: 'pine', label: 'Pine', ground: 'dark',
    bgType: 'gradient', bgColor: '#2F7C4E', bgColor2: '#235E3B',
    accent: '#12314E', plateColor: '#12314E', plateAccent: '#95DAB1',
    bar: ['#12314E', '#95DAB1'],
  },
  {
    id: 'granite', label: 'Granite', ground: 'dark',
    bgType: 'gradient', bgColor: '#12314E', bgColor2: '#235E3B',
    accent: '#2F7C4E', plateColor: '#0D2740', plateAccent: '#95DAB1',
    bar: ['#2F7C4E', '#95DAB1'],
  },
];

/* Ground options that keep whatever accents the palette set. */
export const GROUNDS = [
  { id: 'palette', label: 'Palette ground' },
  { id: 'image', label: 'Photo' },
  { id: 'transparent', label: 'Transparent' },
];

/* Toppers: whoever is at the top of the ticket this cycle, added to a slate
 * without being on it. A governor is not on the House ballot line and does not
 * get an oval, is not counted in the seats, and never closes a district's photo
 * gap. She is a face and a name on the piece, and nothing else.
 *
 * Adding next cycle's is one entry here, plus the portrait in public/cutouts. */
export const TOPPERS = [
  {
    id: 'ayotte',
    label: 'Governor Kelly Ayotte',
    name: 'Kelly Ayotte',
    first: 'GOV. KELLY',
    last: 'AYOTTE',
    slug: 'Kelly-Ayotte',
    tag: 'Governor',
    cutout: '/cutouts/Kelly-Ayotte.webp',
    topper: true,
  },
];

export const topperById = (id) => TOPPERS.find((t) => t.id === id) || null;

/* Fill {{TOKENS}} from a district record.
 *
 * `vars` carries the two kinds of thing the district record cannot: the lead
 * candidate on the piece, which comes off the slate somebody built, and the
 * facts a person has to type in because no file in this repository holds them.
 * An unknown token is left standing on purpose, so it shows up on the artwork
 * and in the warnings rather than quietly resolving to nothing. */
export function fillTokens(str, district, vars = {}) {
  /* Copy is not all strings. A round's comparison is a list of lines with a
   * direction on each, and running it through a string replace turned it into
   * "[object Object]" or, worse, into nothing at all and the block vanished off
   * the artwork with no warning. Anything that is not a string comes back as it
   * went in. */
  if (typeof str !== 'string') return str;
  if (!str || !district) return str || '';
  const surnames = district.nominees.map((n) => n.last.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()));
  /* Towns come off the district record. With none listed the tokens fall back
   * to the seat, which is always true and never wrong, just less useful than
   * the name of the place somebody lives. The app says when that happens. */
  const townList = [...new Set(district.towns || [])].filter(Boolean);
  const seat = `${district.county} ${district.district}`;
  const towns = townList.length
    ? (townList.length > 1
      ? `${townList.slice(0, -1).join(', ')} and ${townList[townList.length - 1]}`
      : townList[0])
    : seat;
  // 93 of 174 districts run a single nominee, so a template that always says
  // "9 Republicans" and "team" reads wrong on more than half the state.
  const n = district.nominees.length;
  /* 75 of the 174 districts elect a single member, and "Vote for all 1" and
   * "Fill in all 1 ovals" are not English. The seat count is a number; these
   * are the phrases built from it, so a template written once reads correctly
   * on every district in the state. */
  const seats = district.seats ?? district.nominees.length;
  const many = seats > 1;
  const map = {
    '{{VOTEFOR}}': many ? `all ${seats}` : 'one',
    '{{OVALS}}': many ? `all ${seats} ovals` : 'the oval',
    '{{SEATLINE}}': many
      // "the other 1" is what a computer writes. Two-seat districts are the
      // second most common kind in the state, so it is worth the branch.
      ? `This district elects ${seats}. A ballot with one name marked leaves the other `
        + `${seats - 1 === 1 ? 'one' : seats - 1} on the table.`
      : 'This district elects one member. Fill in the oval and your ballot counts.',
    '{{REPUBLICANS}}': `${n} Republican${n === 1 ? '' : 's'}`,
    '{{TEAM}}': n === 1 ? 'candidate' : 'team',
    '{{COUNTY}}': district.county,
    '{{DISTRICT}}': String(district.district),
    '{{SEAT}}': `${district.county} District ${district.district}`,
    '{{TOWNS}}': towns,
    '{{TOWN}}': townList[0] || seat,
    /* The line a mail piece puts under the names: the town first, because that
     * is the word a voter recognises, then the seat. With no town on file it is
     * the seat on its own rather than the seat said twice. */
    '{{PLACE}}': townList[0]
      ? `${townList[0]} ${district.county} District ${district.district}`
      : `${district.county} District ${district.district}`,
    '{{COUNT}}': String(district.nominees.length),
    '{{SEATS}}': String(district.seats ?? district.nominees.length),
    '{{SURNAMES}}': surnames.join(', '),
    '{{NAMES}}': surnames.length <= 3
      ? surnames.join(surnames.length === 2 ? ' and ' : ', ').replace(/, ([^,]*)$/, ' and $1')
      : `${surnames.slice(0, 2).join(', ')} and ${surnames.length - 2} more`,
  };
  /* The lead candidate is whoever is first on the slate as built. A piece that
   * names one person names the one at the top of it, which is the same person
   * whose face sits first in the strip. */
  const lead = vars.lead || null;
  if (lead) {
    const title = (t) => String(t || '').replace(/\b[A-Z]+\b/g, (x) => x[0] + x.slice(1).toLowerCase());
    map['{{CAND_NAME}}'] = lead.name || `${title(lead.first)} ${title(lead.last)}`.trim();
    map['{{CAND_FIRST}}'] = title(lead.first);
    map['{{CAND_LAST}}'] = title(lead.last);
  }
  for (const [k, v] of Object.entries(vars.typed || {})) {
    const text = String(v ?? '').trim();
    if (text) map[`{{${k}}}`] = text;
  }
  return String(str).replace(/\{\{[A-Z_]+\}\}/g, (m) => (m in map ? map[m] : m));
}

/* Filenames.
 *
 *   client-program-surface-size-audience-side-v01.ext
 *   nhgop-ballotguide-palm-4.25x11-rockingham-25-front-v01.png
 *
 * Lower case, hyphens, one field per slot, in that order. It sorts by client,
 * then by programme, then by surface, so a folder of four hundred files from a
 * dozen drops still groups itself. The old name led with the tag, which sorted
 * the whole programme apart the moment there was more than one of them.
 *
 * The size is the trim size in inches on a print canvas and the pixel size on
 * screen, because those are the numbers a printer and a platform ask for. */
/* Words and shapes that get a URL dropped by a filter list.
 *
 * EasyList sits behind uBlock Origin, AdBlock Plus and Brave. It blocks paths
 * and filenames carrying these, so the file serves fine, the browser drops it,
 * and a review page renders blank with nothing in the console saying why. A
 * template called "Display banner" put two of them in every filename it made.
 * They come out of the name; the piece is still whatever it is. */
const BLOCKABLE = /\b(ads?|adv|advert|advertisement|banner|banners|social|display|sponsor|sponsored|promo|popup|doubleclick)\b/g;
const ADSIZE = /\b\d{2,4}\s*x\s*\d{2,4}\b/g;

const hyphen = (v, fallback = '') => String(v ?? '').trim().toLowerCase()
  .replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') || fallback;

/* The same, for the free text fields, with the blockable words and anything
 * shaped like an ad size taken out first. The size field does not go through
 * this: a print trim is inches, 4.25x11 is a rack card and not a banner, and
 * that is the number the printer asks for. */
const safe = (v, fallback = '') => String(v ?? '').trim().toLowerCase()
  .replace(ADSIZE, ' ').replace(/[^a-z0-9.]+/g, ' ').replace(BLOCKABLE, ' ')
  .trim().replace(/\s+/g, '-') || fallback;

/* The size field: the trim in inches on a print canvas, and nothing at all on a
 * screen one.
 *
 * A screen size in a filename is an ad size in a filename, and EasyList blocks
 * those URLs. It sits behind uBlock Origin, AdBlock Plus and Brave, so the file
 * serves fine and the browser drops it, and a review page renders blank with
 * nothing in the console that says why. The canvas id is already in the surface
 * slot and tells the two apart, so the size is not carrying anything the name
 * needs. Show the pixels as text on the page instead; markup is never filtered. */
export function sizeField(canvas) {
  if (!canvas.dpi) return '';
  const trim = (n) => String(Math.round(n * 100) / 100);
  return `${trim(canvas.w / canvas.dpi)}x${trim(canvas.h / canvas.dpi)}`;
}

/**
 * @param {object} parts
 *   program   what the piece is for, from the template name
 *   surface   the canvas id
 *   canvas    the canvas record, for the size field
 *   audience  the district, or whatever the variant is
 *   side      'front' | 'back' | '' for a one-sided piece
 *   version   1 upward
 *   ext       png by default
 */
export function buildName({ client = 'nhgop', program, surface, canvas, audience,
  side = '', version = 1, ext = 'png' }) {
  const fields = [
    safe(client, 'nhgop'),
    safe(program, 'build'),
    safe(surface, 'canvas'),
    hyphen(sizeField(canvas || { w: 0, h: 0 })),
    safe(audience),
    safe(side),
    `v${String(version).padStart(2, '0')}`,
  ].filter(Boolean);
  return `${fields.join('-')}.${ext}`;
}

/** A filename that sorts and searches the way the rest of the folder does. */
export function buildFilename(district, canvas, tag = 'Build', extra = {}) {
  return buildName({
    program: tag,
    surface: canvas.id || `${canvas.w}x${canvas.h}`,
    canvas,
    audience: district ? `${district.county}-${district.district}` : '',
    ...extra,
  });
}
