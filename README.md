# Slate Studio

Turn the transparent slate decks in Drive into finished graphics. Pick a
district, type the copy, and the layout fits itself to that slate on any canvas
you ask for. Ten faces on a link card and one face on a yard sign both come out
looking built on purpose.

The decks in `2026 Slate Decks` are asset layers. This is the thing that
finishes them.

## Run it

```
cp .env.example .env      # optional on the first run
npm start                 # http://localhost:5173
```

No dependencies. Node 18.17 or newer, nothing to install.

It starts on the bundled manifest: all 174 districts and 330 nominees, with
placeholder portraits. Connect Drive and the real cutouts drop in.

### Connect Drive

1. Google Cloud console, **APIs & Services → Credentials → Create credentials →
   OAuth client ID**, type **Web application**.
2. Authorised redirect URI: `http://localhost:5173/auth/callback`. It must match
   `BASE_URL` exactly.
3. Enable the **Google Drive API** for that project.
4. Put the client id and secret in `.env`, restart, then open
   `/auth/google` (the **Connect Drive** button).

The app asks for `drive.readonly` to read the decks and `drive.file` to write
finished graphics into a folder it creates called **Slate Studio Builds**. It
cannot touch anything else in your Drive.

### Or skip Google entirely

Point it at the folder on the Mac that builds the decks:

```
SLATE_LOCAL_DIR="/path/to/2026 Slate Decks" npm start
```

Same app, reading `Decks/`, `Cutouts/` and `build/roster.json` off disk.

## What it does

**Where the faces come from.** By default the app imports `Cutouts/`, the 187
background-free portraits, and rebuilds the slate grid for each district and
each canvas. It uses the same maths as `build/make_decks.py`: the same 4:5
portrait, the same 0.34 plate, the same column solve, the same surname
step-down. So it matches the built decks, and it also fits canvases no deck
exists for, and it can give the copy room instead of fighting it.

Under **Slate → Faces** you can switch to **the built deck layer** instead. That
places the approved `NHGOP-Slate-<County>-<District>-<variant>-<W>x<H>.png`
whole, picking the file closest in shape to the canvas and matching the
name-plate setting. Use it when you want the exact asset that was signed off.
The trade: a deck was composed to fill a whole canvas, so once copy takes space
the deck shrinks as one block and brings its own margins with it. A district
that never built falls back to the cutouts and says so.

**Fits the slate.** The engine solves the grid, the type scale and the split
between copy and faces together. Longer copy shrinks the type before it crowds
the faces; a bigger slate takes space back from the copy. It picks the
composition from the canvas shape, and you can override it:

| Canvas | What it reaches for |
|---|---|
| 16:9, link card, email header | copy beside the faces |
| square | copy above or below, depending on slate size |
| story, palm card, yard sign | copy stacked over the faces |
| one nominee, any canvas | the spotlight |
| a display rail, 4.5:1 or thinner | the strip |

**Fourteen layouts.** Five solve the copy and the grid together; the rest are
designed pieces that take the slate, a number, or the line itself as the
subject.

| Layout | What it is for |
|---|---|
| Copy above / below / beside the faces | the ordinary feed and mail work |
| Faces only | an asset layer somebody else finishes |
| **Spotlight** | one candidate large, the rest as chips. The 93 single-nominee districts, and a member posting to their own feed |
| **Contrast** | two columns, ours and theirs. A choice reads faster than a claim |
| **Ballot guide** | the ballot as the voter will see it, every oval filled, with the seat count generated from the district record |
| **Display rail** | a leaderboard or a skyscraper: a few faces, one line, one pill |
| **Numbers lead** | one number set large, its label small, the rest as a proof row. For selling a policy or a project |
| **Document** | reads like a bill, because a bill gets read. The highest response rates on cost-of-living mail |
| **Type led** | the headline is the image. For when the line is the whole argument, or the photos are weak |
| **Palm card front** | the 4.25 x 11 rack card |
| **Palm card back** | the record, the issues, one line worth remembering, then the ovals |

Each is one of the archetypes in the `campaign-design-templates` skill, named
the way that skill names them, so asking for a different one is one word.

**Nineteen canvases** out of the box, plus any custom size. Download at 1x or
2x, copy straight to the clipboard, or save to Drive.

| | |
|---|---|
| Screen | square feed, link card, 16:9, story, X post, email header |
| Display | 300x250, 728x90, 320x50, 160x600, all at 2x |
| Print | palm card 4.25x11, **door hanger 4.25x11**, walk card 4x6, flyer 8.5x11, mail 11x5.5 and 11x6, yard sign both ways, road sign 8x4 ft |

Every print canvas declares its dpi, which is what unlocks **Print ready**:
trim size plus an eighth of an inch of bleed, crop marks, and a slug line. The
door hanger also carries its die: the top 2.25 inches are the tab, nothing is
laid out in them, and the hole and the tab line are drawn as guides so no face
gets punched out. The printer still cuts from their own die, so send the trim
size and ask for a proof.

**QR codes are real ones.** Put a link in and the piece carries a working QR
code at high error correction, dark on light, with a four module quiet zone and
the URL set in text beside it for the people who would rather read it. One inch
square in print, three quarters of an inch is the floor, and the app warns below
it. The encoder is written out in `public/qr.js` because there are no runtime
dependencies here and a dead code kills a whole drop. It is not trusted because
the code reads correctly: the tests put the rendered pixels through a real
decoder and compare the string that comes back. Two bugs were caught that way
that no amount of reading would have found.

**Both sides at once.** On a print canvas, **Both sides** builds the pair from
the same copy, names them front and back, and hands back a ZIP with a
`handoff.txt`: trim, bleed, crop marks, dpi, colour mode, the die on a door
hanger, the mail panel, the disclaimer as supplied, the decoded QR string, the
preflight checks, and everything the app flagged. A mail piece is one job with
two sides, and sending them one at a time is how a drop goes out with side two
from last week.

**The mail panel is a corner, not a column.** Four inches by two and a quarter
in the lower right of the trim, which is all the indicia, return address,
address block and barcode clear zone need. The space above it is the best real
estate on the piece and now gets used: proof on the left, the slate upper
right, the carrier's corner below.

**Top of the ticket.** Under **Slate**, add Governor Kelly Ayotte to any piece.
She is a face and a name on the design and nothing else: she is not on the
House ballot line, so she gets no oval on the ballot guide or the palm card
back, she is not counted in the seats, and she never closes a district's photo
gap. Next cycle's is one entry in `TOPPERS` plus the portrait.

**Filenames that sort.** `client-program-surface-size-audience-side-v01.ext`,
lower case and hyphenated:

```
nhgop-ballot-guide-palm-4.25x11-rockingham-25-back-v01.png
nhgop-absentee-chase-mail11-11x5.5-rockingham-25-front-v01.png
```

The size is the trim in inches on a print canvas and pixels on screen, because
those are the numbers a printer and a platform ask for. A folder of four hundred
files from a dozen drops groups itself.

**A sign is not a flyer.** On any piece over 16 inches the app measures the
headline it just set and tells you how tall it came out in inches against what
the distance needs. Three inches for a yard sign, six for a road sign. It also
counts the words on a road sign, because nobody reads more than about eight at
forty miles an hour.

**Four colour combinations**, all green and navy. Press **C** to cycle them, or
use the **Colors** button. Every value is editable as hex if you need an exact
brand colour.

**Character budgets.** Not enforced. The engine shrinks the copy to fit as one
voice, which is what lets it build 174 districts unattended, and the design
skill would rather you cut the copy. Both are right; the difference is whether
a person is looking. The budgets are in
`.claude/skills/campaign-design-templates/references/copy-slots.md` and worth
handing to whoever writes the copy.

**Nineteen copy templates**, from Meet the slate to the absentee chase, the 72
hour push, the polling place card, same-day registration, the volunteer ask, the
donate ask, the record, the contrast and the ballot guide. A template that needs
a particular layout switches to it; one that does not hands the canvas back the
choice.

**Towns and sitting members** are two optional columns on
`data/slate-manifest.csv`, both semicolon separated, both empty as shipped:

```
County,District,...,Towns,Incumbents
Rockingham,25,...,Salem,Joe Sweeney; John Sytek
Rockingham,7,...,Derry; Londonderry,
```

`Towns` makes `{{TOWNS}}` say "Salem" or "Derry and Londonderry" instead of
falling back to "Rockingham 25", and gives you `{{TOWN}}` for the anchor town.
`Incumbents` puts **Rep.** in front of a sitting member, on the first-name line
of the plate and of the ballot row. Never on the surname: the surname is what a
voter matches against the ballot and nothing goes in front of it. A name in
`Incumbents` that is on nobody's ballot in that district is reported as a stray,
because a typo there puts Rep. in front of the wrong person.

Neither is guessed. A row with both columns blank reads exactly as it did
before. Under **Design**, "Put Rep. in front of sitting members" turns the
honorific off for a piece that does not want it.

Until the columns are filled, the **Rep.** button on each roster row marks
somebody for the piece in front of you. Those ticks live in your browser, so
**Copy them for the manifest** hands back the rows to paste into the file, where
they belong and where everybody gets them.

**Tokens** fill per district, so one piece of copy builds the whole state:
`{{SEAT}}`, `{{COUNTY}}`, `{{DISTRICT}}`, `{{TOWNS}}`, `{{COUNT}}`, `{{NAMES}}`,
`{{SURNAMES}}`, `{{SEATS}}`, `{{REPUBLICANS}}`, `{{TEAM}}`, `{{TOWN}}`.

Three of them carry phrasing rather than a number, because 75 of the 174
districts elect a single member and "Vote for all 1" is not English:

| | one seat | nine seats |
|---|---|---|
| `{{VOTEFOR}}` | one | all 9 |
| `{{OVALS}}` | the oval | all 9 ovals |
| `{{SEATLINE}}` | This district elects one member. Fill in the oval and your ballot counts. | This district elects 9. A ballot with one name marked leaves the other 8 on the table. |

**The undervote is the other photo gap.** 81 of the 174 districts elect more
than one member and 237 of the 330 nominees run in one of them. A voter who
marks a single name in a nine seat district hands the other eight away. The
ballot guide and the palm card back both generate the instruction from the
district record rather than from anything anybody types, so the number of ovals
is right on all 174 pieces.

**Batch build** runs that copy across every portrait-ready district, or one
county, or whatever you tick, at every canvas you pick, and hands back a ZIP.

**The disclaimer is not optional.** A finished political ad needs one under
RSA 664:14. Export stays locked until the field is filled, or until you tick
"asset layer, no disclaimer" for a layer somebody else will finish. It is
prefilled with the registered Committee to Elect House Republicans line; a
deployment for another committee sets `SLATE_DISCLAIMER`.

**Missing headshots stay visible.** 143 of 330 nominees still have no usable
photo. Those tiles render as a marked placeholder rather than dropping the
candidate off their own slate, and the warning names who is missing.

## How it fits

`public/layout.js` is the engine and it is pure. It takes a slate, the copy and
a canvas, and returns rectangles. It never touches a canvas element, so the same
plan drives the live preview and the export and the two cannot drift.

Brand tokens, the 4:5 portrait aspect, the name-plate proportions and the
surname step-down all match `build/make_decks.py`, so these read as the same
family of assets as the decks in Drive.

```
server/     http, Google OAuth, Drive reads, the district catalog
public/     the builder: layout engine, painter, UI
data/       the bundled manifest, so it works before Drive is connected
test/       node --test
```

`npm test` covers the engine: every slate size on every canvas, no overflow, no
overlapping tiles, copy that shrinks instead of spilling, and the manifest
totals against the deck build.

## Public mode

The app closes the credential-backed routes itself whenever there is nothing
behind them. A copy that ships its own portraits and holds no Drive credential
is shut on arrival: no flag, no settings page, no step anyone has to remember.
A service-account key is read-only by construction, so writes stay shut there
too. The one route that stays open is sign-in when an OAuth client is
configured and nobody has used it yet, because locking the owner out of their
own deployment helps nobody.

Set `SLATE_PUBLIC=1` anyway. It closes the same routes by declaration, so
adding a credential later cannot quietly reopen them. `npm run verify` will
tell you to set it.

These are the routes in question:

| Route | Why it is closed |
|---|---|
| `POST /api/save` | otherwise an unauthenticated write into your Drive |
| `/auth/signout` | otherwise any passer-by can revoke the app's Drive access |
| `/auth/google`, `/auth/callback` | no stranger starts an OAuth flow against your client |
| `?refresh=1` | a full Drive re-crawl on demand burns your API quota |

It also rate limits the portrait and deck routes to 600 requests per IP per ten
minutes, and the browser drops the **Save to Drive**, **Refresh Drive** and
**Connect Drive** buttons. In public mode the app takes its Drive token from
`GOOGLE_REFRESH_TOKEN`, so authorise on your own machine and paste it in.

The rate limit is held in memory. On a serverless host that means per instance,
so treat it as a speed bump, not a guarantee. On Render it is one process and
it holds.

**The photo gap is public on purpose.** Everyone gets the district list, the
nominee names and the portraits. A candidate with no usable headshot gets a tile
marked PHOTO NEEDED, with their name plate under it, sitting in the middle of
their own slate. Eight faces and one hole is a better ask than an eighth email.

Two things make that usable:

- **Copy link** puts `?d=<County>-<District>` on the clipboard. Send a candidate
  the link and they land on their own slate, with a line telling them how many
  faces are placeholders and why. `?c=` and `?p=` carry the canvas and the
  colours if you want to pin those too.
- **Photo gap**, in the district filters, counts how many nominees still owe a
  headshot and how many districts are complete, and flags every slate that is
  **one headshot from done**. Those are the cheap wins: one photo turns a broken
  slate into a finished one.
- **The photo button on every roster row** means the candidate who opens that
  link can fix it themselves. They drop their headshot in, see it on their own
  slate, and send back a correctly named file. See Changing a candidate's photo.

If you would rather not show the gap, `SLATE_PUBLIC_READY_ONLY=1` offers only
districts whose portraits are all present. That is 85 districts instead of 174,
and it is off by default.

## Hosting it

**Read this first.** A hosted copy reads Drive with whatever credential it is
given. The app shuts the routes that could hand that access away when it has no
credential, but set `SLATE_PUBLIC=1` on any deployment that is not behind a
password so adding one later stays safe.

GitHub Pages cannot run it. Pages serves static files only, and this app needs a
server to hold the Drive credential and to pass the portraits to the browser.

### One tap, from a phone

[**Deploy on Vercel**](https://vercel.com/new/import?s=https://github.com/josephfsweeney-oss/slate-studio)
· [**Deploy on Render**](https://render.com/deploy?repo=https://github.com/josephfsweeney-oss/slate-studio)

Both read the config in this repo and ask for one value: the service-account
key. Get that first, below.

Vercel is the easier of the two and fine for this app: the portrait and catalog
responses carry `s-maxage`, so its CDN holds them and Drive is reached about
once per portrait per region per day rather than on every cold start. It has no
disk, so the on-disk cache and the in-memory rate limit are per instance. Render
has a disk and one process, which makes both of those hold properly, but it
costs a little and the free tier sleeps.

Vercel deploys by pulling from GitHub, so once the project exists every push to
`main` redeploys on its own. There is no `git push vercel`; Vercel is not a git
host.

### Check it before you share it

```
npm run verify -- https://your-deployment
```

It checks the site from the outside: that it answers, that the credentials
loaded, that it is really reading Drive and not the bundled fallback, that a
portrait loads with CDN cache headers, and that `POST /api/save`,
`/auth/signout`, `/auth/google` and `/auth/callback` all refuse. Any failure
exits non-zero and says "do not share the link yet", with the reason.

A credential-holding copy with `SLATE_PUBLIC` unset trips seven checks at once,
which is the point: the routes that would let a stranger write to your Drive or
revoke the site's access are exactly the ones it tests. A copy with no
credential passes and is told to set the flag anyway. Add `--private` for a
password-gated copy, where those routes are meant to stay open.

### The short path: a service account

A service account is the right credential for a server that reads one fixed
folder. There is no OAuth client, no consent screen, no redirect URI and no
browser round trip, and the key is scoped to `drive.readonly`, so a hosted copy
cannot write to Drive even if a write route were somehow reachable.

1. In the Google Cloud console, enable the **Google Drive API**, then
   **IAM & Admin → Service Accounts → Create**. Add a key, type JSON, and
   download it.
2. In Drive, share the `2026 Slate Decks` folder with the service account's
   email, as **Viewer**. It ends in `.iam.gserviceaccount.com`.
3. On Render, **New → Blueprint**, point at this repo. `render.yaml` sets
   everything except one value.
4. Paste the whole JSON key file into `GOOGLE_SERVICE_ACCOUNT_JSON`. Deploy.

That is the entire setup. `BASE_URL` fills itself in from Render's own
`RENDER_EXTERNAL_URL` (and from `VERCEL_URL` on Vercel), so it does not need
setting.

If Drive is unreachable, the app does not go down: it falls back to the bundled
manifest with placeholder portraits and shows the reason, so a key pasted short
or a folder not yet shared reads as a fixable message rather than an outage.

### The other path: your own Google account

If you would rather it read Drive as you, create an OAuth client (type **Web
application**, redirect URI `<BASE_URL>/auth/callback`), set `GOOGLE_CLIENT_ID`
and `GOOGLE_CLIENT_SECRET`, run `npm start` locally, approve at `/auth/google`,
then `npm run token` and set the result as `GOOGLE_REFRESH_TOKEN`. This is what
you want for a private copy that also writes finished graphics back to Drive.
A public copy cannot write in either case.

## Running it with no server at all

```
npm run build:static        # -> dist/
```

Produces a copy that needs nothing behind it: the district catalog is inlined
into the page and the portraits are packed into thirteen texture atlases, which
the page slices at load time. Serve `dist/` from anywhere, or publish it.

Two constraints shaped that. A published Artifact holds at most **256 files**,
and there are 301 portraits, so one file each is impossible; atlases are packed
in district order, so opening a district usually pulls one file rather than ten.
And a sandboxed page cannot start a download by itself, so saving a graphic goes
through the host's download capability, with a confirmation the viewer sees.

This build step is the one thing here that needs a dependency, a browser to
encode WebP and draw the atlases:

```
npm install --no-save playwright && npx playwright install chromium
```

`npm start`, `npm test` and `npm run verify` still need nothing.

## Changing a candidate's photo

Click the face in the roster on the right. That is the whole control.

The editor opens on whatever is there now. Choose a photo, drag it into the 4:5
frame, scroll or drag the slider to zoom. The panel beside it shows the result
standing on the plate, which is the only place it is ever seen.

**Cut the background out** flood fills from the edge of the frame, clearing
anything that reaches it and matches the corners, then trims to what is left.
That is what makes a phone photo sit next to a real cutout instead of floating
in a grey rectangle. It switches itself on when the four corners agree, which is
a plain wall or a studio backdrop, and stays off when they do not. **Edge**
moves the tolerance: up if a rim of wall is left, down if it is eating the
candidate.

Then pick where it goes.

| | What it does | Where it works |
|---|---|---|
| **Use this photo** | That candidate on every canvas, every district, straight away | Anywhere. It is kept in this browser, in IndexedDB, and nowhere else |
| **Make it the default** | Writes `public/cutouts/<Slug>.webp` and rewrites `data/cutouts.json` | Only where the app is running on a real checkout. `git add` those two, push, done |
| **Download for the repo** | Hands back the file, named the way the roster resolves it | Anywhere, including the hosted copy and the Artifact |

A photo added here counts as a face everywhere the app counts faces: the
PHOTO NEEDED tile goes, the district loses its dot, **Photo gap** stops listing
it, and **one headshot from done** updates. It is a real fix, not a preview.

Added photos collect at the foot of the roster panel, with **Download them for
the repo** for the lot at once. The zip has a `HOW-TO.txt` in it and the files
are already named correctly, so a candidate can add their own headshot on the
public site, send you the zip, and it drops straight into `public/cutouts/`.

Where a photo is already a default, **Remove the default** takes it back out of
`public/cutouts` and the index. The candidate goes back to PHOTO NEEDED, which
is the honest state when the file is wrong.

The route that writes these files closes itself unless the app is running on a
writable checkout, so the hosted copy offers the download and not the write.
The filename is checked against `<Slug>.webp|png` and then against the roster:
a name that is not a portrait, and a slug nobody is standing for, never reach
the disk.

## After adding or replacing a portrait by hand

Only needed when the file was copied in rather than added through the app. The
app reindexes itself.

```
npm run index:cutouts
```

`data/cutouts.json` lists the portrait filenames and the server reads that,
not the folder. On a serverless host the function is bundled with `data/` and
not with `public/`, so listing the folder there finds nothing, even while the
CDN is serving every one of those images perfectly well. The symptom is a site
that looks fine except every face is a placeholder. A test fails if the index
drifts from the folder.

## A note on the Drive folder id

`server/config.js` defaults to the id of the `2026 Slate Decks` folder so the
app works on a fresh clone. That id is not a credential. Access is controlled by
Drive's own permissions and by the OAuth token, and the id alone opens nothing.
It is still a pointer at somebody's Drive, so if this repo is ever made public,
move it to `SLATE_DRIVE_FOLDER_ID` in the environment and let the code fall back
to looking the folder up by name.

## Known limits

- Strafford 1 is unsettled. DeLemus and Dow tied at 265 votes for the second
  seat. Three names show for two seats and the app flags it.
- The 2024 Canva photos are two cycles old. Look before they go out.
- Portraits come through the server so the browser can read the pixels. First
  load of a district fetches from Drive, after that it is cached on disk.
- The background knockout in the photo editor is a flood fill, not the pipeline
  that produced the 301 shipped cutouts. On a plain wall it is as good. On a
  busy room, or hair against a dark background, it is not, and the preview on
  the plate is there to show you before it goes anywhere. A photo that will not
  knock out cleanly is better sent for a proper cutout.
- The QR encoder tops out at version 10 at high error correction, which is 119
  bytes. That is a short URL, which is what the code should point at anyway. A
  longer string is refused with the reason rather than truncated.
- The document layout mimics a bill on purpose. Every figure on it has to be
  defensible, which is why the source line is not optional there and the app
  says so when it is empty.
- Towns and incumbency ship empty. They are facts about 174 districts and
  nobody should invent them, least of all this app. Fill the two columns from
  whatever list you already trust.
- The contrast layout takes the other side's record from a field somebody
  types. Nothing checks it. Get it wrong in public and it is a correction, so
  source every line before it ships.
- The ballot guide draws the ovals the way New Hampshire prints them, in the
  roster's surname order, with the seat count off the district record. It is a
  guide, not a sample ballot: it shows the Republicans and nobody else.
- Photos added in the browser live in that browser. A different machine, a
  different profile or a cleared site data and they are gone. Make them the
  default, or download them, the moment they are right.

## The Granite Guarantee mail programme

Eight two-sided 11 x 6 mailers, under **Mail program** at the top of the
Content panel. Pick the programme and the app sets the canvas, both layouts and
both sides' copy; pick a piece and switch sides with the two buttons. **Both
sides** exports the pair with crop marks and a handoff note.

One rule sets both sides, from a district with one candidate to a district with
eight: **the slate takes the width it needs and the words take what is left.**
Nothing is keyed to the size of the slate, because one district's four faces and
another's are not the same width. The row is measured, and what is left over
decides the shape.

    a small slate leaves most of the piece
        the faces hold the left at full height
        the headline, the line under it, the district and the call to action
        stand beside them in the column they leave

    a middling slate leaves a block
        the words go back over the top of the faces
        the block beside them carries the supporting line, the date and
        VOTE FOR ALL FOUR

    a full slate leaves nothing
        the row is centred and the words are over the top, which is where
        this started

Every round carries a photograph that matches the issue it argues: the State
House for the income tax, a framer on a wall for housing, transmission towers
for energy, Main Street in Nashua for the close. It is the ground of the whole
piece, edge to edge and under everything, with a veil over it that is heaviest
at the top where the words are and lightest across the middle where the faces
stand. `public/art/CREDITS.md` says which photograph is which, who took it and
where it came from. **Background photo** on the Design panel turns it off.

### Eight drops, not one piece eight times

Six of the eight rounds used to be the same piece with the words swapped. Three
things change through the drop now.

| Round | Colourway | Trim | Message side |
|---|---|---|---|
| 1 The Contract | Granite Guarantee | 11 x 6 | the guarantee, numbered |
| 2 No Income Tax | Granite | 11 x 5.5 | contrast |
| 3 Cap Your Property Tax | Classic red | 11 x 6 | contrast |
| 4 Free Market Housing | Granite Guarantee | 11 x 5.5 | contrast |
| 5 Lower Energy Bills | Navy | 11 x 6 | contrast |
| 6 Lower Health Care Costs | Classic red | 11 x 5.5 | contrast |
| 7 Parents Decide | Granite | 11 x 6 | contrast |
| 8 The Close | Classic red on navy | 11 x 5.5 | the ballot, marked |

Never the same colourway twice running and never the same trim twice running. A
different size in the hand reads as a different piece before a word of it is.
**Give each round its own colourway and trim** turns both off for anyone who
wants to set them by hand.

The address side stays the slate on all eight, and that is deliberate. That side
is the identification, and the repetition there is the whole point: eight weeks
of the same faces in the same order is how a voter matches eight names on a
ballot.

Colour alone will not carry eight weeks. The shape is what does, and there are
three of them so far against six rounds of contrast. The rounds that should get
their own shape next are the income tax (the roll call, type only, no
photograph) and health care (an itemised bill with the prices blacked out).

### Type size

**Headline size** and **Body size** on the Design panel. Both are ceilings, not
sizes: the engine fits everything to the space it has, and these move the height
it is allowed to reach. A line still has to fit the width it is set in, so
asking for bigger only gets bigger while there is room across. A bigger headline
takes its room from the faces, and the floor the slate reserves moves with the
dial, so the ask is honoured rather than swallowed by a reserve nobody can see.

### The contrast side

A slate piece has two jobs and cannot do both well on one side. The six issue
rounds now split them. **Contrast on the message side** turns it on, and it is
on by default.

    the message side   the case against them, nobody's face on it
    the address side   the slate, the district, and the ask

Rounds one and eight keep the slate on both sides. They are the identification
pieces, and a piece that never shows the team is not a slate piece. The cost of
the split is real: one side of faces instead of two is half the impressions, and
in a House race the job is getting six or eight names matched on a ballot. Six
rounds is the trade worth making. Eight is not.

The contrast side is dark on purpose, so it does not look like the side with the
people on it, and it carries a drawing rather than a photograph:

| Round | Mark | What it draws |
|---|---|---|
| No Income Tax | `form` | A return with the line that matters filled in for you |
| Cap Your Property Tax | `stairs` | A staircase with no top step |
| Free Market Housing | `sold` | A single family home behind a picket fence |
| Lower Energy Bills | `meter` | A bill that climbs, with this month on the end of it |
| Lower Health Care Costs | `redacted` | An invoice with the prices taken out |
| Parents Decide | `door` | The schoolhouse door, with somebody standing in it |

Each of those is a photograph now, edge to edge: the picture is the ground of
the piece, and the words sit on the left of it under a scrim that is heaviest
where they are and lets go across the picture. The drawings stay in
`public/render.js` as the fallback when no photograph is loaded, and a round
that asks for a drawing rather than a photograph gets a panel on the right
instead of a ground.

The marks are geometry, not photographs and not generated art. A photograph of a tax form is a photograph. A drawing of one is an
argument, it costs nothing, it carries no licence, and it is as sharp at 300 dpi
as at 72.

Nothing on that side is set in a colour that cannot be read on the ground under
it. The Granite Guarantee green on the Granite Guarantee navy measures 2.6 to 1,
which is under the floor for text of any size, so accent type on a dark ground
uses the palette's own light accent, and where a palette has none the accent is
lifted toward white until it carries. Brand colour that cannot be read is not
brand colour. A test holds every palette to 4.5 to 1.

Every issue round argues the same shape and says something different in it: a
line naming what they will do, then a line answering with what Republicans did.
Theirs is always first and ours always answers, because the answer is the half
you want read last.

The mark says which is which before a word of it is read. A cost going up or
down takes a crooked diagonal, the shape a rate makes on a chart: it runs on the
angle and kinks against itself on the way, with shorter crooked streaks trailing
behind, so a bill going up looks like it is going up fast and not gliding there.
Drawn in `public/render.js`. The energy round runs those. Everything else takes a
cross or a tick, because an arrow pointing at a school choice means nothing.
Against is red, for is the readable accent.

`versus` in `public/mailers.js` is a list of `{ dir, text }`. `dir` is `up` or
`no` for theirs and `down` or `yes` for ours. A test holds all six rounds to
that order, to two lines each, and to saying six different things.

Every contrast side ends on a source line: the bill, the roll call, the date. A
side that attacks a record and does not cite it is a side you cannot defend.
Where the record is not in the file the line prints empty and the app says so in
the warnings, which is the point. Fill it before the drop.

The round that opens the programme is the guarantee itself, laid out the way the
committee publishes it: the lockup, the seven promises numbered down the page,
and the line that names them across the foot. Nobody's face on that side. The
committee's own version is a portrait poster, so the lockup takes the left and
the promises take the right rather than the whole thing being letterboxed into a
strip with two feet of white either side.

The seven are the committee's words in the committee's order. Six of them have a
round of their own in the drop. **Support public safety** does not, and that is
worth knowing before the schedule is signed off.

`list` also works on a band as a ticked checklist, which is what the opener used
before the real artwork arrived.

The candidates are the lowest thing on the piece. The district line and the call
to action sit above them, and the name band runs off the bottom of the paper, so
the slate stands on the floor of the piece rather than a quarter inch above it.

No card, no tile, no plate. A face in a box is a database record; a row of faces
at the same height standing on the same band is a team, and the band labels them
once instead of six times. Everybody fills the same height, and a wide crop is
trimmed at the sides rather than scaled down, so nobody ends up shorter than the
row and floating above the band. One face on its own may stand taller than the
rest, because it has no neighbour to crowd.

The message side is eleven inches wide with nothing in the way. The address side
is an L: the carrier owns the bottom two and a quarter inches of the right hand
four and nothing else, so the slate takes the full width above that line and the
words go under it on the left. Eight faces run across that line in one row.

**Montage six or more on the address side** stacks them instead: two rows, the
back row offset half a face so its people stand in the gaps of the front row,
and one name band under the whole group carrying a line of names for each row.
It is off by default, because one row across eleven inches is bigger.

No disclaimer on either side. The print shop sets the paid-for line with the
indicia, the address block and the barcode, because they are all one job and it
is theirs. RSA 664:14 still applies to the finished piece, so the handoff note
says so and the work order has to as well.

The stack is measured from the foot up, so a longer headline costs the faces
height rather than pushing the call to action off the bottom.

Two colourways, both derived from the palette rather than written down. On a
light ground the headline is plain type with an accent rule under it and the
name band is the plate colour. On a dark ground the headline sits in a solid
accent block and the band is the accent. **Classic red** and **Classic red on
navy** are the committee's own mail colours.

The copy runs on general facts, not on facts about the voter. Every round argues
a statewide number or a recorded vote: forty-three votes short of banning the
income tax, twenty-seven percent over the country on electricity, fifteen
housing bills in one session, 198 to 180 with not one Democrat. Nothing on the
artwork has to be looked up per district, so a drop builds for all 174 without
anybody typing anything.

One structure, eight times. The message side says what this costs you. The
address side proves it and says what to do about it. The credit goes to the
party, not to the signers: Republicans voted, Democrats voted the other way.
Every side closes on the same line, **Vote Republican Down The Ballot November
3**, and the eighth round is the whole ticket: support it on the message side,
vote all the way down on the address side.

Governor Ayotte is on four of the sixteen sides: the housing package and the
price transparency law say House Republicans worked with her, and both sides of
the close make her the reason to vote the whole ticket. The first two are
characterisations of how a bill got through, not vote records, so check them
before a drop goes out. The two on the close are an ask, not a claim. `public/mailers.js` holds
every line; every number in it was transcribed from the Granite Guarantee
artwork. Check them against the journal before a drop goes out.

The token fields (`{{TAX_RATE}}`, `{{OPP_LAST}}`, `{{OPP_VOTE}}`,
`{{POLL_HOURS}}`, `{{POLL_PLACE}}`) still work, and they are kept per district,
so Salem's rate never travels to Keene. The panel only shows a field when the
copy in front of you actually uses that token, so with the programme as written
it shows none. `{{TOWN}}` and `{{PLACE}}` come off the manifest's Towns column;
with it empty the district line reads "Rockingham District 25" rather than
"Salem Rockingham District 25", which is true and less useful.

The carrier's corner prints blank: the mail house sets the indicia, the return
address, the address block and the barcode.

The copy is transcribed from the Granite Guarantee mailer artwork. Every bill
number, vote count and quotation in `public/mailers.js` came off that artwork.
Check them against the journal before a drop goes out.

## Names only

Under **Faces** in the Slate panel, a third option: no photograph anywhere on
the piece, and the name plate takes the whole tile the face would have had.

A yard sign read at forty miles an hour is names. A road sign is names. And a
district whose portraits have not come in yet is names today rather than
placeholders today and a reprint next week.

It applies to the finished plan rather than to one layout, so every composition
in the app gets it at once: the tile goes short and wide, the grid gives the
width back to the name, and no warning about a missing photograph fires,
because on this piece there is no photograph to miss.

## The palettes reach the type

Granite Guarantee, Navy, Pine and Granite set the ground, and everything on the
piece follows it. On Navy and Pine a palm card prints on navy or green stock
with the type reversed out, the mastheads become a deeper cut of that stock
rather than a fixed navy, and the tints behind the faces and the issue cells
lift off it instead of sinking into it.

That was not true before. The card layouts forced white stock whatever the
palette said, so switching to Navy changed nothing on a palm card and the words
stayed dark on paper that never arrived.

Two things stay light on purpose. A ballot card is printed on paper and has to
read as paper, so the ballot layout keeps its white card whatever the ground is.
And a marked oval is now solid: a pen mark fills the oval, it does not leave a
ring of paper inside one.

## The CTEHR rules, and where this app stands against them

**Shape.** No pills anywhere. Four pixels is the maximum radius, which on a
3300 pixel 300 dpi sheet is a hundredth of an inch, so everything here is
square. The one thing that was a pill, the call to action, is a clipped block:
two corners cut on the diagonal, the same treatment the buttons on the sites
wear. The roster card is square with an accent edge down its side rather than
the rounded corner, drop shadow and border pattern.

**Filenames.** No ad size and no ad word ever reaches a filename. A screen
canvas contributes no size field at all, and the free text fields are scrubbed
of `ad`, `banner`, `social`, `display`, `sponsor`, `promo` and anything shaped
like `300x250`. EasyList blocks those URLs, the file serves fine, the browser
drops it, and a review page renders blank with nothing in the console saying
why. A print trim in inches is not an ad size and stays: `4.25x11` is a rack
card. The canvas id is in the name and tells the surfaces apart on its own.

**Ad sizes.** The three placement canvases match: Square feed is 1080 x 1080,
Story is 1080 x 1920, Link card is 1200 x 628. Nothing is squashed: a canvas
change re-solves the layout at the new size rather than scaling a finished
render.

**Three things this app does not do yet, and cannot decide on its own.**

*Norwester.* Headings here are Anton. Norwester is not in the repository and I
will not substitute a lookalike and call it Norwester. Send the licensed woff2
and it becomes the display face, set at one weight and uppercase, the way the
rule says.

*Real New Hampshire photography.* Nine photographs ship with the mail
programme. Four are genuinely New Hampshire: the State House in Concord,
Portsmouth, Dover, a New England cape. Five are generic stock: a framing crew,
a family at a table, transmission towers, a medical bill, a signed contract.
They are not colour blocks standing in for a photograph, but they are not
Granite State imagery either. Point me at the committee's photo library and
they get replaced.

*Generated graphics.* The rule says every graphic is generated with
gpt-image-2, and that hand assembly and headless Chrome were both tried and
rejected. This app is headless Chrome. That is not an oversight to route
around: a generator cannot place Susan Vandecasteele's cutout above her own
name, in ballot order, in 174 districts, and be right every time. Deterministic
layout is the whole reason this exists. Read the rule as covering illustrative
graphics for the sites, and this as a different tool, or tell me otherwise and
we will talk about what that means.

## Photos

Click the **+** beside a name on the Slate panel and the editor opens with
whatever portrait is on file already loaded. Drag to move it, scroll or use the
slider to zoom, then **Use this photo**. The frame is the 4:5 tile the slate
uses. That works on a portrait that ships with the app as much as on one you
have just chosen, which it did not before: the zoom only appeared for a newly
picked file, so the only way to move a face up an inch was to find the original
and upload it again.

The knockout stays off while re-framing. A cutout that ships with the app has
been cut out once already and doing it twice eats the edges.

### Pushing photos to the repository from the app

**Push to the repo**, in the photo bank under the Slate tab. One commit: every
photo in this browser, plus `data/cutouts.json` rebuilt from the branch's own
copy so the index is never built from a stale list. The host rebuilds on its own
and the photo is in front of everybody.

The app has no server that can write to disk and must not have one. This site is
public, and a token sitting on a public server is a token anybody can use. So the
push runs in the browser, with a token typed in by the person at the keyboard.
It is kept in that browser's localStorage if they tick the box, and nowhere else.
It is never sent to this app's own server, never written into a file, and never
committed. **Forget the token** clears it.

Use a fine-grained personal access token, scoped to the one repository, with
**Contents: read and write** and nothing else ticked. That token can add a
portrait. It cannot do anything else with the account. The panel says so, and a
test holds it to that: every request the push module makes goes to
`api.github.com`, and the token never enters the app state, which is saved to
localStorage wholesale.

It does not work in a published Artifact. That page is served under a policy
that blocks every host it was not given, `api.github.com` included. Open the app
on its own address and push from there. The error message says so rather than
failing quietly.

**Download them for the repo** is still there for anyone without a token: a zip,
named the way the repo expects, with `HOW-TO.txt` inside.

### Getting a photo you added in front of everybody

A photo dropped into the hosted copy lives in that browser's own storage and
nowhere else. A hosted copy has no disk it is allowed to write to, so there is
nothing it could do with the file even if it wanted to.

One download and one commit moves it:

1. **Download them for the repo** in the photo bank, or **Download for the repo**
   in the editor for one. You get the files named the way the roster expects,
   with the steps in the zip.
2. Copy them into `public/cutouts/`.
3. `npm run index:cutouts` — that rewrites `data/cutouts.json`, which is how a
   hosted copy finds them.
4. Commit both and push. Vercel redeploys on its own.

The filenames are candidate slugs. Leave them exactly as they are.

Running the app locally against a writable checkout, **Make them the defaults**
does steps 1 to 3 for you and you only have to commit.
