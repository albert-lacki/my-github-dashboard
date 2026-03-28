# PR Inbox — Product Spec

**Status:** implemented  
**Last updated:** 2026-03-28  
**Owner:** Albert

---

## Problem

GitHub's native PR review dashboard has no meaningful way to filter by repository name pattern. Membership in AD-synced GitHub teams (used for CODEOWNERS automation) causes hundreds of irrelevant review requests to appear. There is no native prefix-based or allowlist-based filter in the GitHub UI.

The result: the reviewer's PR list is permanently polluted with noise from repos they have no interest in, with no supported workaround on GitHub's side.

---

## Goal

A lightweight, local multi-file HTML tool that shows only the PRs the user actually cares about — filtered by configurable repository name prefixes — with key review-time metadata visible at a glance.

No server. No build step. No deployment. Open `index.html` in a browser, done.

---

## Users

Single user (self-hosted tool). No auth system, no multi-tenancy. Configuration is personal and stored in `localStorage`.

---

## File Structure

```
index.html         — markup only
app.css            — all styles
app.js             — all logic
favicon.svg        — SVG favicon, green (default state)
favicon-alert.svg  — SVG favicon, yellow (unread PRs while tab inactive)
```

---

## Scope

### Implemented

- Fetch open PRs via **GitHub GraphQL API** (search query, cursor-based pagination, up to 200 results)
- Four view **modes**: `review_requested` / `approved` / `my_prs` / `other`
- Filter PRs client-side by configurable **repository name prefixes**
- Display per PR card: repo name, title, PR number, author (login + avatar), age, CI status, review thread count, Copilot unresolved count, labels, draft indicator
- **Left border colour** per mode indicating PR state (see FR-08)
- Filter bar: All / CI pass / Stale >2d / New <24h / New comments / Changes requested / Drafts toggle
- Summary stats in topbar: total, stale >2d, new <24h
- Prefix configuration UI: add/remove tags, persisted in `localStorage`
- GitHub PAT stored in `localStorage`, masked by default with toggle
- Status indicator: connected / fetching / error
- Manual refresh button + **auto-refresh** (configurable interval: 5/15/30/60 min, on/off toggle)
- Pagination: up to 200 PRs (4 pages × 50 via GraphQL cursor)
- **CI status cache** in `localStorage` keyed by commit SHA, with TTL (pass: 7d, fail: 1h, none: 7d), LRU eviction at 500 entries
- **New comment tracking**: records comment count + timestamp on PR click; shows `N comments (+X new)` if count increased since last visit; human threads and Copilot unresolved shown separately
- **Config export/import**: copy/paste JSON `{ token, prefixes, includeAssigned }` in Settings drawer
- **Hash router**: `location.hash` reflects current mode; survives page refresh
- **Sort**: always newest first (by `createdAt`)
- **Draft visibility toggle**: per-mode, persisted; default OFF except `my_prs`
- **Include assigned PRs toggle**: when ON, PRs where viewer is assignee are shown regardless of prefix filter; persisted in localStorage; default ON
- **Background refresh notifications**: yellow favicon (`favicon-alert.svg`) + `(N new) PR Inbox` tab title when new PRs appear during auto-refresh while tab is inactive; resets on tab focus
- **`CHANGES_REQUESTED` visibility**: second GraphQL query (`reviewed-by:@me`) ensures PRs where viewer gave changes requested still appear even after GitHub removes them from `review-requested`

### Out of scope

- Snooze / dismiss individual PRs
- Multiple GitHub accounts
- Dark/light theme toggle
- Export to CSV/Markdown
- Notifications / browser alerts
- Repo blocklist
- Offline mode (fonts loaded via Google CDN)

---

## Functional Requirements

### FR-01 — GitHub Authentication

- User provides a GitHub Personal Access Token (classic)
- Token is stored in `localStorage` under key `pr_token`
- Token input is masked (`type="password"`) by default, toggleable to visible
- Token is sent as `Authorization: Bearer {token}` header on all API calls
- Required token scopes: `repo`, `read:org`
- Token **must have SSO authorization** for the target org (SAML enforcement); without it the GraphQL search returns zero results silently

### FR-02 — Fetch PRs

- All PR fetching uses **GitHub GraphQL API** (`POST https://api.github.com/graphql`)
- Query: `search(query: "...", type: ISSUE, first: 50, after: $cursor)`
- Paginate up to 4 pages using `pageInfo.hasNextPage` + `endCursor`
- On error, surface message in UI and set status indicator to error state
- PRs are sorted newest first after fetch (`createdAt` ASC by age)
- Auto-refresh via `setInterval` when enabled; timer resets on settings change
- For `review_requested` and `other` modes, a second query (`reviewed-by:@me`) is merged to capture PRs where viewer gave `CHANGES_REQUESTED` (GitHub removes them from `review-requested` after review is submitted). Results are deduplicated by PR number, last occurrence wins.

#### Mode queries

| Mode | GraphQL search query |
|---|---|
| `review_requested` | `is:pr is:open review-requested:@me` |
| `approved` | `is:pr is:open reviewed-by:@me` |
| `my_prs` | `is:pr is:open author:@me` |
| `other` | `is:pr is:open review-requested:@me` (prefix filter inverted) |

### FR-03 — CI Status

- For each PR, fetch: `GET /repos/{owner}/{repo}/commits/{sha}/check-runs?per_page=100`
- SHA taken from `headRefOid` field in GraphQL response (no extra PR fetch needed)
- Derive status:
    - `fail` — any run with `conclusion: failure | timed_out | action_required | stale`
    - `pass` — all runs completed, every conclusion is `success | skipped | neutral | cancelled`
    - `pending` — any run has `status !== completed`
    - `none` — no check runs found or API error
- Fetched in parallel (`Promise.all`); failures default to `none` silently
- Results cached in `localStorage` under key `pr_ci_cache`:
    - Key: commit SHA (immutable — safe to cache)
    - Value: `{ status, expiresAt, accessedAt }`
    - TTL: `pass` → 7 days, `fail` → 1 hour, `none` → 7 days
    - `pending` is never cached
    - LRU eviction when cache exceeds 500 entries (oldest `accessedAt` removed first)

### FR-04 — Prefix Filtering

- User can add one or more repository name prefixes (e.g. `ring-`, `accelerator-`)
- Prefixes stored in `localStorage` under key `pr_prefixes` as JSON array
- Normal modes: `repoName.startsWith(prefix)` — at least one prefix must match
- `other` mode: inverted — shows PRs that do **not** match any prefix
- If no prefixes configured, all fetched PRs are shown in normal modes
- Prefix tags rendered in Settings drawer; each tag has an × button to remove
- Prefix input: text field + Add button; also submits on Enter key

### FR-05 — PR Card Display

Each PR card shows:

| Field | Source | Location |
|---|---|---|
| Repo name | `repository.name` | Top-left, monospace, `--text2` |
| PR title | `title` | Second row, truncated with ellipsis |
| Labels + draft | `labels.nodes`, `isDraft` | Inline after title, colour-coded chips |
| Author | `author.login` + `avatarUrl` | Meta row, avatar 20×20 |
| Age | `createdAt` → now delta | Meta row, format `<1h / Xh / Xd` |
| Human review threads | `reviewThreads` (non-Copilot) | Meta row, `◎ N comments (+X new)` |
| Copilot unresolved | `reviewThreads` (Copilot bot, unresolved) | Meta row, `⬡ N copilot` (blue) |
| PR number | `number` | Top-right column |
| CI status | derived (FR-03) | Bottom-right column, colour-coded badge |

Clicking a card opens the PR in a new tab and records current comment count + timestamp in `localStorage` (for new comment tracking).

### FR-06 — Left Border Colour (per mode)

| Mode | 🟢 Green | 🟡 Yellow | 🔴 Red | None |
|---|---|---|---|---|
| `review_requested` | age < 24h | age ≥ 48h | I gave `REQUEST_CHANGES` | 24h–48h |
| `other` | age < 24h | age ≥ 48h | I gave `REQUEST_CHANGES` | 24h–48h |
| `my_prs` | ≥ 2 `APPROVED` | — | anyone gave `REQUEST_CHANGES` | otherwise |
| `approved` | — | age ≥ 48h | — | otherwise |

Review states derived from `reviews(last: 50)` GraphQL field; latest review per author wins.

### FR-07 — Filter Bar

Filters above the PR list (single-select, default `all`):

| Filter | Condition |
|---|---|
| all | no additional filter |
| CI pass | `ci === 'pass'` |
| stale >2d | `ageHours >= 48` |
| new <24h | `ageHours < 24` |
| new comments | `newCommentCount > 0` (since last click) |
| changes requested | `iChangesRequested \|\| anyChangesRequested` |

**Draft toggle** (right-aligned in filter bar): per-mode on/off, persisted in `localStorage`. Default: OFF for all modes except `my_prs`.

Prefix filter (FR-04) is always applied on top of the tab filter.

### FR-08 — Topbar Stats

Three stat pills in topbar, updated after each fetch and after prefix/filter changes:

- **total** — count of filtered PRs
- **stale >2d** — PRs with `ageHours >= 48` (red number)
- **new <24h** — PRs with `ageHours < 24` (green number)

### FR-09 — Status Indicator

| State | Dot | Label |
|---|---|---|
| Not connected | grey | `not connected` |
| Fetching | grey | `fetching…` |
| OK | green, pulsing | `updated HH:MM:SS` |
| Error | red | `error` |

### FR-10 — Persistence

All user config survives page reload:

| Key | Value |
|---|---|
| `pr_token` | string, raw PAT |
| `pr_prefixes` | JSON array of strings |
| `pr_ci_cache` | JSON object, SHA → `{ status, expiresAt, accessedAt }` |
| `pr_seen` | JSON object, PR number → `{ commentCount, seenAt }` |
| `pr_auto_refresh` | `"true"` / `"false"` |
| `pr_auto_refresh_freq` | number (minutes) |
| `pr_show_drafts_{mode}` | `"true"` / `"false"` per mode |
| `pr_include_assigned` | `"true"` / `"false"` |

### FR-11 — Settings Drawer

Slide-in drawer (left side), opened via `☰` button in topbar:

- **GitHub Token** — masked input with eye toggle
- **Repo Prefixes** — tag list with add/remove; toggle "include assigned PRs" (default ON)
- **Auto-refresh** — checkbox (enable/disable) + frequency select (5/15/30/60 min)
- **Config** — "copy as JSON" button (exports `{ token, prefixes, includeAssigned }` to clipboard + textarea) + textarea for paste + "import JSON" button (auto-imports on paste)

### FR-13 — Background Notifications

When auto-refresh fires while the tab is inactive and the filtered PR count has increased:
- Tab title changes to `(N new) PR Inbox`
- Favicon switches from `favicon.svg` (green) to `favicon-alert.svg` (yellow)
- Both reset to default when the user returns to the tab (`visibilitychange` event)

### FR-12 — Hash Router

- `location.hash` is set to current mode name on every mode change (e.g. `#my_prs`)
- On page load, hash is read and mode is restored before first fetch
- Unknown or empty hash falls back to `review_requested`

---

## Non-Functional Requirements

- **Zero runtime dependencies** — no npm, no bundler, no frameworks. Google Fonts via CDN.
- **No server** — all API calls go directly from browser to `api.github.com`.
- **Performance** — CI fetches run in parallel, results cached by SHA with TTL. Warm refresh (all CI cached) is significantly faster than cold.
- **Security** — PAT stored unencrypted in `localStorage`. Single-user local tool only. Do not deploy on a shared server.
- **Browser support** — modern Chromium/Firefox/Safari only.

---

## API Reference

### GraphQL (primary)

```
POST https://api.github.com/graphql
Headers:
  Authorization: Bearer {token}
  Content-Type: application/json

Query fields used per PR node:
  number, title, url, createdAt, headRefOid, state, isDraft
  labels(first: 10) { nodes { name color } }
  assignees(first: 10) { nodes { login } }
  reviewThreads(first: 100) {
    nodes { isResolved, comments(first: 1) { nodes { author { login } } } }
  }
  reviews(last: 50) { nodes { state, author { login } } }
  repository { name, owner { login } }
  author { login, avatarUrl }
```

### REST (CI status only)

```
GET /repos/{owner}/{repo}/commits/{sha}/check-runs?per_page=100
Headers:
  Authorization: Bearer {token}
  Accept: application/vnd.github+json
  X-GitHub-Api-Version: 2022-11-28
```

GitHub API rate limits: 5000 requests/hour REST, no separate GraphQL search limit for authenticated users. Typical full cold refresh: 1 GraphQL call + up to 50 CI REST calls = 51 requests.

---

## UI Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ☰  > pr-inbox  [total N] [stale N] [new N]  [status] [↻]    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  review_requested ▾  [N]                                    │
│                                                              │
│  [all] [CI pass] [stale] [new] [new comments]               │
│  [changes requested]                    [drafts: off]        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │▌ repo-name                                            │  │
│  │  PR title here        [label] [draft]    #123        │  │
│  │  @author  ⧗ 3d  ◎ 5 +2 new  ⬡ 3 copilot  ✗ fail   │  │
│  └────────────────────────────────────────────────────────┘  │
│  ...                                                         │
└──────────────────────────────────────────────────────────────┘

[Settings drawer — slides in from left]
  GitHub Token / Repo Prefixes / Auto-refresh / Config export-import
```

---

## Future Backlog

- **Snooze** — hide a PR for N hours, stored in localStorage with expiry
- **Repo blocklist** — explicit exclude list in addition to prefix allowlist
- **Export** — copy filtered list as Markdown table
- **Offline mode** — embed fonts as base64, remove CDN dependency
- **Tab visibility awareness** — pause auto-refresh when tab is not visible
- **Assigned vs team review** — differentiate direct vs team-based review request

