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
  note: 'Eight two-sided 11 x 6 mailers. Claim on the front, receipt on the back.',
  pieces: [
    {
      id: 'contract', art: 'contract', railSide: 'right', n: 1, label: 'The Contract',
      front: {
        kicker: 'New Hampshire House Republicans',
        headline: 'We Put It In Writing',
        subhead: 'Seven promises, signed and mailed before you vote, not after.',
        record: 'No income tax. No sales tax.\nCap your school tax.\nFree market housing.\n'
          + 'Lower energy bills.\nLower health care costs.\nParents decide.\nSafe communities.',
        details: '',
        footer: ROLE,
        brief: 'The printed contract held in two hands, or the State House at first light. '
          + 'New Hampshire, recognizably.',
      },
      back: {
        kicker: 'The contract',
        headline: 'Ask The Other Side For Theirs',
        record: 'They will not put a number on what they want to spend, or a ceiling on what they want to tax.\n'
          + 'You cannot hold anyone to a promise they refuse to make.',
        callout: '',
        source: '',
        cta: 'Hold us to every one of them.',
        brief: 'The seven promises printed as a signed document, photographed flat.',
      },
    },
    {
      id: 'income-tax', art: 'statehouse', railSide: 'left', n: 2, label: 'No Income Tax',
      front: {
        kicker: 'The income tax',
        headline: 'They Had One Chance To Ban The Income Tax',
        subhead: 'Republicans voted to write the ban into the state constitution. It failed by 43 votes.',
        record: '',
        details: '{{CAND_NAME}} will never vote for an income tax or a sales tax. '
          + 'Not this term. Not ever.',
        footer: ROLE,
        brief: 'State House dome against a hard sky, shot from below. Cold light.',
      },
      back: {
        kicker: 'CACR 12, May 14, 2026',
        headline: '193 Yes. 148 No. 236 Needed.',
        record: 'CACR 12 would have barred the legislature from ever passing an income tax.\n'
          + 'It passed the Senate 16 to 8. It died in the House.\n'
          + 'All but four House Democrats voted against it. {{OPP_LAST}} voted {{OPP_VOTE}}.',
        callout: 'Why should we handcuff or bind future legislatures?',
        source: 'Rep. Terry Spahr, D-Hanover, on the income tax ban',
        cta: '',
        brief: "Crop of the CACR 12 roll call sheet with the target member's line visible.",
      },
    },
    {
      id: 'school-tax', art: 'home', railSide: 'right', n: 3, label: 'Cap Your School Tax',
      front: {
        kicker: 'On your ballot November 3',
        headline: 'Cap Your School Tax',
        subhead: 'Republicans put a school tax cap on the November 3 ballot in every city and town. '
          + 'Your vote sets it.',
        record: '',
        details: '{{TOWN}} pays {{TAX_RATE}} per thousand. The cap holds school taxes to inflation.',
        footer: ROLE,
        brief: 'A modest single family home in {{TOWN}} at golden hour. Not a mansion. Not a stock suburb.',
      },
      back: {
        kicker: 'HB 1300, signed into law',
        headline: 'We Gave You The Vote. They Fought It.',
        record: 'HB 1300 caps school taxes at inflation, plus new construction.\n'
          + 'It passed the House and Senate largely along party lines.\n'
          + 'Three fifths of your neighbors must vote yes. That is a turnout number.',
        callout: 'Someone must act, our voters are being taxed out of their homes.',
        source: 'Rep. Ross Berry, R-Weare',
        cta: 'Vote yes on the cap. November 3.',
        brief: 'Crop of a property tax bill, the school line legible, the rate circled in red.',
      },
    },
    {
      id: 'housing', art: 'framing', railSide: 'left', n: 4, label: 'Free Market Housing',
      front: {
        kicker: 'Housing',
        headline: 'We Changed The Law So We Can Build',
        subhead: 'You cannot bring rents down without more homes. '
          + 'Fifteen housing reform bills passed in one session.',
        record: '',
        details: '{{CAND_NAME}} will keep cutting the rules that price your kids out of {{TOWN}}.',
        footer: ROLE,
        brief: 'A framing crew on a house going up. Daylight, real site, real tools.',
      },
      back: {
        kicker: 'The 2025 housing package',
        headline: 'Fifteen Bills. One Result: More Homes.',
        record: 'HB 577 makes a detached accessory dwelling unit legal by right, statewide.\n'
          + 'Towns can no longer force those units below 750 square feet.\n'
          + 'Every rule that adds a year to a project adds thousands to the price.',
        callout: '',
        source: '',
        cta: '',
        brief: 'A stack of permit paperwork, or a for rent sign with the price visible.',
      },
    },
    {
      id: 'energy', art: 'grid', railSide: 'right', n: 5, label: 'Lower Energy Bills',
      front: {
        kicker: 'Your electric bill',
        headline: '26 Cents A Kilowatt',
        subhead: 'New Hampshire pays about 27 percent more for power than the country does. '
          + 'Bills come down when we build.',
        record: '',
        details: 'More supply. More transmission. Fewer mandates riding on your rate.',
        footer: ROLE,
        brief: 'Transmission lines running to the horizon at dusk. Scale and distance.',
      },
      back: {
        kicker: 'Your winter bill',
        headline: 'Supply Is The Only Thing That Lowers A Bill',
        record: 'More generation, more transmission, fewer mandates on the rate.\n'
          + 'Targets do not produce a kilowatt. Plants and lines do.\n'
          + 'Every program added to the rate shows up on the bill you already cannot pay.',
        callout: '',
        source: '',
        cta: '',
        brief: 'Crop of an electric bill, the supply rate line legible.',
      },
    },
    {
      id: 'health', art: 'bill', railSide: 'left', n: 6, label: 'Lower Health Care Costs',
      front: {
        kicker: 'What it costs',
        headline: 'Know The Price Before You Pay It',
        subhead: 'Republicans made hospital and insurer prices public and free to look up.',
        record: '',
        details: 'You should not need the bill to learn the cost.',
        footer: ROLE,
        brief: 'A hospital billing statement open on a kitchen table, coffee cup at the edge.',
      },
      back: {
        kicker: 'HB 705, enacted 2026',
        headline: 'Prices Out In The Open',
        record: 'HB 705 requires posted in network pricing and maximums for out of network charges.\n'
          + 'Historical pricing published, free and public.\n'
          + 'Hidden prices protect the system. Posted prices protect the patient.',
        callout: '',
        source: '',
        cta: '',
        brief: 'A posted price list or a phone showing the public price lookup.',
      },
    },
    {
      id: 'parents', art: 'family', railSide: 'right', n: 7, label: 'Parents Decide',
      front: {
        kicker: 'Your child’s school',
        headline: 'Fund Students, Not Systems',
        subhead: 'Republicans opened Education Freedom Accounts to every family in New Hampshire, '
          + 'whatever they earn.',
        record: '',
        details: 'Parents pick the school. Parents see the curriculum.',
        footer: ROLE,
        brief: 'Parents and children at a kitchen table with schoolwork. Warm light. No classroom stock.',
      },
      back: {
        kicker: 'HB 115, House roll call, March 13, 2025',
        headline: '198 To 180. Not One Democrat.',
        record: 'HB 115 removed the income cap on Education Freedom Accounts.\n'
          + 'No House Democrat voted yes. Ten Republicans voted no.\n'
          + 'They did not argue about the money. They argued about who decides.',
        callout: '',
        source: '',
        cta: '',
        brief: 'Crop of the HB 115 roll call sheet, 198 to 180 visible.',
      },
    },
    {
      id: 'close', art: 'town', railSide: 'left', n: 8, label: 'The Close',
      front: {
        kicker: 'Tuesday, November 3',
        headline: 'Seven Promises. In Writing.',
        subhead: 'No income tax. No sales tax. A cap on your school tax. More homes. '
          + 'Lower bills. Parents deciding. Police backed up.',
        record: '',
        details: 'Vote {{CAND_LAST}} for State Representative.',
        footer: ROLE,
        brief: '{{CAND_NAME}} full frame, outdoors in the district, talking with voters.',
      },
      back: {
        kicker: 'Tuesday, November 3',
        headline: 'Two Votes. One Ballot.',
        record: 'Vote {{CAND_LAST}} for the New Hampshire House.\n'
          + 'Vote yes on the school tax cap question. It needs three fifths.\n'
          + 'Polls open {{POLL_HOURS}} at {{POLL_PLACE}}.',
        callout: '',
        source: '',
        cta: 'Hold us to every one of them.',
        brief: 'A sample ballot showing the candidate line and the tax cap question together.',
      },
    },
  ],
}];

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

export const SHARED_BACK = {
  kicker: 'The Granite Guarantee',
  headline: 'Seven Promises. In Writing.',
  record: 'No income tax. No sales tax.\nA cap on your school tax, on your ballot November 3.\n'
    + 'Free market housing, so your kids can afford to stay.\nLower energy bills.\n'
    + 'Lower health care costs, with the price posted before you pay it.\n'
    + 'Parents deciding.\nSafe communities.',
  callout: 'Ask the other side for theirs.',
  source: '',
  cta: 'Hold us to every one of them.',
  brief: '',
};

/* The variables the app cannot look up. Every one of these is a fact about a
 * district, an opponent or a polling place, and the app inventing any of them
 * would put a made up number on a piece of mail. */
export const MAIL_VARS = [
  { key: 'TAX_RATE', label: 'School tax rate', placeholder: '$14.72', hint: 'Per thousand, from the town rate sheet.' },
  { key: 'OPP_LAST', label: 'Opponent surname', placeholder: 'Spahr', hint: 'The member whose vote the piece names.' },
  { key: 'OPP_VOTE', label: 'How they voted', placeholder: 'no', hint: 'From the roll call, in their own column.' },
  { key: 'POLL_HOURS', label: 'Polling hours', placeholder: '7 AM to 7 PM', hint: 'From the town clerk.' },
  { key: 'POLL_PLACE', label: 'Polling place', placeholder: 'Salem High School', hint: 'From the town clerk.' },
];
