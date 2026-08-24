# Family Media Site — Build Spec

A private, multi-language photo and video site documenting a newborn, viewable by
relatives on phones and tablets. Built to be extended later with additional
subjects (e.g. a page for our cats).

This document is the handoff spec. It records decisions already made and the
reasoning behind them, so the build doesn't relitigate them.

---

## 1. Goals

1. A gift for my wife — should feel personal and considered, not like a generic gallery.
2. Something to show relatives — many are older, not confident with technology, and
   read Chinese rather than English.
3. Practice web development — favour understanding the stack over hiding it behind
   a framework.

## 2. Non-goals (explicitly out of scope for v1)

- Public/SEO presence. The site is private and should not be indexed.
- Self-service account signup. Accounts are created by the owner only.
- Per-photo caption translation. Only site UI chrome is translated (see §7).
- Uploading directly from a phone. Deferred; see §11.
- Video transcoding. Avoided by capture-format choice; see §8.

---

## 3. Stack

| Layer | Choice | Why |
|---|---|---|
| Site hosting | GitHub Pages | Free, static, fine for a small HTML/CSS/JS bundle. Public repo is acceptable — see §10. |
| Frontend | Plain HTML/CSS/JS | No framework needed. Nothing here requires SSR or a build step. Better learning value. |
| Database + auth | Supabase (Postgres) | Free tier. Relational model fits the data. Auth included. Browser client talks to it directly. |
| Media storage | Cloudflare R2 | Free tier, **zero egress fees** — the deciding factor, since relatives re-watching videos is the bandwidth risk, not storage size. |
| Domain | Squarespace (registrar only) | Optional. ~$12–20/yr. Do **not** buy a Squarespace website plan. |

### Why not Next.js
Considered and rejected. Nothing in the feature set needs server-side rendering
or API routes. The Supabase JS client reads and writes directly from the browser,
with row-level security (§9) as the enforcement layer. A framework would add
abstraction without solving a problem we have.

### Why not GitHub for media storage
Git stores every version of every file forever, has a 100MB per-file cap, and
recommends repos stay under 1GB. Git LFS gives only ~1GB/month bandwidth free.
Object storage (R2) is the correct tool: no version history, built for streaming
large files, supports the byte-range requests video scrubbing needs.

### Why no Cloudflare Worker
Earlier drafts included a Worker to issue signed R2 upload URLs, because browser
JS can't safely hold a secret key. **Dropped** — uploads run from a local Node
script on the owner's machine (§8), where credentials live in a gitignored `.env`.
No browser, no secret exposure, no Worker. Revisit only if phone-direct upload
is added later.

---

## 4. Accounts and credentials needed

| Service | Purpose | Notes |
|---|---|---|
| GitHub | Repo + Pages hosting | Free. |
| Cloudflare | R2 bucket + API token | Free tier, but **requires a credit card to activate R2** (verification, not a charge). |
| Supabase | Postgres, Auth | Free tier, no card. Note: free projects pause after inactivity — resuming is manual and can look like downtime. |

### Secret handling
- **Safe to ship in public frontend code:** Supabase project URL, Supabase `anon` key.
  These are designed to be public; RLS is what protects the data.
- **Never committed, local `.env` only:** Supabase `service_role` key, R2 API token
  and account ID. Used exclusively by the upload script (§8).
- `.gitignore` must include `.env` from the first commit.

---

## 5. Data model

Postgres via Supabase. Entities and relationships:

### `collections`
Enables future expansion (baby, cats, …) without restructuring.
Pages and nav are generated from this table, never hardcoded.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text unique | e.g. `baby`, `cats` |
| `name_en`, `name_zh`, `name_yue` | text | Display name per language |
| `display_order` | int | Nav ordering |

### `media`
One row per photo or video.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `collection_id` | uuid FK → collections | |
| `r2_key` | text | Object key in R2 |
| `thumb_key` | text nullable | Generated thumbnail |
| `media_type` | text | `photo` \| `video` |
| `date_taken` | timestamptz | From EXIF; see §8 |
| `width`, `height` | int | From EXIF. Used to reserve layout space so the gallery doesn't reflow as images load. |
| `duration_seconds` | numeric nullable | Video only |
| `content_identifier` | text nullable, indexed | Apple Live Photo pair ID. Doubles as the duplicate-detection key on re-runs. |
| `is_live_photo_video` | bool | The MOV half of a Live Photo pair |
| `featured_in_reel` | bool default false | Drives the reel page |
| `reel_order` | int nullable | Manual ordering within the reel |
| `created_at` | timestamptz default now() | |

### `tags` / `media_tags`
Many-to-many. Tags are **shared across collections** — "outdoors" applies equally
to a baby photo or a cat photo. Milestone tags (`first_smile`, `first_steps`) live
here too.

- `tags`: `id`, `slug`, `name_en`, `name_zh`, `name_yue`
- `media_tags`: `media_id` FK, `tag_id` FK, composite PK

### `people` / `media_people`
Who appears in a photo. Also shared across collections. Distinct from `profiles` —
`people` is about photo *subjects*, `profiles` is about site *visitors*.

- `people`: `id`, `name`, `display_order`
- `media_people`: `media_id` FK, `person_id` FK, composite PK

### `profiles`
One row per relative, linked 1:1 to Supabase's built-in `auth.users`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK, FK → auth.users | |
| `display_name` | text | Shown on their comments |
| `relationship` | text | e.g. "Grandma", "Uncle" |
| `preferred_language` | text | `en` \| `zh` \| `yue`. Site opens in their language automatically. |
| `is_admin` | bool default false | Owner only |

### `comments`
One-to-many against `media`. Written in whatever language the author uses — not translated.

`id`, `media_id` FK, `user_id` FK → profiles, `body` text, `created_at`

### `likes`
`media_id` FK, `user_id` FK → profiles, composite PK (enforces one like per person per item), `created_at`

---

## 6. Pages and features

### Core (v1)
- **Home** — recent uploads, plus an "on this day" module surfacing a random older
  item so repeat visitors see something new during quiet weeks.
- **Gallery** — grid per collection. Filter by tag, person, and date range. Sort by
  date. Lazy-load thumbnails; full-size only on open.
- **Reel** — vertical full-screen video feed, TikTok-style. Only `featured_in_reel`
  items, ordered by `reel_order`. Implementation: CSS scroll-snap plus
  IntersectionObserver to play the in-view video and pause the rest. Muted by
  default with tap-to-unmute (browser autoplay policy requires this).
- **Timeline** — chronological, grouped by the baby's age ("Week 3", "Month 2"),
  computed from `date_taken` against a stored birth date. Gives structure before
  much tagging exists.
- **Media detail** — single item, its comments, and a like button.
- **Login** — email/password (§9).

### Later phases
- Guestbook (free-form notes not attached to any single photo)
- Journal/letter entries interleaved into the timeline
- Weekly digest email ("here's what's new") — this is what actually drives
  relatives to revisit; the site alone doesn't
- Audio clips (babbling, laughing) — tiny files, rarely captured deliberately
- "Who's who" family page — small photo + name per relative, in each language
- Export a selection to a print-ready PDF photo book
- Cats collection (should require only a new `collections` row plus content)

### UX constraints (non-negotiable — the audience drives these)
- Big tap targets. No hover-dependent interactions — they don't exist on touch.
- Navigation must work with scroll and tap only.
- Flashy styling is welcome on the landing/hero, but core navigation stays plain
  and predictable.
- Mobile and tablet are the primary targets, not desktop.
- Sessions must be long-lived so relatives log in once per device, not per visit.

---

## 7. Languages

Three UI languages: **English**, **Chinese**, **Cantonese**.

**Scope: UI chrome only.** Nav items, page headings, button labels, form
placeholders, empty states. Photo captions are not translated, and comments stay
in whatever language they were written in.

**Implementation:** a small JSON dictionary per language shipped with the site code
(`/i18n/en.json`, `zh.json`, `yue.json`). Not a database table — this is a fixed,
small set of strings that shouldn't cost a network round-trip to render a nav bar.

Language resolution order: user's `profiles.preferred_language` → manual toggle
(persisted locally) → English fallback.

**Open question for the owner, flagged not decided:** written Cantonese and written
Mandarin share most characters; the differences are largely spoken. If `zh` and
`yue` end up with identical strings, the more useful third option may be
Traditional vs Simplified, or genuinely colloquial written Cantonese (嘅/喺/唔) for
warmth. Build all three keys regardless — collapsing later is trivial, adding a
language later is not.

---

## 8. Media pipeline

### Capture
Set the iPhone to **Settings → Camera → Formats → Most Compatible**. This produces
JPEG and H.264 rather than HEIC/HEVC, which browsers play natively. Larger files,
but it removes the need for any transcoding step — the single biggest cost and
complexity saving in this project.

Note: this only affects *future* captures. The existing backlog is likely HEIC and
needs conversion in the script.

### Export from iCloud
- Keep a running **"Add to site"** album in Photos. Curate by adding to it; export
  the whole album; clear it after upload. It becomes an inbox, so each export only
  contains what's new.
- Finding baby photos: use the Photos **People** album (on-device face recognition —
  note it stabilises more slowly for infants, whose faces change month to month),
  or filter by date range from the birth date and remove the occasional non-baby
  item, rather than hunting for baby photos among everything.
- **Mac:** Photos → File → Export → **Export Unmodified Original(s)**.
- **iCloud.com:** select → Download → choose **Unmodified Originals**.
  Do *not* choose "Most Compatible" here — it re-encodes lossily. "Unmodified
  Originals" is the option that preserves EXIF.
- Prefer the Mac Photos app for large batches; the web downloader gets unreliable
  at scale.
- Avoid cable transfer if "Optimize iPhone Storage" is on — the device may only
  hold downsized copies, and a cable pull gets those rather than the originals.

### Upload script (local Node, run from the owner's machine)

Run rarely — initial bulk load, then occasionally. Must be safely re-runnable.

Steps:
1. Read a local folder of exported originals.
2. Run `exiftool` per file to extract metadata.
   - Photos: `DateTimeOriginal`, `ImageWidth`, `ImageHeight`, `ContentIdentifier`
   - **Videos need the `-ee` flag** — iPhone video metadata often sits in an embedded
     track rather than the file header. Without it, dates appear missing.
   - Video date tag names differ from photos: try `CreationDate`, `CreateDate`,
     `MediaCreateDate` in that order.
   - GPS is usually absent (Location Services off for Camera). Not required by any
     feature — treat as optional.
3. Group Live Photo pairs by shared `ContentIdentifier`. Default: keep the still,
   flag the paired MOV as `is_live_photo_video` so it doesn't appear as a standalone
   video in the gallery or reel.
4. Convert HEIC → JPEG for backlog files (`sharp` or similar). Skip if already JPEG.
5. Generate a thumbnail per item; for videos, grab a frame.
6. **Duplicate check:** skip any file whose `content_identifier` already exists in
   `media`. This is what makes re-runs safe.
7. Upload original + thumbnail to R2.
8. Insert the `media` row into Supabase using the `service_role` key.
9. Log a summary: uploaded / skipped / failed, with reasons.

### Backups
iCloud remains the source of truth for originals. R2 is a serving copy, not the
only surviving copy — no separate backup system needed.

---

## 9. Auth and access control

### Model
Owner-provisioned email/password accounts. No self-signup, no magic links.

Magic links were considered and rejected: relatives view from multiple devices, and
a link-per-device setup step is more friction than a password they can reuse
anywhere. Note the practical consequence — **the owner is the password reset flow**;
there's no self-serve recovery.

- Create accounts via Supabase's admin API, one per relative.
- Set memorable passwords deliberately (these people won't use password managers).
- Configure long session lifetimes.
- Known limitation, accepted: a shared household device stays logged in as whoever
  set it up, so likes/comments from it attribute to that profile.

### Row-level security
RLS is the real security boundary — the site's login screen is not, because anyone
with the Supabase URL and anon key (both public by design) could otherwise query
directly. **Enable RLS on every table and write policies before any real content
goes in.**

| Table | Policy |
|---|---|
| `media`, `collections`, `tags`, `media_tags`, `people`, `media_people` | SELECT for authenticated users only. INSERT/UPDATE/DELETE restricted to `is_admin`. |
| `profiles` | SELECT own row plus other users' display fields. UPDATE own row only (e.g. `preferred_language`). |
| `comments` | SELECT for authenticated. INSERT where `user_id = auth.uid()`. UPDATE/DELETE own rows only. Admin may delete any. |
| `likes` | SELECT for authenticated. INSERT/DELETE where `user_id = auth.uid()`. |

Also: add `noindex` meta tags and a disallow-all `robots.txt`, so the site doesn't
surface in search results.

---

## 10. Repo visibility

Public repo is fine and is the chosen approach. GitHub Pages requires a public repo
on the free plan, and the security boundary is the login wall plus RLS plus media
living on separate infrastructure (R2) — not code secrecy. The Supabase URL and
anon key being visible in page source is expected and by design.

The only hard requirement: no `service_role` key and no R2 credentials in the repo,
ever.

---

## 11. Deferred: phone-direct upload

Not in v1. If added later, an Apple Shortcuts automation triggered by additions to
the "Add to site" album could post straight to an endpoint. Two notes for whoever
picks this up:

- This **would** reintroduce the need for a small server-side function (Cloudflare
  Worker or Supabase Edge Function) to hold the R2 signing key, since a phone can't
  run the local script.
- Shortcuts' "Get details of Photos" action returns date and location directly from
  the Photos library for both images and video — which sidesteps the awkward video
  metadata parsing entirely.

Adding this later disturbs nothing else in the architecture.

---

## 12. Build order

Deliberately sequenced so content can start flowing before the fun parts exist —
newborn media accumulates fast, and a backlog forms quickly if the pipeline lags.

**Phase 1 — Pipeline (do this first)**
Supabase project, schema, RLS policies. R2 bucket. Local upload script end to end.
Verify with a small batch: dates correct, Live Photo pairs handled, re-run skips
duplicates.

**Phase 2 — Read-only site**
GitHub Pages deploy. Login. Gallery reading from Supabase + R2. Timeline view.
Media detail page. Mobile-first layout.

**Phase 3 — Interaction**
Comments and likes, with RLS verified by testing as a non-admin account.

**Phase 4 — Polish**
Reel page. Tag/person filtering and search. i18n toggle and dictionaries.
"On this day" module.

**Phase 5 — Expansion**
Cats collection (should be a data change, not a code change — if it isn't, the
`collections` abstraction failed). Guestbook, journal entries, weekly digest email.

---

## 13. Notes for Claude Code

- Start with Phase 1. Do not scaffold the frontend before the pipeline works.
- No framework. Plain HTML/CSS/JS with the Supabase JS client from CDN or a
  minimal bundler. Don't introduce React/Next unless it's justified against §3.
- Never write secrets into committed files. `.env` + `.gitignore` from commit one.
- Test RLS by querying Supabase as an anonymous client and as a non-admin user —
  confirm both are correctly restricted. This is the one thing that must not be
  assumed working.
- Owner is comfortable with HTML/CSS/JS but is not a backend specialist. Explain
  Supabase, R2, and RLS concepts as you go rather than only producing code.
