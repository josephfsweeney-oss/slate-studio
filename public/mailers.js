/* The Granite Guarantee mail programme.
 *
 * Eight two-sided 11 x 6 mailers. Every piece is a claim on the message side
 * and the receipt for it on the address side, in that order, because a promise
 * with nothing behind it is a slogan and a roll call with nothing in front of
 * it is a spreadsheet.
 *
 * The copy here is transcribed from the Granite Guarantee mailer artwork. Every
 * bill number, vote count and quotation came off that artwork. They are claims
 * about real votes by real people, so check them against the journal before a
 * drop goes out. Nothing in this file was written by the app.
 *
 * This programme is a slate piece. The roster on it is the whole district, so
 * the copy speaks for the whole district: "not one of them", "your Republican
 * team", "every name on this card". It named one person once, which put one
 * name over nine faces and read as a piece nobody had looked at. A piece about
 * one candidate is a different job, and the social poster is that job.
 *
 * Tokens fill per district. {{TAX_RATE}}, {{OPP_LAST}}, {{OPP_VOTE}},
 * {{POLL_HOURS}} and {{POLL_PLACE}} are facts the app does not hold: they are
 * typed in the Mail variables panel, and a piece that still shows one of them
 * is not finished.
 */

/* Held on both sides so the two halves of a piece cannot drift apart.
 *
 * Colour is not in here. The palette owns colour, and a programme that pinned
 * its own white ground meant switching to Navy or Pine did nothing to a mail
 * piece. What the programme owns is structure: which composition, which side
 * the rail is on, and the two devices it does without. */
const LOOK = {
  composition: 'promise',
  flagBar: false,
  twoTone: false,
  silhouette: false,
};

const BACK_LOOK = {
  ...LOOK,
  composition: 'proof',
  /* The carrier's corner prints blank. The mail house sets the indicia, the
   * return address, the address block and the barcode, and they set the paid
   * for line with them. Nothing of ours goes in there, not even a guide.
   *
   * That means this artwork carries no disclaimer. RSA 664:14 still applies to
   * the finished piece, so the disclaimer has to arrive with the panel. Say so
   * to the mail house in writing; the handoff note does. */
  mailPanelBlank: true,
};

const ROLE = 'State Representative, {{COUNTY}} District {{DISTRICT}}';

export const MAIL_PROGRAMS = [{
  id: 'granite-guarantee',
  label: 'Granite Guarantee',
  canvas: 'mail6',
  note: 'Eight two-sided 11 x 6 mailers. An issue on each side, the slate on both.',
  pieces: [
    {
      id: 'contract', shape: 'guarantee', art: 'contract', n: 1, label: 'The Contract',
      /* 11 x 5.5, which is the trim the opener prints on. The lockup splits on
       * a landscape trim: the mark holds the left at full height and the four
       * words stand in a column down the right. */
      palette: 'guarantee', canvas: 'mail11',
      /* The guarantee as the committee publishes it, in the committee's own
       * words and its own order. Seven promises, numbered, nobody's face on it.
       * The address side carries the slate. */
      guarantee: {
        kicker: 'New Hampshire House Republicans',
        headline: 'Granite Guarantee',
        list: ['Lower costs', 'No new taxes', 'Safer streets', 'More freedom'],
      },
      front: {
        headline: 'We Put It In Writing',
        /* The piece that opens the programme has to say what is in it. A
         * guarantee nobody can read is not a guarantee, and the other seven
         * rounds each argue one of these lines. */
        list: [
          'No income tax',
          'No sales tax',
          'A cap on your property tax',
          'More homes, less red tape',
          'Lower electric bills',
          'Prices posted before you pay',
          'Parents choose the school',
        ],
      },
      back: {
        headline: 'Republicans Are Fighting For New Hampshire',
        /* The seven, in the corner the carrier is not standing in. The front of
         * this round is the lockup and the four words; this is where the
         * promises themselves are actually read. */
        list: [
          'Ban an income tax. Forever',
          'Cap your property tax',
          'Cut even more red tape',
          'Lower energy bills',
          'Lower health care costs',
          'Parents decide',
          'Support public safety',
        ],
      },
    },
    {
      id: 'income-tax', art: 'statehouse', n: 2, label: 'No Income Tax',
      /* 11 x 6, so the opener and the round behind it do not land the same
       * size two weeks running. */
      palette: 'granite', canvas: 'mail6',
      contrast: {
        mark: 'form',
        art: 'c-tax',
        kicker: 'CACR 12 died forty-three votes short',
        headline: 'One Vote From Closing It For Good',
        versus: [
          { dir: 'no', text: 'Democrats would not close the door on an income tax' },
          { dir: 'yes', text: 'Republicans voted to write the ban into the constitution' },
        ],
        source: 'CACR 12. 193 yes, 148 no. 236 needed.',
      },
      front: {
        headline: 'No Income Tax. Not Ever.',
        subhead: 'It is the reason New Hampshire is still worth living in.',
      },
      back: {
        headline: 'Forty-Three Votes Short',
        subhead: 'Republicans voted to ban it for good. It died in the House.',
      },
    },
    {
      id: 'school-tax', art: 'home', n: 3, label: 'Cap Your Property Tax',
      palette: 'classic', canvas: 'mail11',
      contrast: {
        mark: 'stairs',
        art: 'c-house',
        kicker: 'Your property tax has no ceiling',
        headline: 'It Climbs Every Single Year',
        versus: [
          { dir: 'no', text: 'Democrats will let it keep climbing' },
          { dir: 'yes', text: 'Republicans put a cap at inflation on your ballot' },
        ],
        source: 'HB 1300.',
      },
      front: {
        headline: 'Your Property Tax Gets A Ceiling',
        subhead: 'Capped at inflation. Not at whatever the district asks for.',
      },
      back: {
        headline: 'Republicans Gave You The Vote',
        subhead: 'The cap is on your ballot. Vote yes, and vote for the people who put it there.',
      },
    },
    {
      id: 'housing', art: 'house', n: 4, label: 'Free Market Housing',
      palette: 'guarantee', canvas: 'mail6',
      contrast: {
        mark: 'sold',
        art: 'c-home',
        kicker: 'Red tape, not lumber, is what stops a house',
        headline: 'Cut The Red Tape. Build The Homes.',
        versus: [
          { dir: 'no', text: 'Democrats will keep the rules that stop a house going up' },
          { dir: 'yes', text: 'Republicans are cutting the red tape that holds the market back' },
        ],
        source: 'The 2025 housing package. Fifteen bills in one session.',
      },
      front: {
        headline: 'Your Kids Cannot Afford To Live Here',
        subhead: 'Republicans are cutting the red tape that holds the housing market back.',
      },
      back: {
        headline: 'Fifteen Bills. One Session.',
        subhead: 'House Republicans worked with Governor Ayotte to cut the red tape.',
      },
    },
    {
      id: 'energy', art: 'grid', n: 5, label: 'Lower Energy Bills',
      palette: 'navy', canvas: 'mail11',
      contrast: {
        mark: 'meter',
        art: 'c-meters',
        kicker: 'What you pay for the same electricity',
        headline: 'Two Sides. Two Directions.',
        versus: [
          { dir: 'up', text: 'Democrats are fighting to increase your bills' },
          { dir: 'down', text: 'Republicans are fighting to lower your bills' },
        ],
        source: '',
      },
      front: {
        headline: 'You Pay 27 Percent Over The Country',
        subhead: 'For the same electricity. That is a policy choice, not the weather.',
      },
      back: {
        headline: 'More Supply. Lower Bills.',
        subhead: 'Republicans voted for supply. Democrats voted for mandates that land on your bill.',
      },
    },
    {
      id: 'health', art: 'bill', n: 6, label: 'Lower Health Care Costs',
      palette: 'classic', canvas: 'mail6',
      contrast: {
        mark: 'redacted',
        art: 'c-hospital',
        kicker: 'They kept the prices out of sight',
        headline: 'You Were Never Meant To See The Bill',
        versus: [
          { dir: 'no', text: 'Democrats will leave the prices hidden' },
          { dir: 'yes', text: 'Republicans and Governor Ayotte put them in the open' },
        ],
        source: 'HB 705, enacted 2026.',
      },
      front: {
        headline: 'Know The Price First',
        subhead: 'You would not buy anything else this way.',
      },
      back: {
        headline: 'Prices Out In The Open',
        subhead: 'House Republicans and Governor Ayotte opened the books. The system liked them closed.',
      },
    },
    {
      id: 'parents', art: 'family', n: 7, label: 'Parents Decide',
      palette: 'granite', canvas: 'mail11',
      contrast: {
        mark: 'door',
        art: 'c-classroom',
        kicker: 'HB 115, on Education Freedom Accounts',
        headline: 'Who Decides Where Your Child Goes',
        versus: [
          { dir: 'no', text: 'Not one Democrat voted to let you choose' },
          { dir: 'yes', text: 'Republicans opened the accounts to every family' },
        ],
        source: 'HB 115. Passed 198 to 180.',
      },
      front: {
        headline: 'Parents Decide. Not Bureaucrats.',
        subhead: 'Every family in New Hampshire, not only the ones who can afford to move.',
      },
      back: {
        headline: '198 To 180. Not One Democrat.',
        subhead: 'That is the vote that opened Education Freedom Accounts to every family.',
      },
    },
    {
      id: 'close', shape: 'ballot', art: 'town', n: 8, label: 'The Close',
      palette: 'classic-navy', canvas: 'mail6',
      /* The closing round shows the ballot itself, marked. Eight weeks of the
       * same shape is one piece arriving eight times; the last one in the door
       * is the one that has to look like an instruction. */
      ballot: {
        kicker: 'November 3',
        headline: 'Support The Whole Ticket',
        subhead: 'Governor Ayotte needs a Republican House. Vote every Republican on your ballot.',
        details: 'Fill the oval beside every name. Then keep going down the ballot.',
      },
      front: {
        headline: 'Support The Whole Ticket',
        subhead: 'Governor Ayotte needs a Republican House. Vote every Republican on your ballot.',
      },
      back: {
        headline: 'Vote All The Way Down',
        subhead: 'Give Governor Ayotte the House she needs, and yes on the property tax cap.',
      },
    },
  ],
}];

/* The two lines every side carries, whatever the issue on it is. The district
 * line names the town first, because that is the word a voter recognises, and
 * the call to action says when. A side of this programme that does not tell
 * somebody when to vote has not finished. */
export const SIDE_COMMON = {
  /* No district line. A voter knows the town they live in and does not know
   * which numbered House district it sits in, so the line cost a piece a
   * quarter inch and told nobody anything. */
  footer: '',
  cta: 'Vote Republican Up & Down The Ballot Nov. 3rd',
  /* The date on its own, for the block that stands beside a short slate. The
   * call to action carries it in a sentence; the block carries it big. */
  voteDate: 'November 3',
};

export const programById = (id) => MAIL_PROGRAMS.find((p) => p.id === id) || null;

/** A piece, by programme and piece id. */
export function pieceById(programId, pieceId) {
  const p = programById(programId);
  return p ? p.pieces.find((x) => x.id === pieceId) || null : null;
}

/** The style for one side of a piece. */
export function sideStyle(piece, side, useContrast) {
  /* A round can give its message side a shape of its own. Eight weeks of the
   * same shape is one piece arriving eight times. */
  if (useContrast && side !== 'back' && piece && piece.shape && piece[piece.shape]) {
    return { ...LOOK, composition: piece.shape, mailPanel: 'none' };
  }
  /* The message side of an issue round can drop the faces and make the case
   * instead. The address side always carries the slate: a piece that never
   * shows the team is not a slate piece. */
  if (useContrast && side !== 'back' && piece && piece.contrast) {
    return {
      ...LOOK,
      composition: 'contrast',
      mark: piece.contrast.mark || '',
      markArt: piece.contrast.art || '',
      mailPanel: 'none',
    };
  }
  const base = side === 'back' ? BACK_LOOK : LOOK;
  return {
    ...base,
    railSide: piece.railSide || 'right',
    mailPanel: side === 'back' ? 'right' : 'none',
  };
}

/** The copy a side carries: the contrast block when it is on, else the issue. */
export function sideCopyFor(piece, side, useContrast) {
  if (!piece) return null;
  if (useContrast && side !== 'back') {
    if (piece.shape && piece[piece.shape]) return piece[piece.shape];
    if (piece.contrast) return piece.contrast;
  }
  return piece[side];
}

/** The colourway and the trim a round is drawn in, or nulls for the default. */
export const pieceLook = (piece) => ({
  palette: (piece && piece.palette) || null,
  canvas: (piece && piece.canvas) || null,
});

/** The bundled photograph for a piece, or null. */
export const artUrl = (piece) => (piece && piece.art ? `/art/${piece.art}.webp` : null);

/** The photograph that stands in the contrast side's panel, or null. */
export const contrastArtUrl = (piece) =>
  (piece && piece.contrast && piece.contrast.art ? `/art/${piece.contrast.art}.webp` : null);

/* One back for the whole drop.
 *
 * Eight different backs is eight plate changes and eight chances to bind the
 * wrong side to the right front. One back gangs, and the only thing on it that
 * changes district to district is the carrier's corner, which the mail house
 * fills anyway. The receipt each piece was carrying moves onto its own front,
 * where the claim it answers already is.
 *
 * The per piece backs are still in this file. Turn the shared back off and they
 * come back, and that is the version to run when the drop is worth the plates:
 * a roll call under a claim is the strongest thing in this programme. */
export const SHARED_BACK_ART = '/art/portsmouth.webp';

/* One back for the whole drop.
 *
 * Eight different backs is eight plate changes and eight chances to bind the
 * wrong side to the right front. One back gangs, and the only thing on it that
 * changes district to district is the slate and the carrier's corner. Turn the
 * shared back off and each piece carries the receipt for its own claim, which
 * is the version to run when the drop is worth the plates. */
export const SHARED_BACK = {
  headline: 'Seven Promises. In Writing.',
  subhead: 'Ban an income tax. Cap your property tax. Cut the red tape. Lower the bills.',
};

export const MAIL_VARS = [
  { key: 'TAX_RATE', label: 'School tax rate', placeholder: '$14.72', hint: 'Per thousand, from the town rate sheet.' },
  { key: 'OPP_LAST', label: 'Opponent surname', placeholder: 'Spahr', hint: 'The member whose vote the piece names.' },
  { key: 'OPP_VOTE', label: 'How they voted', placeholder: 'no', hint: 'From the roll call, in their own column.' },
  { key: 'POLL_HOURS', label: 'Polling hours', placeholder: '7 AM to 7 PM', hint: 'From the town clerk.' },
  { key: 'POLL_PLACE', label: 'Polling place', placeholder: 'Salem High School', hint: 'From the town clerk.' },
];
