/* Canvas sizes and copy templates.
 *
 * Templates carry tokens that get filled per district, so one piece of copy can
 * build all 174 districts in a batch run. */

export const CANVASES = [
  { id: '1x1',     label: 'Square feed',      w: 1080, h: 1080, note: 'Instagram, X, Facebook feed' },
  { id: 'link',    label: 'Link card',        w: 1200, h: 628,  note: 'Facebook link preview, display' },
  { id: '16x9',    label: '16:9 slate',       w: 1920, h: 1080, note: 'Video slate, slide, OTT end card' },
  { id: 'story',   label: 'Story / Reel',     w: 1080, h: 1920, note: 'Instagram and Facebook stories' },
  { id: 'x-post',  label: 'X post',           w: 1600, h: 900,  note: 'X timeline image' },
  { id: 'email',   label: 'Email header',     w: 1200, h: 400,  note: 'Mailchimp header band' },
  { id: 'palm',    label: 'Palm card 5.5x8.5', w: 1650, h: 2550, note: '300 dpi, print' },
  { id: 'postcard', label: 'Mail 6x9',        w: 2700, h: 1800, note: '300 dpi, print' },
  { id: 'sign',    label: 'Yard sign 24x18',  w: 3600, h: 2700, note: '150 dpi, large format' },
];

export const TOKENS = [
  ['{{COUNTY}}', 'Rockingham'],
  ['{{DISTRICT}}', '25'],
  ['{{SEAT}}', 'Rockingham District 25'],
  ['{{TOWNS}}', 'Salem'],
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
      headline: 'Your Republican team for {{TOWNS}}',
      subhead: '{{COUNT}} Republicans on the ballot. One team for lower taxes and safer communities.',
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
      cta: 'Vote the whole slate',
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
      headline: 'Proud to support the {{COUNTY}} {{DISTRICT}} Republicans',
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
      subhead: 'Come meet the Republicans on your ballot.',
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
      subhead: 'Your Republican team is ready to get to work.',
      cta: '',
      footer: '',
    },
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
  const map = {
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
