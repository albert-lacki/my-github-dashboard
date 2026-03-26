# PR Inbox

A lightweight, local dashboard for GitHub pull requests. Shows only the PRs you actually care about — filtered by repository name prefixes — with review metadata visible at a glance.

No server. No build step. No framework. Four static files.

---

## Features

- **Four views** — `review_requested` / `approved` / `my_prs` / `other`
- **Prefix filtering** — show only repos matching your patterns (e.g. `ring-`, `sdk-`)
- **CI status** — pass / fail / pending per PR, cached by commit SHA with TTL
- **Review state colours** — green (new <24h), yellow (stale >2d), red (changes requested)
- **Comment tracking** — human thread count with `+N new` since last visit; Copilot unresolved separately
- **Labels + draft badge** — inline with PR title
- **Auto-refresh** — configurable interval (5 / 15 / 30 / 60 min)
- **Hash router** — view mode persists across page refresh (`#my_prs`)
- **Config export/import** — copy/paste JSON for easy setup on a new machine

---

## Requirements

- GitHub Personal Access Token (classic) with scopes: **`repo`**, **`read:org`**
- If your org enforces SAML SSO — the token must have **SSO authorization** for that org  
  (GitHub → Settings → Tokens → Configure SSO → Authorize)

---

## Quick Start

1. Download the four files: `index.html`, `app.js`, `app.css`, `favicon.svg`
2. Open `index.html` in your browser
3. Click **☰** → paste your GitHub token
4. Add repo prefixes (e.g. `ring-`, `sdk-`)
5. Done — list loads automatically

No install. No `npm install`. No localhost server needed.

---

## Deployment options

The tool works perfectly as a local file, but hosting it means it's always one URL away — from any machine or browser profile.

### Option 1 — GitHub Pages (recommended for personal use)

1. Create a **private** repository (e.g. `my-pr-inbox`)
2. Push the four files to the repo root
3. Go to **Settings → Pages → Source** → select `main` branch → Save
4. Your dashboard is live at `https://{your-username}.github.io/my-pr-inbox/`

> ⚠️ Even with a private repo, GitHub Pages URLs are **publicly accessible** by default unless you have a GitHub Enterprise plan with access control. The token is stored in `localStorage` only — it's never in the source files — so the risk is low, but keep this in mind.

**One-liner setup:**

```bash
git init my-pr-inbox && cd my-pr-inbox
cp /path/to/{index.html,app.js,app.css,favicon.svg} .
git add . && git commit -m "Initial deploy"
gh repo create my-pr-inbox --private --push --source=.
# then enable Pages in repo settings
```

---

### Option 2 — Ring Pages

[Ring Pages](https://help.ringpublishing.com/docs/Pages/getting-started/index.html) hosts static files on Ring Publishing infrastructure.

**Prerequisites:** Ring Pages module enabled in your Ring space, with appropriate access rights.

**Steps:**

1. Create a ZIP archive of the four files — `index.html` must be in the root of the ZIP:

   ```bash
   zip pr-inbox.zip index.html app.js app.css favicon.svg
   ```

2. Open the Ring Pages interface in your Ring space
3. Drag & drop (or click to browse) the ZIP file into the upload area
4. Wait for processing — you'll receive a unique URL (e.g. `https://your-id.ring-pages.io`)

**Updating after changes:**

1. Switch to the **Update** tab in Ring Pages
2. Paste your existing Ring Pages URL
3. Upload a new ZIP — content is overwritten, URL stays the same

All files reference each other by relative paths, so no configuration changes are needed. All GitHub API calls go directly from the browser to `api.github.com` — no proxy or server-side logic required.

---

### Option 3 — Any static file host

Works on Netlify, Vercel, S3 + CloudFront, Cloudflare Pages, etc. Drop the four files into the same directory, no base path config needed.

---

## Configuration

All settings are stored in `localStorage` and survive page reload.

| Setting | Where |
|---|---|
| GitHub token | Settings drawer → GitHub Token |
| Repo prefixes | Settings drawer → Repo Prefixes |
| Auto-refresh | Settings drawer → Auto-refresh |
| Draft visibility | Filter bar → `drafts: on/off` (per view mode) |
| Export/Import all | Settings drawer → Config → copy/paste JSON |

**Config JSON format:**

```json
{
  "token": "ghp_xxxxxxxxxxxx",
  "prefixes": ["ring-", "sdk-", "orange-"]
}
```

Use **copy as JSON** to back up your config and **import JSON** (or just paste) to restore it on another machine.

---

## File structure

```
index.html   — markup only (~120 lines)
app.css      — all styles (~500 lines)
app.js       — all logic (~500 lines)
favicon.svg  — SVG icon
```

No build step, no `node_modules`, no bundler. Edit any file directly in a text editor.

---

## Security notes

- The GitHub token is stored **unencrypted** in `localStorage`. Do not use this tool on a shared computer.
- The token is never included in source files or sent anywhere other than `api.github.com`.
- If deploying to GitHub Pages with a public URL — anyone with the URL can open the page, but cannot access your token (it lives in your browser only).
- Use a token with minimum required scopes (`repo` + `read:org`) and rotate it periodically.

---

## Tech stack

Vanilla HTML5 + CSS custom properties + ES2022. Zero runtime dependencies.  
Google Fonts ([IBM Plex](https://fonts.google.com/specimen/IBM+Plex+Mono)) loaded via CDN — remove the `<link>` tags in `index.html` for fully offline operation (fonts fall back to system monospace/sans).
