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
"asset layer, no disclaimer" for a layer somebody else will finish.

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

Set `SLATE_PUBLIC=1` and the app is safe to put on an open URL. Without it,
do not: a hosted copy reads Drive with whichever account authorised it, and
several routes would hand that access to anyone who found the link.

`SLATE_PUBLIC=1` closes them:

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

**What a public copy still shows.** Everyone gets the district list, the
nominee names and the portraits. Candidates with no usable headshot render as a
tile marked PHOTO NEEDED, so which of your candidates never sent a photo is
visible to anyone. If that matters, set `SLATE_PUBLIC_READY_ONLY=1` and the app
offers only districts whose portraits are all present. That is 85 districts
instead of 174.

## Hosting it for colleagues

**Read this first.** A hosted copy reads Drive with whichever account
authorised it. Everyone who opens the link gets that access. `SLATE_PASSWORD`
is not optional once the app is on the internet.

GitHub Pages cannot run it. Pages serves static files only, and this app needs
a server to hold the Drive token and to pass the portraits through to the
browser.

### Render, the simple one

`render.yaml` is in the repo. Point Render at this repo, set the four secrets it
asks for, and deploy. It runs as a normal Node process with a mounted disk, so
the Drive token and the portrait cache survive restarts. Nothing to re-fetch on
every cold start.

### Vercel

`vercel.json` and `api/index.js` are in the repo. From `slate-studio/`:

```
vercel --prod
```

Then, in the project's environment variables:

| Variable | Value |
|---|---|
| `BASE_URL` | the deployed URL, no trailing slash |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from the Google client |
| `GOOGLE_REFRESH_TOKEN` | see below |
| `SLATE_PASSWORD` | the shared password |

Add `<BASE_URL>/auth/callback` to the Google client's redirect URIs.

Vercel has no persistent disk, so the browser sign-in cannot be stored. Authorise
once on your own machine instead, then read the token out:

```
npm start                 # open /auth/google, approve
npm run token             # prints the refresh token
```

Paste that into `GOOGLE_REFRESH_TOKEN` and redeploy. Two things to expect on
serverless: the first request after an idle period rebuilds the catalog, which
takes a few seconds, and the portrait cache starts empty again.

**Save to Drive** posts the PNG as raw bytes, which keeps it under the
serverless body limit for every canvas except the yard sign at 2x. Downloads
happen in the browser and are never affected.

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
