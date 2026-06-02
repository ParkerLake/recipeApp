/* ── Tag definitions ──────────────────────────────────── */
const TAG_CATEGORIES = {
  protein: {
    label: 'Protein',
    options: ['Chicken','Beef','Pork','Lamb','Seafood','Turkey','Vegetarian','Vegan','Eggs']
  },
  region: {
    label: 'Region',
    options: ['Mexican','Italian','Asian','Mediterranean','American','Indian','French','Middle Eastern','Japanese','Thai','Korean','Greek','African']
  },
  complexity: {
    label: 'Complexity',
    options: ['Quick (<30 min)','Easy (30-60 min)','Moderate (1-2 hrs)','Weekend project']
  },
  meal: {
    label: 'Meal type',
    options: ['Breakfast','Lunch','Dinner','Appetizer','Side dish','Dessert']
  }
};

/* ── Emoji placeholders by protein ───────────────────── */
const PROTEIN_EMOJI = {
  'Chicken':'🍗','Beef':'🥩','Pork':'🥓','Lamb':'🍖','Seafood':'🐟',
  'Turkey':'🦃','Vegetarian':'🥦','Vegan':'🌱','Eggs':'🥚'
};

/* ── Status config ────────────────────────────────────── */
const STATUS_OPTIONS = ['Want to Make', 'Made', 'Normal Rotation'];
const STATUS_CLASS   = { 'Want to Make': 'status-want', 'Made': 'status-tried', 'Normal Rotation': 'status-regular' };
const STATUS_LABEL   = { 'Want to Make': 'Want to Make', 'Made': 'Made', 'Normal Rotation': '⭐ Normal Rotation' };

/* ── State ────────────────────────────────────────────── */
let recipes = [];
let activeFilters = { protein: new Set(), region: new Set(), complexity: new Set(), meal: new Set() };
let activeStatusFilter = new Set();
let searchQuery = '';
let sortBy = 'dateAdded';
let currentEditId = null;
let currentRating = 0;
let hoverRating = 0;

/* ── Config (stored in localStorage) ─────────────────── */
const getConfig = () => ({
  workerUrl: localStorage.getItem('mep_workerUrl') || '',
  password:  localStorage.getItem('mep_password')  || ''
});

const saveConfig = (workerUrl, password) => {
  localStorage.setItem('mep_workerUrl', workerUrl);
  localStorage.setItem('mep_password',  password);
};

/* ── Init ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  bindHeaderEvents();
  bindModalEvents();
  bindSettingsEvents();
  renderSidebar();
  await loadRecipes();

  // Handle ?edit=id coming back from the detail page
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  if (editId) {
    // Clean the URL without reloading
    history.replaceState({}, '', window.location.pathname);
    openModal(editId);
  }

  const cfg = getConfig();
  if (!cfg.workerUrl || !cfg.password) showSettingsModal();
});

/* ── Load recipes from static JSON ───────────────────── */
async function loadRecipes() {
  showLoading(true);
  try {
    const resp = await fetch('data/recipes.json?v=' + Date.now());
    if (!resp.ok) throw new Error('Could not load recipes');
    recipes = await resp.json();
  } catch (e) {
    recipes = [];
    showToast('Could not load recipes — check your connection', 'error');
  }
  showLoading(false);
  renderGrid();
  renderSidebar();
}

/* ── Sidebar ──────────────────────────────────────────── */
function renderSidebar() {
  const container = document.getElementById('sidebarContent');
  const counts = computeTagCounts();
  const statusCounts = computeStatusCounts();

  // Status section
  const statusSection = `
    <div class="sidebar-section">
      <div class="sidebar-section-label">
        Status
        ${activeStatusFilter.size ? `<button class="sidebar-clear-btn" onclick="clearStatusFilter()">clear</button>` : ''}
      </div>
      ${STATUS_OPTIONS.map(opt => {
        const count = statusCounts[opt] || 0;
        if (count === 0 && recipes.length > 0) return '';
        const active = activeStatusFilter.has(opt) ? 'active' : '';
        return `
          <div class="filter-item ${active}" onclick="toggleStatusFilter('${opt.replace(/'/g,"\\'")}')">
            <span>${opt}</span>
            <span class="filter-count">${count}</span>
          </div>`;
      }).join('')}
    </div>`;

  const tagSections = Object.entries(TAG_CATEGORIES).map(([cat, def]) => {
    const activeCount = activeFilters[cat].size;
    return `
      <div class="sidebar-section">
        <div class="sidebar-section-label">
          ${def.label}
          ${activeCount ? `<button class="sidebar-clear-btn" onclick="clearCategoryFilter('${cat}')">clear</button>` : ''}
        </div>
        ${def.options.map(opt => {
          const count = counts[cat]?.[opt] || 0;
          if (count === 0 && recipes.length > 0) return '';
          const active = activeFilters[cat].has(opt) ? 'active' : '';
          return `
            <div class="filter-item ${active}" onclick="toggleFilter('${cat}','${opt.replace(/'/g,"\\'")}')">
              <span>${opt}</span>
              <span class="filter-count">${count}</span>
            </div>`;
        }).join('')}
      </div>`;
  }).join('');

  container.innerHTML = statusSection + tagSections;
}

function computeStatusCounts() {
  const counts = {};
  for (const r of recipes) {
    const s = r.status || 'Want to Make';
    counts[s] = (counts[s] || 0) + 1;
  }
  return counts;
}

function toggleStatusFilter(val) {
  if (activeStatusFilter.has(val)) activeStatusFilter.delete(val);
  else activeStatusFilter.add(val);
  renderSidebar();
  renderActiveFilterBar();
  renderGrid();
}

function clearStatusFilter() {
  activeStatusFilter.clear();
  renderSidebar();
  renderActiveFilterBar();
  renderGrid();
}

function computeTagCounts() {
  const counts = {};
  for (const cat of Object.keys(TAG_CATEGORIES)) {
    counts[cat] = {};
    for (const r of recipes) {
      for (const val of (r.tags?.[cat] || [])) {
        counts[cat][val] = (counts[cat][val] || 0) + 1;
      }
    }
  }
  return counts;
}

function toggleFilter(cat, val) {
  if (activeFilters[cat].has(val)) {
    activeFilters[cat].delete(val);
  } else {
    activeFilters[cat].add(val);
  }
  renderSidebar();
  renderActiveFilterBar();
  renderGrid();
}

function clearCategoryFilter(cat) {
  activeFilters[cat].clear();
  renderSidebar();
  renderActiveFilterBar();
  renderGrid();
}

function clearAllFilters() {
  for (const cat of Object.keys(activeFilters)) activeFilters[cat].clear();
  activeStatusFilter.clear();
  renderSidebar();
  renderActiveFilterBar();
  renderGrid();
}

/* ── Active filter chips ──────────────────────────────── */
function renderActiveFilterBar() {
  const bar = document.getElementById('activeFilterBar');
  const chips = [];
  for (const val of activeStatusFilter) chips.push({ type: 'status', val });
  for (const [cat, vals] of Object.entries(activeFilters)) {
    for (const val of vals) chips.push({ type: 'tag', cat, val });
  }
  if (chips.length === 0) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  bar.innerHTML = chips.map(c => c.type === 'status'
    ? `<span class="filter-chip">${c.val}<button class="filter-chip-remove" onclick="toggleStatusFilter('${c.val.replace(/'/g,"\\'")}')">×</button></span>`
    : `<span class="filter-chip">${c.val}<button class="filter-chip-remove" onclick="toggleFilter('${c.cat}','${c.val.replace(/'/g,"\\'")}')">×</button></span>`
  ).join('') +
    `<button class="btn-ghost" style="font-size:12px;padding:4px 8px" onclick="clearAllFilters()">Clear all</button>`;
}

/* ── Recipe grid ──────────────────────────────────────── */
function getFilteredSorted() {
  let list = recipes.slice();

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(r =>
      r.title?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q) ||
      r.notes?.toLowerCase().includes(q) ||
      r.ingredients?.some(i => i.toLowerCase().includes(q)) ||
      r.instructions?.some(i => i.toLowerCase().includes(q)) ||
      Object.values(r.tags || {}).flat().some(t => t.toLowerCase().includes(q))
    );
  }

  // Status filter (OR within)
  if (activeStatusFilter.size > 0) {
    list = list.filter(r => activeStatusFilter.has(r.status || 'Want to Make'));
  }

  // Tag filters (AND between categories, OR within)
  for (const [cat, vals] of Object.entries(activeFilters)) {
    if (vals.size === 0) continue;
    list = list.filter(r => {
      const recipeTags = r.tags?.[cat] || [];
      return recipeTags.some(t => vals.has(t));
    });
  }

  // Sort
  list.sort((a, b) => {
    if (sortBy === 'rating')     return (b.rating || 0) - (a.rating || 0);
    if (sortBy === 'title')      return a.title.localeCompare(b.title);
    if (sortBy === 'totalTime')  return (a.totalTime || 999) - (b.totalTime || 999);
    // dateAdded default (newest first)
    return new Date(b.dateAdded) - new Date(a.dateAdded);
  });

  return list;
}

function renderGrid() {
  const list = getFilteredSorted();
  const grid = document.getElementById('recipeGrid');
  const empty = document.getElementById('emptyState');

  if (list.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = list.map(r => {
    const protein = r.tags?.protein?.[0] || '';
    const region  = r.tags?.region?.[0]  || '';
    const emoji   = r.imageUrl ? '' : (PROTEIN_EMOJI[protein] || '🍽');
    const imageEl = r.imageUrl
      ? `<img class="card-image" src="${escHtml(r.imageUrl)}" alt="${escHtml(r.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const placeholderStyle = r.imageUrl ? 'style="display:none"' : '';
    const timeStr = r.totalTime
      ? `${r.totalTime >= 60 ? Math.round(r.totalTime/60) + ' hr' : r.totalTime + ' min'}`
      : '';

    const stars = [1,2,3,4,5].map(i =>
      `<span class="card-star ${i <= (r.rating||0) ? 'filled' : ''}">★</span>`).join('');

    const tagHtml = [
      protein ? `<span class="card-tag tag-protein">${escHtml(protein)}</span>` : '',
      region  ? `<span class="card-tag tag-region">${escHtml(region)}</span>`   : ''
    ].filter(Boolean).join('');

    const status = r.status || 'Want to Make';
    const statusCls = STATUS_CLASS[status] || 'status-want';
    const statusLbl = STATUS_LABEL[status] || status;

    return `
      <article class="recipe-card" onclick="openRecipe('${r.id}')" tabindex="0" role="button" aria-label="${escHtml(r.title)}">
        ${imageEl}
        <div class="card-image-placeholder" ${placeholderStyle}>${emoji}</div>
        <div class="card-body">
          <div class="card-title">${escHtml(r.title)}</div>
          <div class="card-meta">
            ${timeStr ? `<span>${timeStr}</span>` : ''}
            ${timeStr && r.servings ? `<span class="card-meta-dot">·</span>` : ''}
            ${r.servings ? `<span>Serves ${r.servings}</span>` : ''}
          </div>
          ${r.rating ? `<div class="card-stars">${stars}</div>` : ''}
          <div class="card-tags" style="margin-top:auto">
            <span class="status-badge ${statusCls}">${escHtml(statusLbl)}</span>
            ${tagHtml}
          </div>
        </div>
      </article>`;
  }).join('');
}

/* ── Open recipe detail page ──────────────────────────── */
function openRecipe(id) {
  window.location.href = `recipe.html?id=${encodeURIComponent(id)}`;
}

/* ── Header events ────────────────────────────────────── */
function bindHeaderEvents() {
  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    renderGrid();
  });

  document.getElementById('sortSelect').addEventListener('change', e => {
    sortBy = e.target.value;
    renderGrid();
  });

  document.getElementById('addBtn').addEventListener('click', () => openModal(null));
  document.getElementById('settingsBtn').addEventListener('click', showSettingsModal);
}

/* ── Add / Edit modal ─────────────────────────────────── */
function bindModalEvents() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('saveBtn').addEventListener('click', handleSave);
  document.getElementById('deleteBtn').addEventListener('click', handleDelete);
  document.getElementById('extractBtn').addEventListener('click', handleExtract);

  // Close on backdrop click
  document.getElementById('recipeModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Star rating picker
  const picker = document.getElementById('starPicker');
  picker.querySelectorAll('.star').forEach(btn => {
    btn.addEventListener('mouseover', () => {
      hoverRating = +btn.dataset.val;
      updateStarDisplay();
    });
    btn.addEventListener('mouseout', () => {
      hoverRating = 0;
      updateStarDisplay();
    });
    btn.addEventListener('click', () => {
      const val = +btn.dataset.val;
      currentRating = currentRating === val ? 0 : val; // toggle off if same
      document.getElementById('fieldRating').value = currentRating;
      updateStarDisplay();
    });
  });
}

function updateStarDisplay() {
  const active = hoverRating || currentRating;
  document.querySelectorAll('#starPicker .star').forEach(btn => {
    btn.classList.toggle('selected', +btn.dataset.val <= active);
    btn.classList.toggle('hover', hoverRating > 0 && +btn.dataset.val <= hoverRating);
  });
}

function openModal(id) {
  currentEditId = id;
  const recipe = id ? recipes.find(r => r.id === id) : null;
  document.getElementById('modalTitle').textContent = recipe ? 'Edit recipe' : 'Add recipe';
  document.getElementById('urlSection').classList.toggle('hidden', !!recipe);
  document.getElementById('deleteBtn').classList.toggle('hidden', !recipe);

  // Build tag checkboxes
  document.getElementById('tagCheckboxes').innerHTML = Object.entries(TAG_CATEGORIES).map(([cat, def]) => `
    <div>
      <div class="tag-category-label">${def.label}</div>
      <div class="tag-options">
        ${def.options.map(opt => {
          const checked = recipe?.tags?.[cat]?.includes(opt) ? 'checked' : '';
          const id = `tag_${cat}_${opt.replace(/\s+/g,'_').replace(/[^a-z0-9_]/gi,'')}`;
          return `
            <input type="checkbox" class="tag-checkbox" id="${id}" name="tag_${cat}" value="${opt}" ${checked}>
            <label class="tag-checkbox-label" for="${id}">${opt}</label>`;
        }).join('')}
      </div>
    </div>`).join('');

  // Fill form
  if (recipe) {
    document.getElementById('fieldId').value         = recipe.id;
    document.getElementById('fieldSlug').value       = recipe.slug || '';
    document.getElementById('fieldTitle').value      = recipe.title || '';
    document.getElementById('fieldServings').value   = recipe.servings || '';
    document.getElementById('fieldSourceUrl').value  = recipe.sourceUrl || '';
    document.getElementById('fieldPrepTime').value   = recipe.prepTime || '';
    document.getElementById('fieldCookTime').value   = recipe.cookTime || '';
    document.getElementById('fieldTotalTime').value  = recipe.totalTime || '';
    document.getElementById('fieldDescription').value = recipe.description || '';
    document.getElementById('fieldIngredients').value = (recipe.ingredients || []).join('\n');
    document.getElementById('fieldInstructions').value = (recipe.instructions || []).join('\n');
    document.getElementById('fieldNotes').value      = recipe.notes || '';
    document.getElementById('fieldImageUrl').value   = recipe.imageUrl || '';
    document.getElementById('fieldStatus').value     = recipe.status || 'Want to Make';
    currentRating = recipe.rating || 0;
  } else {
    document.getElementById('recipeForm').reset();
    document.getElementById('fieldId').value = '';
    document.getElementById('fieldSlug').value = '';
    document.getElementById('urlInput').value = '';
    document.getElementById('extractStatus').className = 'extract-status hidden';
    currentRating = 0;
  }
  document.getElementById('fieldRating').value = currentRating;
  hoverRating = 0;
  updateStarDisplay();

  document.getElementById('recipeModal').classList.remove('hidden');
  document.getElementById('fieldTitle').focus();
}

function closeModal() {
  document.getElementById('recipeModal').classList.add('hidden');
  currentEditId = null;
}

/* ── Save ─────────────────────────────────────────────── */
async function handleSave() {
  const title = document.getElementById('fieldTitle').value.trim();
  if (!title) {
    showToast('Please enter a recipe title', 'error');
    document.getElementById('fieldTitle').focus();
    return;
  }

  const existingId = document.getElementById('fieldId').value;
  const existingSlug = document.getElementById('fieldSlug').value;
  const now = new Date().toISOString();

  const recipe = {
    id:          existingId || generateId(),
    slug:        existingSlug || generateSlug(title),
    title,
    sourceUrl:   document.getElementById('fieldSourceUrl').value.trim(),
    imageUrl:    document.getElementById('fieldImageUrl').value.trim(),
    description: document.getElementById('fieldDescription').value.trim(),
    prepTime:    parseInt(document.getElementById('fieldPrepTime').value)  || null,
    cookTime:    parseInt(document.getElementById('fieldCookTime').value)  || null,
    totalTime:   parseInt(document.getElementById('fieldTotalTime').value) || null,
    servings:    parseInt(document.getElementById('fieldServings').value)  || null,
    ingredients: parseLines(document.getElementById('fieldIngredients').value),
    instructions: parseLines(document.getElementById('fieldInstructions').value),
    notes:       document.getElementById('fieldNotes').value.trim(),
    rating:      parseInt(document.getElementById('fieldRating').value) || 0,
    tags:        collectTags(),
    status:      document.getElementById('fieldStatus').value || 'Want to Make',
    cookedDates: existingId
      ? (recipes.find(r => r.id === existingId)?.cookedDates || [])
      : [],
    dateAdded:   existingId
      ? recipes.find(r => r.id === existingId)?.dateAdded || now
      : now,
    dateModified: now
  };

  // Optimistic update
  if (existingId) {
    const idx = recipes.findIndex(r => r.id === existingId);
    if (idx >= 0) recipes[idx] = recipe;
  } else {
    recipes.unshift(recipe);
  }
  renderGrid();
  renderSidebar();
  closeModal();
  showToast('Saving…');

  // Persist via Worker
  const ok = await persistRecipes('upsert', recipe);
  showToast(ok ? 'Recipe saved!' : 'Saved locally — sync failed', ok ? 'success' : 'error');
}

/* ── Delete ───────────────────────────────────────────── */
async function handleDelete() {
  if (!currentEditId) return;
  if (!confirm('Delete this recipe? This cannot be undone.')) return;
  const id = currentEditId;
  recipes = recipes.filter(r => r.id !== id);
  renderGrid();
  renderSidebar();
  closeModal();
  showToast('Deleting…');
  const ok = await persistRecipes('delete', { id });
  showToast(ok ? 'Recipe deleted' : 'Deleted locally — sync failed', ok ? '' : 'error');
}

/* ── Collect tags from checkboxes ─────────────────────── */
function collectTags() {
  const tags = {};
  for (const cat of Object.keys(TAG_CATEGORIES)) {
    tags[cat] = Array.from(
      document.querySelectorAll(`input[name="tag_${cat}"]:checked`)
    ).map(el => el.value);
  }
  return tags;
}

/* ── URL extraction ───────────────────────────────────── */
async function handleExtract() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) { showToast('Paste a URL first', 'error'); return; }

  const cfg = getConfig();
  if (!cfg.workerUrl) {
    showToast('Add your Worker URL in Settings first', 'error');
    showSettingsModal();
    return;
  }

  // Validate Worker URL looks reasonable before sending
  let workerUrl;
  try {
    workerUrl = new URL(cfg.workerUrl);
  } catch {
    setExtractStatus('error', '✕  Invalid Worker URL — go to Settings and check it starts with https://');
    return;
  }

  setExtractStatus('loading', '⏳  Fetching recipe…');
  document.getElementById('extractBtn').disabled = true;

  try {
    const resp = await fetch(workerUrl.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'extract', url, password: cfg.password })
    });

    if (!resp.ok) {
      let errMsg;
      try { errMsg = (await resp.json()).error; } catch { /* non-JSON body */ }
      if (resp.status === 401) {
        throw new Error('Wrong password — re-open Settings and make sure the App Password matches your Cloudflare APP_PASSWORD variable exactly');
      }
      if (resp.status === 405) {
        throw new Error('Wrong Worker URL — go to Settings and make sure it ends in .workers.dev, not .github.io');
      }
      if (resp.status === 500) {
        throw new Error((errMsg || 'Worker error') + ' — check your Worker logs in the Cloudflare dashboard');
      }
      throw new Error(errMsg || `Request failed (HTTP ${resp.status})`);
    }

    const data = await resp.json();
    if (!data.title) throw new Error('No recipe found at that URL — try opening the link directly and copying the exact recipe page URL (not a Pinterest pin)');

    // Pre-fill form
    if (data.title)        document.getElementById('fieldTitle').value       = data.title;
    if (data.description)  document.getElementById('fieldDescription').value = data.description;
    if (data.prepTime)     document.getElementById('fieldPrepTime').value    = data.prepTime;
    if (data.cookTime)     document.getElementById('fieldCookTime').value    = data.cookTime;
    if (data.totalTime)    document.getElementById('fieldTotalTime').value   = data.totalTime;
    if (data.servings)     document.getElementById('fieldServings').value    = data.servings;
    if (data.ingredients)  document.getElementById('fieldIngredients').value = data.ingredients.join('\n');
    if (data.instructions) document.getElementById('fieldInstructions').value = data.instructions.join('\n');
    if (data.imageUrl)     document.getElementById('fieldImageUrl').value    = data.imageUrl;
    document.getElementById('fieldSourceUrl').value = data.sourceUrl || url;

    // Auto-suggest tags from extracted data
    if (data.suggestedTags) {
      for (const [cat, vals] of Object.entries(data.suggestedTags)) {
        for (const val of (vals || [])) {
          const id = `tag_${cat}_${val.replace(/\s+/g,'_').replace(/[^a-z0-9_]/gi,'')}`;
          const el = document.getElementById(id);
          if (el) el.checked = true;
        }
      }
    }

    setExtractStatus('success', '✓  Recipe extracted — review and save');
  } catch (e) {
    let msg = e.message || 'Could not extract recipe';
    if (msg === 'Failed to fetch' || msg.includes('NetworkError') || msg.includes('Load failed')) {
      msg = 'Could not reach your Worker — check the Worker URL in Settings and make sure your Worker is deployed in Cloudflare';
    }
    setExtractStatus('error', '✕  ' + msg);
  } finally {
    document.getElementById('extractBtn').disabled = false;
  }
}

function setExtractStatus(type, msg) {
  const el = document.getElementById('extractStatus');
  el.className = `extract-status ${type}`;
  el.textContent = msg;
}

/* ── Persist to GitHub via Worker ─────────────────────── */
async function persistRecipes(action, payload) {
  const cfg = getConfig();
  if (!cfg.workerUrl || !cfg.password) return false;
  try {
    const resp = await fetch(cfg.workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, password: cfg.password, payload, recipes })
    });
    return resp.ok;
  } catch (e) {
    return false;
  }
}

/* ── Settings modal ───────────────────────────────────── */
function showSettingsModal() {
  const cfg = getConfig();
  document.getElementById('settingWorkerUrl').value = cfg.workerUrl;
  document.getElementById('settingPassword').value  = cfg.password;
  document.getElementById('settingsModal').classList.remove('hidden');
}

function bindSettingsEvents() {
  document.getElementById('settingsClose').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('hidden');
  });
  document.getElementById('settingsCancelBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('hidden');
  });
  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    const url = document.getElementById('settingWorkerUrl').value.trim();
    const pw  = document.getElementById('settingPassword').value.trim();
    saveConfig(url, pw);
    document.getElementById('settingsModal').classList.add('hidden');
    showToast('Settings saved', 'success');
  });
  document.getElementById('settingsModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });
}

/* ── Toast ────────────────────────────────────────────── */
let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast visible ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

/* ── Loading state ────────────────────────────────────── */
function showLoading(on) {
  document.getElementById('loadingState').classList.toggle('hidden', !on);
  document.getElementById('recipeGrid').classList.toggle('hidden', on);
}

/* ── Helpers ──────────────────────────────────────────── */
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function parseLines(text) {
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}
function generateId() {
  return 'rec_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}
function generateSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
}
