// ── State ──────────────────────────────────────────────
let allPRs = [];
let currentFilter = 'all';
let currentMode = 'review_requested';
let viewerLogin = null;

// ── Draft visibility ───────────────────────────────────
function draftKey(mode) { return `pr_show_drafts_${mode}`; }
function showDrafts(mode) {
    const stored = localStorage.getItem(draftKey(mode));
    if (stored !== null) return stored === 'true';
    return mode === 'my_prs'; // default: ON for my_prs, OFF elsewhere
}
function setShowDrafts(mode, val) {
    localStorage.setItem(draftKey(mode), val);
    renderPRs();
    updateStats();
    updateDraftToggle();
}
function updateDraftToggle() {
    const btn = document.getElementById('btnDraftToggle');
    if (!btn) return;
    const on = showDrafts(currentMode);
    btn.textContent = on ? 'drafts: on' : 'drafts: off';
    btn.classList.toggle('active', on);
}

// ── Notifications (favicon + tab title) ───────────────
let lastSeenCount = null; // PR count when tab was last active
let hasUnread = false;

function buildFaviconUrl(color) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const ctx = c.getContext('2d');

    // background rounded rect
    ctx.fillStyle = '#13161b';
    ctx.beginPath();
    ctx.roundRect(0, 0, 32, 32, 6);
    ctx.fill();

    // border
    ctx.strokeStyle = '#232830';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, 31, 31, 5.5);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // arrow up (branch line)
    ctx.beginPath();
    ctx.moveTo(10, 22); ctx.lineTo(10, 10);
    ctx.stroke();
    // arrowhead
    ctx.beginPath();
    ctx.moveTo(6, 14); ctx.lineTo(10, 10); ctx.lineTo(14, 14);
    ctx.stroke();

    // top dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(22, 10, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // bottom dot
    ctx.beginPath();
    ctx.arc(22, 22, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // connecting curve
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(22, 13.5);
    ctx.quadraticCurveTo(22, 17, 18, 17);
    ctx.lineTo(14.5, 17);
    ctx.stroke();

    return c.toDataURL('image/png');
}

function setFavicon(color) {
    let link = document.querySelector("link[rel='icon']");
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.type = 'image/png';
    link.href = buildFaviconUrl(color);
}

function setUnread(count) {
    hasUnread = count > 0;
    if (hasUnread) {
        document.title = `(${count} new) PR Inbox`;
        setFavicon('#fbbf24'); // yellow
    } else {
        document.title = 'PR Inbox';
        setFavicon('#4ade80'); // green
    }
}

// track visibility — clear unread when user comes back to tab
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        lastSeenCount = filteredPRs().length;
        setUnread(0);
    }
});

// ── Auto-refresh ───────────────────────────────────────
let autoRefreshTimer = null;
const AUTO_REFRESH_KEY      = 'pr_auto_refresh';
const AUTO_REFRESH_FREQ_KEY = 'pr_auto_refresh_freq';

function autoRefreshEnabled() { return localStorage.getItem(AUTO_REFRESH_KEY) !== 'false'; }
function autoRefreshFreq()    { return parseInt(localStorage.getItem(AUTO_REFRESH_FREQ_KEY) || '15', 10); }

function scheduleAutoRefresh() {
    clearInterval(autoRefreshTimer);
    if (!autoRefreshEnabled()) return;
    autoRefreshTimer = setInterval(() => loadPRs(), autoRefreshFreq() * 60 * 1000);
}

function setAutoRefresh(enabled) {
    localStorage.setItem(AUTO_REFRESH_KEY, enabled);
    document.getElementById('autoRefreshToggle').checked = enabled;
    scheduleAutoRefresh();
}

function setAutoRefreshFreq(minutes) {
    localStorage.setItem(AUTO_REFRESH_FREQ_KEY, minutes);
    scheduleAutoRefresh();
}

// ── Mode switcher ──────────────────────────────────────
function toggleModeMenu() {
    document.getElementById('modeMenu').classList.toggle('open');
}
document.addEventListener('click', e => {
    if (!e.target.closest('.main-header-wrap')) {
        document.getElementById('modeMenu')?.classList.remove('open');
    }
});

const MODE_LABELS = {
    review_requested: 'review_requested',
    approved:         'approved',
    my_prs:           'my_prs',
    other:            'other',
};
const MODE_QUERIES = {
    review_requested: 'is:pr is:open review-requested:@me',
    approved:         'is:pr is:open reviewed-by:@me',
    my_prs:           'is:pr is:open author:@me',
    other:            'is:pr is:open review-requested:@me',
};

function setMode(mode, el) {
    currentMode = mode;
    location.hash = mode;
    document.getElementById('modeTitle').childNodes[0].textContent = MODE_LABELS[mode] + ' ';
    document.querySelectorAll('.mode-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('modeMenu').classList.remove('open');
    updateDraftToggle();
    loadPRs();
}

function restoreModeFromHash() {
    const hash = location.hash.replace('#', '');
    if (!MODE_LABELS[hash]) return;
    currentMode = hash;
    document.getElementById('modeTitle').childNodes[0].textContent = MODE_LABELS[hash] + ' ';
    document.querySelectorAll('.mode-item').forEach(el => {
        el.classList.toggle('active', el.textContent.trim() === MODE_LABELS[hash]);
    });
}

// ── Config export / import ─────────────────────────────
function exportConfig() {
    const config = JSON.stringify({ token: loadToken(), prefixes: loadPrefixes() }, null, 2);
    navigator.clipboard.writeText(config)
        .then(() => showToast('Config copied to clipboard.'))
        .catch(() => showToast('Clipboard unavailable — copy manually from textarea.'));
    // also populate textarea so user can copy manually if clipboard fails
    document.getElementById('configImport').value = config;
}

function importConfig() {
    try {
        const raw = document.getElementById('configImport').value.trim();
        const config = JSON.parse(raw);
        if (config.token)    { saveToken(config.token); document.getElementById('tokenInput').value = config.token; }
        if (Array.isArray(config.prefixes)) { savePrefixes(config.prefixes); renderPrefixes(); }
        document.getElementById('configImport').value = '';
        showToast('Config imported.');
        if (loadToken()) loadPRs();
    } catch { showToast('Invalid JSON — check your config.'); }
}

function scheduleImport() {
    // auto-import 100ms after paste so the textarea value is populated
    setTimeout(importConfig, 100);
}

// ── Drawer ─────────────────────────────────────────────
function openDrawer() {
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawerOverlay').classList.add('open');
}
function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerOverlay').classList.remove('open');
}

// ── Persistence ────────────────────────────────────────
function saveToken(val) { localStorage.setItem('pr_token', val); }
function loadToken()    { return localStorage.getItem('pr_token') || ''; }
function savePrefixes(arr) { localStorage.setItem('pr_prefixes', JSON.stringify(arr)); }
function loadPrefixes() {
    try { return JSON.parse(localStorage.getItem('pr_prefixes')) || []; }
    catch { return []; }
}

// ── Token UI ───────────────────────────────────────────
function toggleToken() {
    const inp = document.getElementById('tokenInput');
    inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ── Prefix UI ──────────────────────────────────────────
function renderPrefixes() {
    const prefixes = loadPrefixes();
    document.getElementById('prefixTags').innerHTML = prefixes.map((p, i) =>
        `<div class="prefix-tag"><span>${p}</span><span class="remove" onclick="removePrefix(${i})">×</span></div>`
    ).join('');
}

function addPrefix() {
    const input = document.getElementById('prefixInput');
    const val = input.value.trim();
    if (!val) return;
    const prefixes = loadPrefixes();
    if (!prefixes.includes(val)) { prefixes.push(val); savePrefixes(prefixes); renderPrefixes(); }
    input.value = '';
}

function removePrefix(i) {
    const prefixes = loadPrefixes();
    prefixes.splice(i, 1);
    savePrefixes(prefixes);
    renderPrefixes();
    if (allPRs.length) { renderPRs(); updateStats(); }
}

// ── Filters ────────────────────────────────────────────
function setFilter(f, btn) {
    currentFilter = f;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderPRs();
}

function filteredPRs() {
    const prefixes = loadPrefixes();
    let prs = allPRs;
    if (currentMode === 'other') {
        // show only PRs that don't match any prefix (the "noise" outside your filter list)
        if (prefixes.length) prs = prs.filter(pr => !prefixes.some(p => pr.repoName.startsWith(p)));
    } else {
        if (prefixes.length) prs = prs.filter(pr => prefixes.some(p => pr.repoName.startsWith(p)));
    }
    if (!showDrafts(currentMode)) prs = prs.filter(pr => !pr.isDraft);
    if (currentFilter === 'ci_pass')          prs = prs.filter(pr => pr.ci === 'pass');
    if (currentFilter === 'stale')             prs = prs.filter(pr => pr.ageHours >= 48);
    if (currentFilter === 'new')               prs = prs.filter(pr => pr.ageHours < 24);
    if (currentFilter === 'new_comments')      prs = prs.filter(pr => newCommentCount(pr.number, pr.commentCount) > 0);
    if (currentFilter === 'changes_requested') prs = prs.filter(pr => pr.iChangesRequested || pr.anyChangesRequested);
    return prs;
}

// ── Age helpers ────────────────────────────────────────
function ageHours(dateStr) { return (Date.now() - new Date(dateStr).getTime()) / 36e5; }
function ageLabel(h) {
    if (h < 1)  return '<1h';
    if (h < 24) return `${Math.floor(h)}h`;
    return `${Math.floor(h / 24)}d`;
}
function ageClass(h) {
    if (h >= 72) return 'crit';
    if (h >= 48) return 'warn';
    return '';
}
function cardClass(pr) {
    const h = pr.ageHours;
    if (currentMode === 'review_requested' || currentMode === 'other') {
        if (pr.iChangesRequested)  return 'changes-requested';
        if (h >= 48)               return 'stale';
        if (h < 24)                return 'fresh';
        return '';
    }
    if (currentMode === 'my_prs') {
        if (pr.anyChangesRequested) return 'changes-requested';
        if (pr.approvedCount >= 2)  return 'fresh';
        return '';
    }
    if (currentMode === 'approved') {
        if (h >= 48) return 'stale';
        return '';
    }
    return '';
}

// ── CI helpers ─────────────────────────────────────────
function ciClass(ci) {
    if (ci === 'pass')    return 'ci-pass';
    if (ci === 'fail')    return 'ci-fail';
    if (ci === 'pending') return 'ci-pending';
    return 'ci-none';
}
function ciLabel(ci) {
    if (ci === 'pass')    return '✓ pass';
    if (ci === 'fail')    return '✗ fail';
    if (ci === 'pending') return '⟳ running';
    return '— no CI';
}

// ── Render ─────────────────────────────────────────────
function renderPRs() {
    const list = document.getElementById('prList');
    const prs = filteredPRs();
    document.getElementById('countBadge').textContent = prs.length;

    if (!prs.length) {
        list.innerHTML = `<div class="state-box"><div class="big">✓</div>No PRs match current filters.</div>`;
        return;
    }

    list.innerHTML = prs.map((pr, i) => {
        const newComments = newCommentCount(pr.number, pr.commentCount);
        const humanChip = pr.commentCount > 0
            ? `<span class="meta-chip">◎ ${pr.commentCount} comments${newComments > 0 ? ` <span class="new-comments">(+${newComments} new)</span>` : ''}</span>`
            : '';
        const copilotChip = pr.copilotUnresolved > 0
            ? `<span class="meta-chip copilot-chip">⬡ ${pr.copilotUnresolved} copilot</span>`
            : '';
        const draftBadge  = pr.isDraft ? `<span class="label-chip draft-badge">draft</span>` : '';
        const labelChips  = pr.labels.map(l =>
            `<span class="label-chip" style="border-color:#${l.color}22;color:#${l.color}">${l.name}</span>`
        ).join('');
        return `
            <a class="pr-card ${cardClass(pr)}" href="${pr.url}" target="_blank"
               style="animation-delay:${i * 30}ms"
               onclick="markSeen(${pr.number}, ${pr.commentCount})">
              <div class="pr-main">
                <div class="pr-repo">${pr.repoName}</div>
                <div class="pr-title-row">
                  <div class="pr-title">${escHtml(pr.title)}</div>
                  ${draftBadge || labelChips ? `<div class="pr-title-labels">${draftBadge}${labelChips}</div>` : ''}
                </div>
                <div class="pr-meta">
                  <span class="meta-chip">
                    <img class="avatar" src="${pr.authorAvatar}" alt="${pr.author}">
                    ${pr.author}
                  </span>
                  <span class="age-badge ${ageClass(pr.ageHours)}">⧗ ${ageLabel(pr.ageHours)}</span>
                  ${humanChip}
                  ${copilotChip}
                </div>
              </div>
              <div class="pr-right">
                <div class="pr-number">#${pr.number}</div>
                <span class="ci-badge ${ciClass(pr.ci)}">${ciLabel(pr.ci)}</span>
              </div>
            </a>
        `;
    }).join('');
}

function updateStats() {
    const prefixes = loadPrefixes();
    let prs = allPRs;
    if (prefixes.length) prs = prs.filter(pr => prefixes.some(p => pr.repoName.startsWith(p)));
    document.getElementById('statTotal').textContent = prs.length;
    document.getElementById('statStale').textContent = prs.filter(p => p.ageHours >= 48).length;
    document.getElementById('statNew').textContent   = prs.filter(p => p.ageHours < 24).length;
}

function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── API ────────────────────────────────────────────────
async function ghFetch(url, token) {
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
    return res.json();
}

async function ghGraphQL(query, variables, token) {
    const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}: ${res.statusText}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);
    return json.data;
}

// ── PR seen tracking ───────────────────────────────────
// Stores { commentCount, seenAt } per PR number in localStorage.
const SEEN_KEY = 'pr_seen';

function seenLoad() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); }
    catch { return {}; }
}

function markSeen(prNumber, commentCount) {
    const seen = seenLoad();
    seen[prNumber] = { commentCount, seenAt: Date.now() };
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); }
    catch { /* storage full */ }
}

function newCommentCount(prNumber, currentCount) {
    const entry = seenLoad()[prNumber];
    if (!entry) return 0;
    return Math.max(0, currentCount - entry.commentCount);
}

// ── CI cache ───────────────────────────────────────────
// Keyed by SHA. Each entry: { status, expiresAt, accessedAt }
// TTL: pass=7d, fail=1h, none=7d. pending is never cached.
// Eviction: when over MAX_ENTRIES, drop LRU (oldest accessedAt) first.
const CI_CACHE_KEY  = 'pr_ci_cache';
const CI_CACHE_MAX  = 500;
const CI_TTL = {
    pass: 7 * 24 * 60 * 60 * 1000,
    fail:      60 * 60 * 1000,
    none: 7 * 24 * 60 * 60 * 1000,
};

function ciCacheLoad() {
    try { return JSON.parse(localStorage.getItem(CI_CACHE_KEY) || '{}'); }
    catch { return {}; }
}
function ciCacheSave(cache) {
    try { localStorage.setItem(CI_CACHE_KEY, JSON.stringify(cache)); }
    catch { /* storage full */ }
}

function ciCacheGet(sha) {
    const cache = ciCacheLoad();
    const entry = cache[sha];
    if (!entry) return null;
    // migrate: old format stored string directly instead of {status, expiresAt, accessedAt}
    if (typeof entry === 'string') {
        delete cache[sha];
        ciCacheSave(cache);
        return null;
    }
    if (Date.now() > entry.expiresAt) {
        delete cache[sha];
        ciCacheSave(cache);
        return null;
    }
    // bump accessedAt for LRU
    entry.accessedAt = Date.now();
    ciCacheSave(cache);
    return entry.status;
}

function ciCacheSet(sha, status) {
    if (status === 'pending') return;
    const ttl = CI_TTL[status];
    if (!ttl) return;
    const cache = ciCacheLoad();
    cache[sha] = { status, expiresAt: Date.now() + ttl, accessedAt: Date.now() };
    // LRU eviction if over limit
    const keys = Object.keys(cache);
    if (keys.length > CI_CACHE_MAX) {
        keys.sort((a, b) => cache[a].accessedAt - cache[b].accessedAt)
            .slice(0, keys.length - CI_CACHE_MAX)
            .forEach(k => delete cache[k]);
    }
    ciCacheSave(cache);
}

async function getCIStatus(owner, repo, sha, token) {
    const cached = ciCacheGet(sha);
    if (cached !== null) return cached;

    try {
        const data = await ghFetch(
            `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`, token
        );
        const runs = data.check_runs || [];
        if (!runs.length) { ciCacheSet(sha, 'none'); return 'none'; }
        const FAIL_CONCLUSIONS    = new Set(['failure', 'timed_out', 'action_required', 'stale']);
        const NEUTRAL_CONCLUSIONS = new Set(['skipped', 'neutral', 'cancelled']);
        if (runs.some(r => FAIL_CONCLUSIONS.has(r.conclusion))) { ciCacheSet(sha, 'fail'); return 'fail'; }
        if (runs.some(r => r.status !== 'completed')) return 'pending'; // not cached
        if (runs.every(r => r.conclusion === 'success' || NEUTRAL_CONCLUSIONS.has(r.conclusion))) {
            ciCacheSet(sha, 'pass'); return 'pass';
        }
        return 'pending';
    } catch { return 'none'; }
}

const GQL_SEARCH = `
  query($query: String!, $after: String) {
    search(query: $query, type: ISSUE, first: 50, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ... on PullRequest {
          number title url createdAt headRefOid state isDraft
              labels(first: 10) { nodes { name color } }
              reviewThreads(first: 100) {
                nodes {
                  isResolved
                  comments(first: 1) {
                    nodes { author { login } }
                  }
                }
              }
              reviews(last: 50) {
                nodes { state author { login } }
              }
              repository { name owner { login } }
          author { login avatarUrl }
        }
      }
    }
  }
`;

async function loadPRs() {
    const token = loadToken();
    if (!token) { showToast('Enter a GitHub token first.'); return; }

    const btn = document.getElementById('btnRefresh');
    const dot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const list = document.getElementById('prList');

    btn.disabled = true;
    dot.className = 'dot';
    statusText.textContent = 'fetching…';
    list.innerHTML = `<div class="state-box"><span class="spinner"></span>Loading PRs…</div>`;
    document.getElementById('countBadge').textContent = '…';
    document.getElementById('statTotal').textContent = '—';
    document.getElementById('statStale').textContent = '—';
    document.getElementById('statNew').textContent   = '—';

    try {
        // fetch viewer login once — needed for review state attribution
        if (!viewerLogin) {
            const vd = await ghGraphQL('{ viewer { login } }', {}, token);
            viewerLogin = vd.viewer.login;
        }

        let nodes = [];

        // For review_requested and other: also fetch PRs where we gave CHANGES_REQUESTED
        // (GitHub removes reviewer from reviewRequests after review, so they disappear from review-requested:@me)
        const needsChangesRequestedMerge = currentMode === 'review_requested' || currentMode === 'other';
        const queries = [MODE_QUERIES[currentMode]];
        if (needsChangesRequestedMerge) {
            queries.push(`is:pr is:open reviewed-by:${viewerLogin}`);
        }

        for (const q of queries) {
            let after = null;
            for (let page = 0; page < 4; page++) {
                const data = await ghGraphQL(GQL_SEARCH, { query: q, after }, token);
                const { nodes: pageNodes, pageInfo } = data.search;
                nodes = nodes.concat(pageNodes.filter(n => n.number && n.state === 'OPEN'));
                if (!pageInfo.hasNextPage) break;
                after = pageInfo.endCursor;
            }
        }

        // deduplicate by PR number (second query may overlap with first)
        const seen = new Set();
        nodes = nodes.filter(n => seen.has(n.number) ? false : seen.add(n.number));

        const enriched = await Promise.all(nodes.map(async node => {
            const owner    = node.repository.owner.login;
            const repo     = node.repository.name;
            const ci       = await getCIStatus(owner, repo, node.headRefOid, token);
            const threads = node.reviewThreads?.nodes ?? [];
            const isCopilot = login => login && (
                login === 'copilot-pull-request-reviewer' ||
                login === 'copilot-pull-request-reviewer[bot]' ||
                login.startsWith('copilot')
            );
            const humanCommentCount = threads.filter(t => !isCopilot(t.comments.nodes[0]?.author?.login)).length;
            const copilotUnresolved = threads.filter(t => !t.isResolved && isCopilot(t.comments.nodes[0]?.author?.login)).length;
            const reviews  = node.reviews?.nodes ?? [];
            // latest review state per author (last review wins)
            const latestByAuthor = {};
            reviews.forEach(r => { latestByAuthor[r.author?.login] = r.state; });
            const iChangesRequested = latestByAuthor[viewerLogin] === 'CHANGES_REQUESTED';
            const approvedCount     = Object.values(latestByAuthor).filter(s => s === 'APPROVED').length;
            const anyChangesRequested = Object.values(latestByAuthor).some(s => s === 'CHANGES_REQUESTED');
            return {
                number:             node.number,
                title:              node.title,
                url:                node.url,
                repoName:           repo,
                author:             node.author?.login ?? 'unknown',
                authorAvatar:       (node.author?.avatarUrl ?? '') + '&s=32',
                ageHours:           ageHours(node.createdAt),
                commentCount:       humanCommentCount,
                copilotUnresolved,
                ci,
                iChangesRequested,
                approvedCount,
                anyChangesRequested,
                isDraft:            node.isDraft,
                labels:             node.labels?.nodes ?? [],
            };
        }));

        // sort newest first
        enriched.sort((a, b) => a.ageHours - b.ageHours);

        // for review_requested/other: keep from the merged reviewed-by set only those
        // where viewer gave CHANGES_REQUESTED — drop the rest (they belong to 'approved')
        const finalPRs = needsChangesRequestedMerge
            ? enriched.filter(pr => {
                const fromReviewRequested = pr._fromReviewRequested;
                return fromReviewRequested || pr.iChangesRequested;
              })
            : enriched;

        allPRs = enriched;
        dot.className = 'dot live';
        statusText.textContent = `updated ${new Date().toLocaleTimeString()}`;
        renderPRs();
        updateStats();

        // notify if new PRs appeared while tab was inactive
        const currentCount = filteredPRs().length;
        if (document.visibilityState === 'hidden' && lastSeenCount !== null && currentCount > lastSeenCount) {
            setUnread(currentCount - lastSeenCount);
        } else if (document.visibilityState === 'visible') {
            lastSeenCount = currentCount;
            setUnread(0);
        }

    } catch (err) {
        dot.className = 'dot error';
        statusText.textContent = 'error';
        showToast(err.message);
        list.innerHTML = `<div class="state-box"><div class="big">✗</div>${err.message}</div>`;
    } finally {
        btn.disabled = false;
    }
}

// ── Toast ──────────────────────────────────────────────
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 4000);
}

// ── Init ───────────────────────────────────────────────
(function init() {
    // migrate old CI cache format (string values → object with TTL)
    try {
        const cache = JSON.parse(localStorage.getItem(CI_CACHE_KEY) || '{}');
        const hasOldFormat = Object.values(cache).some(v => typeof v === 'string');
        if (hasOldFormat) localStorage.removeItem(CI_CACHE_KEY);
    } catch { localStorage.removeItem(CI_CACHE_KEY); }

    document.getElementById('tokenInput').value = loadToken();
    document.getElementById('autoRefreshToggle').checked = autoRefreshEnabled();
    document.getElementById('autoRefreshFreq').value = autoRefreshFreq();
    renderPrefixes();
    restoreModeFromHash();
    updateDraftToggle();
    scheduleAutoRefresh();
    setFavicon('#4ade80'); // init with green
    if (loadToken()) loadPRs();
})();

