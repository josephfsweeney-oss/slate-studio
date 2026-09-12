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
      id: 'contract', art: 'contract', n: 1, label: 'The Contract',
      front: {
        headline: 'We Put It In Writing',
        subhead: 'Seven promises, signed and mailed before you vote',
      },
      back: {
        headline: 'Ask The Other Side For Theirs',
        subhead: 'They will not put a number on it, or a ceiling on your taxes',
      },
    },
    {
      id: 'income-tax', art: 'statehouse', n: 2, label: 'No Income Tax',
      front: {
        headline: 'No Income Tax. No Sales Tax.',
        subhead: 'Protecting the New Hampshire advantage',
      },
      back: {
        headline: '193 Yes. 148 No. 236 Needed.',
        subhead: 'CACR 12 would have banned the income tax. It died in the House.',
      },
    },
    {
      id: 'school-tax', art: 'home', n: 3, label: 'Cap Your School Tax',
      front: {
        headline: 'Cap The Property Tax',
        subhead: 'Relief for {{TOWN}} homeowners',
      },
      back: {
        headline: 'We Gave You The Vote',
        subhead: 'HB 1300 caps school taxes at inflation. It is on your ballot.',
      },
    },
    {
      id: 'housing', art: 'framing', n: 4, label: 'Free Market Housing',
      front: {
        headline: 'Build More Homes',
        subhead: 'So your kids can afford to stay in {{TOWN}}',
      },
      back: {
        headline: 'Fifteen Bills. More Homes.',
        subhead: 'The 2025 housing package, passed in one session',
      },
    },
    {
      id: 'energy', art: 'grid', n: 5, label: 'Lower Energy Bills',
      front: {
        headline: 'Lower Your Electric Bill',
        subhead: 'More supply, not more mandates on your rate',
      },
      back: {
        headline: '26 Cents A Kilowatt',
        subhead: 'New Hampshire pays about 27 percent over the country',
      },
    },
    {
      id: 'health', art: 'bill', n: 6, label: 'Lower Health Care Costs',
      front: {
        headline: 'Know The Price First',
        subhead: 'Hospital and insurer prices, posted and public',
      },
      back: {
        headline: 'Prices Out In The Open',
        subhead: 'HB 705, enacted 2026. Hidden prices protect the system.',
      },
    },
    {
      id: 'parents', art: 'family', n: 7, label: 'Parents Decide',
      front: {
        headline: 'Parents Decide',
        subhead: 'Fund students, not systems',
      },
      back: {
        headline: '198 To 180. Not One Democrat.',
        subhead: 'HB 115 opened Education Freedom Accounts to every family',
      },
    },
    {
      id: 'close', art: 'town', n: 8, label: 'The Close',
      front: {
        headline: 'Seven Promises. In Writing.',
        subhead: 'Hold us to every one of them',
      },
      back: {
        headline: 'Two Votes. One Ballot.',
        subhead: 'Vote the slate, and vote yes on the school tax cap',
      },
    },
  ],
}];

/* The two lines every side carries, whatever the issue on it is. The district
 * line names the town first, because that is the word a voter recognises, and
 * the call to action says when. A side of this programme that does not tell
 * somebody when to vote has not finished. */
export const SIDE_COMMON = {
  footer: '{{PLACE}}',
  cta: 'Vote Republican November 3',
};

export const programById = (id) => MAIL_PROGRAMS.find((p) => p.id === id) || null;

/** A piece, by programme and piece id. */
export function pieceById(programId, pieceId) {
  const p = programById(programId);
  return p ? p.pieces.find((x) => x.id === pieceId) || null : null;
}

/** The style for one side of a piece. */
export function sideStyle(piece, side) {
  const base = side === 'back' ? BACK_LOOK : LOOK;
  return {
    ...base,
    railSide: piece.railSide || 'right',
    mailPanel: side === 'back' ? 'right' : 'none',
  };
}

/** The bundled photograph for a piece, or null. */
export const artUrl = (piece) => (piece && piece.art ? `/art/${piece.art}.webp` : null);

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
  subhead: 'No income tax. A cap on your school tax. More homes. Lower bills.',
};

export const MAIL_VARS = [
  { key: 'TAX_RATE', label: 'School tax rate', placeholder: '$14.72', hint: 'Per thousand, from the town rate sheet.' },
  { key: 'OPP_LAST', label: 'Opponent surname', placeholder: 'Spahr', hint: 'The member whose vote the piece names.' },
  { key: 'OPP_VOTE', label: 'How they voted', placeholder: 'no', hint: 'From the roll call, in their own column.' },
  { key: 'POLL_HOURS', label: 'Polling hours', placeholder: '7 AM to 7 PM', hint: 'From the town clerk.' },
  { key: 'POLL_PLACE', label: 'Polling place', placeholder: 'Salem High School', hint: 'From the town clerk.' },
];
