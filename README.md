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

**Nine canvases** out of the box, from an Instagram square to a 24x18 yard sign
at 150 dpi, plus any custom size. Download at 1x or 2x, copy straight to the
clipboard, or save to Drive.

**Four colour combinations**, all green and navy. Press **C** to cycle them, or
use the **Colors** button. Every value is editable as hex if you need an exact
brand colour.

**Tokens** fill per district, so one piece of copy builds the whole state:
`{{SEAT}}`, `{{COUNTY}}`, `{{DISTRICT}}`, `{{TOWNS}}`, `{{COUNT}}`, `{{NAMES}}`,
`{{SURNAMES}}`, `{{SEATS}}`.

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

## After adding or replacing a portrait

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
