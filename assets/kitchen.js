/* ── Kitchen mode — full scrollable recipe view ──────── */

let wakeLock = null;

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  document.getElementById('backBtn').href = id
    ? `recipe.html?id=${encodeURIComponent(id)}`
    : 'index.html';

  if (!id) { showError('No recipe specified.'); return; }

  try {
    const resp = await fetch('data/recipes.json?v=' + Date.now());
    if (!resp.ok) throw new Error('Could not load recipes');
    const recipes = await resp.json();
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) throw new Error('Recipe not found');

    document.title = `${recipe.title} — Kitchen`;
    document.getElementById('kTitle').textContent = recipe.title;

    renderRecipe(recipe);
    bindWakeLock();
  } catch (e) {
    showError(e.message);
  }
});

/* ── Render full recipe ─────────────────────────────── */
function renderRecipe(r) {
  const timeStr = [
    r.prepTime  ? `Prep ${r.prepTime} min` : '',
    r.cookTime  ? `Cook ${r.cookTime} min` : '',
    r.totalTime ? `Total ${formatTime(r.totalTime)}` : '',
    r.servings  ? `Serves ${r.servings}` : ''
  ].filter(Boolean).join('  ·  ');

  const ingredients = (r.ingredients || []).map((ing, i) => `
    <li>
      <input type="checkbox" class="k-check" id="king_${i}">
      <label for="king_${i}">${escHtml(ing)}</label>
    </li>`).join('');

  const instructions = (r.instructions || []).map((step, i) => `
    <li>
      <div class="k-step-num">${i + 1}</div>
      <div class="k-step-body">${escHtml(step)}</div>
    </li>`).join('');

  document.getElementById('kMain').innerHTML = `
    <div class="k-recipe">
      ${r.imageUrl ? `<img class="k-hero-img" src="${escHtml(r.imageUrl)}" alt="${escHtml(r.title)}" onerror="this.remove()">` : ''}
      <h1 class="k-recipe-title">${escHtml(r.title)}</h1>
      ${timeStr ? `<p class="k-meta">${escHtml(timeStr)}</p>` : ''}
      ${r.description ? `<p class="k-desc">${escHtml(r.description)}</p>` : ''}

      <div class="k-section-label">Ingredients</div>
      <ul class="k-ingredients">${ingredients}</ul>

      <div class="k-divider"></div>

      <div class="k-section-label">Instructions</div>
      <ol class="k-instructions">${instructions}</ol>

      ${r.notes ? `
        <div class="k-divider"></div>
        <div class="k-section-label">Notes</div>
        <p class="k-notes">${escHtml(r.notes).replace(/\n/g,'<br>')}</p>` : ''}
    </div>`;
}

/* ── Wake Lock ──────────────────────────────────────── */
async function bindWakeLock() {
  const btn = document.getElementById('wakeLockBtn');
  if (!('wakeLock' in navigator)) { btn.style.display = 'none'; return; }

  async function acquire() {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      btn.classList.add('active');
      wakeLock.addEventListener('release', () => btn.classList.remove('active'));
    } catch { btn.classList.remove('active'); }
  }

  await acquire();

  btn.addEventListener('click', async () => {
    if (wakeLock && !wakeLock.released) {
      wakeLock.release(); wakeLock = null;
      btn.classList.remove('active');
    } else {
      await acquire();
    }
  });

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && btn.classList.contains('active')) await acquire();
  });
}

/* ── Error ──────────────────────────────────────────── */
function showError(msg) {
  document.getElementById('kMain').innerHTML = `
    <div class="k-center">
      <div style="font-size:40px">😕</div>
      <p>${escHtml(msg)}</p>
      <a href="index.html" style="color:var(--accent)">Back to recipes</a>
    </div>`;
}

function formatTime(min) {
  if (!min) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
