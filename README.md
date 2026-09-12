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
