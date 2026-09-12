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
  ['{{TOWNS}}', 'Salem'],
  ['{{REPUBLICANS}}', '9 Republicans, or 1 Republican'],
  ['{{TEAM}}', 'team, or candidate'],
  ['{{COUNT}}', '9'],
  ['{{SEATS}}', '9'],
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
      headline: 'Vote for all {{SEATS}}',
      subhead: 'This district elects {{SEATS}}. A ballot with one name marked leaves the rest on the table.',
      details: 'Fill in the oval next to every Republican on the list.',
      cta: 'Fill in all {{SEATS}} ovals',
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
      subhead: 'Your ballot lists them in this order. Fill in all {{SEATS}} ovals.',
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

/** Fill {{TOKENS}} from a district record. */
export function fillTokens(str, district) {
  if (!str || !district) return str || '';
  const surnames = district.nominees.map((n) => n.last.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()));
  const towns = (district.towns && district.towns.length)
    ? [...new Set(district.towns)].join(', ')
    : `${district.county} ${district.district}`;
  // 93 of 174 districts run a single nominee, so a template that always says
  // "9 Republicans" and "team" reads wrong on more than half the state.
  const n = district.nominees.length;
  const map = {
    '{{REPUBLICANS}}': `${n} Republican${n === 1 ? '' : 's'}`,
    '{{TEAM}}': n === 1 ? 'candidate' : 'team',
    '{{COUNTY}}': district.county,
    '{{DISTRICT}}': String(district.district),
    '{{SEAT}}': `${district.county} District ${district.district}`,
    '{{TOWNS}}': towns,
    '{{COUNT}}': String(district.nominees.length),
    '{{SEATS}}': String(district.seats ?? district.nominees.length),
    '{{SURNAMES}}': surnames.join(', '),
    '{{NAMES}}': surnames.length <= 3
      ? surnames.join(surnames.length === 2 ? ' and ' : ', ').replace(/, ([^,]*)$/, ' and $1')
      : `${surnames.slice(0, 2).join(', ')} and ${surnames.length - 2} more`,
  };
  return String(str).replace(/\{\{[A-Z_]+\}\}/g, (m) => (m in map ? map[m] : m));
}

/** A filename that sorts and searches the way the rest of the folder does. */
export function buildFilename(district, canvas, tag = 'Build') {
  const slug = (tag || 'Build').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `NHGOP-${slug}-${district.county}-${district.district}-${canvas.w}x${canvas.h}.png`;
}
