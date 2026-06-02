/* ── Recipe detail page ───────────────────────────────── */

const TAG_COLORS = {
  protein:    'tag-protein',
  region:     'tag-region',
  complexity: 'tag-complexity',
  meal:       'tag-meal'
};

const STATUS_OPTIONS = ['Want to Make', 'Made', 'Normal Rotation'];
const STATUS_CLASS   = { 'Want to Make': 'status-want', 'Made': 'status-tried', 'Normal Rotation': 'status-regular' };
const STATUS_ACTIVE  = { 'Want to Make': 'active-want', 'Made': 'active-made', 'Normal Rotation': 'active-normal' };

const getConfig = () => ({
  workerUrl: localStorage.getItem('mep_workerUrl') || '',
  password:  localStorage.getItem('mep_password')  || ''
});

let allRecipes = [];
let currentRecipe = null;

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) { renderError('No recipe specified.'); return; }

  try {
    const resp = await fetch('data/recipes.json?v=' + Date.now());
    if (!resp.ok) throw new Error('Could not load recipes');
    allRecipes = await resp.json();
    const recipe = allRecipes.find(r => r.id === id);
    if (!recipe) throw new Error('Recipe not found');
    currentRecipe = recipe;
    renderRecipe(recipe);
  } catch (e) {
    renderError(e.message);
  }
});

function renderRecipe(r) {
  document.title = `${r.title} — Salty Lake Recipes`;
  document.getElementById('headerTitle').textContent = r.title;

  // Copy link button
  document.getElementById('copyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      const btn = document.getElementById('copyBtn');
      const txt = document.getElementById('copyBtnText');
      btn.classList.add('copied');
      txt.textContent = 'Copied!';
      setTimeout(() => { btn.classList.remove('copied'); txt.textContent = 'Copy link'; }, 2000);
    });
  });

  // Kitchen mode button
  document.getElementById('kitchenBtn').addEventListener('click', () => {
    window.location.href = `kitchen.html?id=${encodeURIComponent(r.id)}`;
  });

  // Edit button
  document.getElementById('editBtn').addEventListener('click', () => {
    window.location.href = `index.html?edit=${encodeURIComponent(r.id)}`;
  });

  // Stars
  const stars = [1,2,3,4,5].map(i =>
    `<span class="detail-star ${i <= (r.rating||0) ? 'filled' : ''}">★</span>`).join('');

  // Tags
  const allTags = Object.entries(r.tags || {}).flatMap(([cat, vals]) =>
    (vals || []).map(v => `<span class="card-tag ${TAG_COLORS[cat] || ''}">${escHtml(v)}</span>`)
  ).join('');

  // Status badge (for tags row)
  const status = r.status || 'Want to Make';
  const statusCls = STATUS_CLASS[status] || 'status-want';
  const statusBadge = `<span class="status-badge ${statusCls}">${escHtml(status)}</span>`;

  // Time stats
  const times = [
    r.prepTime  ? `<div class="recipe-meta-item">${clockIcon()} <span>Prep: ${r.prepTime} min</span></div>` : '',
    r.cookTime  ? `<div class="recipe-meta-item">${clockIcon()} <span>Cook: ${r.cookTime} min</span></div>` : '',
    r.totalTime ? `<div class="recipe-meta-item">${clockIcon()} <span>Total: ${formatTime(r.totalTime)}</span></div>` : '',
    r.servings  ? `<div class="recipe-meta-item">${servingsIcon()} <span>Serves ${r.servings}</span></div>` : ''
  ].filter(Boolean).join('');

  // Inline status selector buttons
  const statusSelector = `
    <div class="status-selector" id="statusSelector">
      ${STATUS_OPTIONS.map(opt => {
        const active = opt === status ? STATUS_ACTIVE[opt] : '';
        return `<button class="status-opt ${active}" data-status="${escHtml(opt)}">${escHtml(opt)}</button>`;
      }).join('')}
    </div>`;

  // Ingredients
  const ingredients = (r.ingredients || []).map((ing, i) => `
    <li>
      <input type="checkbox" class="ingredient-check" id="ing_${i}" aria-label="Check off ${escHtml(ing)}">
      <span>${escHtml(ing)}</span>
    </li>`).join('');

  // Instructions
  const instructions = (r.instructions || []).map(step => `
    <li><p>${escHtml(step)}</p></li>`).join('');

  // Notes
  const notesHtml = r.notes ? `
    <div class="notes-box">
      <div class="section-title">📝 Notes &amp; tips</div>
      <p>${escHtml(r.notes).replace(/\n/g,'<br>')}</p>
    </div>` : '';

  // Image
  const imageHtml = r.imageUrl
    ? `<img class="recipe-hero-img" src="${escHtml(r.imageUrl)}" alt="${escHtml(r.title)}" onerror="this.style.display='none'">`
    : '';

  // Source
  const sourceHtml = r.sourceUrl ? `
    <div class="recipe-source">
      ${externalIcon()}
      <span>Source: <a href="${escHtml(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escHtml(sourceDomain(r.sourceUrl))}</a></span>
    </div>` : '';

  document.getElementById('recipeDetail').innerHTML = `
    <div class="recipe-hero">
      ${imageHtml}
      <h1 class="recipe-title">${escHtml(r.title)}</h1>
      ${r.rating ? `<div class="recipe-stars">${stars}</div>` : ''}
      <div class="recipe-meta-row">${times}</div>
      <div class="recipe-tags">${statusBadge}${allTags}</div>
      ${statusSelector}
      ${sourceHtml}
      ${r.description ? `<p class="recipe-description">${escHtml(r.description)}</p>` : ''}
    </div>

    <div class="recipe-cols">
      <div class="ingredients-box">
        <div class="section-title">Ingredients</div>
        <ul class="ingredients-list">${ingredients}</ul>
      </div>
      <div>
        <div class="section-title">Instructions</div>
        <ol class="instructions-list">${instructions}</ol>
      </div>
    </div>

    ${notesHtml}

    <div class="cooked-log" id="cookedLog"></div>
  `;

  renderCookedLog();
  bindStatusSelector();
}

/* ── Inline status selector ──────────────────────────── */
function bindStatusSelector() {
  document.getElementById('statusSelector').addEventListener('click', async e => {
    const btn = e.target.closest('.status-opt');
    if (!btn) return;
    const newStatus = btn.dataset.status;
    if (newStatus === currentRecipe.status) return;

    currentRecipe.status = newStatus;

    // Update button states
    document.querySelectorAll('.status-opt').forEach(b => {
      b.className = 'status-opt';
      if (b.dataset.status === newStatus) b.classList.add(STATUS_ACTIVE[newStatus]);
    });

    // Update badge in tags row
    const badge = document.querySelector('.status-badge');
    if (badge) {
      badge.className = `status-badge ${STATUS_CLASS[newStatus] || 'status-want'}`;
      badge.textContent = newStatus;
    }

    await persist();
  });
}

/* ── Cooked log ──────────────────────────────────────── */
function renderCookedLog() {
  const el = document.getElementById('cookedLog');
  if (!el) return;
  const dates = currentRecipe.cookedDates || [];
  const today = new Date().toISOString().slice(0, 10);

  const entries = dates.length === 0
    ? `<div class="cooked-log-empty">No entries yet — add your first below.</div>`
    : [...dates].reverse().map((d, i) => `
        <div class="cooked-log-entry">
          <span>${formatDate(d)}</span>
          <button class="cooked-log-del" data-date="${escHtml(d)}" title="Remove this entry">×</button>
        </div>`).join('');

  el.innerHTML = `
    <div class="cooked-log-header">
      <div class="cooked-log-title">Made it log</div>
      <div class="cooked-log-count">${dates.length} time${dates.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="cooked-log-add">
      <input type="date" id="logDateInput" value="${today}" max="${today}">
      <button class="cooked-log-add-btn" id="logAddBtn">+ Log date</button>
    </div>
    <div class="cooked-log-list">${entries}</div>`;

  document.getElementById('logAddBtn').addEventListener('click', addCookedEntry);
  document.querySelectorAll('.cooked-log-del').forEach(btn =>
    btn.addEventListener('click', () => deleteCookedEntry(btn.dataset.date))
  );
}

async function addCookedEntry() {
  const input = document.getElementById('logDateInput');
  const date = input.value;
  if (!date) return;

  const dates = currentRecipe.cookedDates || [];
  if (dates.includes(date)) {
    input.style.borderColor = 'var(--danger)';
    setTimeout(() => { input.style.borderColor = ''; }, 1500);
    return;
  }

  dates.push(date);
  dates.sort();
  currentRecipe.cookedDates = dates;

  // Auto-upgrade status on first log
  if (!currentRecipe.status || currentRecipe.status === 'Want to Make') {
    currentRecipe.status = 'Made';
    // Refresh status selector display
    document.querySelectorAll('.status-opt').forEach(b => {
      b.className = 'status-opt';
      if (b.dataset.status === 'Made') b.classList.add(STATUS_ACTIVE['Made']);
    });
    const badge = document.querySelector('.status-badge');
    if (badge) { badge.className = `status-badge ${STATUS_CLASS['Made']}`; badge.textContent = 'Made'; }
  }

  renderCookedLog();
  await persist();
}

async function deleteCookedEntry(date) {
  currentRecipe.cookedDates = (currentRecipe.cookedDates || []).filter(d => d !== date);
  renderCookedLog();
  await persist();
}

/* ── Persist to GitHub via Worker ─────────────────────── */
async function persist() {
  const cfg = getConfig();
  if (!cfg.workerUrl || !cfg.password) return;
  // Update in allRecipes array
  const idx = allRecipes.findIndex(r => r.id === currentRecipe.id);
  if (idx >= 0) allRecipes[idx] = currentRecipe;
  try {
    await fetch(cfg.workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', password: cfg.password, payload: currentRecipe, recipes: allRecipes })
    });
  } catch { /* silent — data already updated in memory */ }
}

function renderError(msg) {
  document.getElementById('recipeDetail').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">😕</div>
      <p class="empty-title">${escHtml(msg)}</p>
      <p><a href="index.html">Back to all recipes</a></p>
    </div>`;
}

/* ── Helpers ──────────────────────────────────────────── */
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatTime(min) {
  if (!min) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function sourceDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
function clockIcon() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/></svg>`;
}
function servingsIcon() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 2v5a5 5 0 0010 0V2M8 12v2M6 14h4"/></svg>`;
}
function externalIcon() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3H3v10h10V9M9 2h5v5M14 2l-6 6"/></svg>`;
}
