/* ── Recipe detail page ───────────────────────────────── */

const TAG_COLORS = {
  protein:    'tag-protein',
  region:     'tag-region',
  complexity: 'tag-complexity',
  meal:       'tag-meal'
};

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    renderError('No recipe specified.');
    return;
  }

  try {
    const resp = await fetch('data/recipes.json?v=' + Date.now());
    if (!resp.ok) throw new Error('Could not load recipes');
    const recipes = await resp.json();
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) throw new Error('Recipe not found');
    renderRecipe(recipe);
  } catch (e) {
    renderError(e.message);
  }
});

function renderRecipe(r) {
  // Update page title
  document.title = `${r.title} — Mise en Place`;
  document.getElementById('headerTitle').textContent = r.title;

  // Edit button — passes id back to index with edit intent
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

  // Time stats
  const times = [
    r.prepTime  ? `<div class="recipe-meta-item">${clockIcon()} <span>Prep: ${r.prepTime} min</span></div>` : '',
    r.cookTime  ? `<div class="recipe-meta-item">${clockIcon()} <span>Cook: ${r.cookTime} min</span></div>` : '',
    r.totalTime ? `<div class="recipe-meta-item">${clockIcon()} <span>Total: ${formatTime(r.totalTime)}</span></div>` : '',
    r.servings  ? `<div class="recipe-meta-item">${servingsIcon()} <span>Serves ${r.servings}</span></div>` : ''
  ].filter(Boolean).join('');

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
      ${allTags ? `<div class="recipe-tags">${allTags}</div>` : ''}
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
  `;
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
