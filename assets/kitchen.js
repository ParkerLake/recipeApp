/* ── Kitchen mode ─────────────────────────────────────── */

let recipe = null;
// Steps: [0] = ingredients view, [1..n] = instruction steps
let stepIndex = 0;
let wakeLock = null;

/* ── Init ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  // Back button returns to recipe detail
  document.getElementById('backBtn').href = id
    ? `recipe.html?id=${encodeURIComponent(id)}`
    : 'index.html';

  if (!id) {
    showError('No recipe specified.');
    return;
  }

  try {
    const resp = await fetch('data/recipes.json?v=' + Date.now());
    if (!resp.ok) throw new Error('Could not load recipes');
    const recipes = await resp.json();
    recipe = recipes.find(r => r.id === id);
    if (!recipe) throw new Error('Recipe not found');

    document.title = `${recipe.title} — Kitchen`;
    document.getElementById('kTitle').textContent = recipe.title;

    renderStep();
    bindNav();
    bindSwipe();
    bindWakeLock();
  } catch (e) {
    showError(e.message);
  }
});

/* ── Steps ─────────────────────────────────────────────── */
function totalSteps() {
  return 1 + (recipe.instructions?.length || 0); // 0 = ingredients, 1..n = steps
}

function renderStep() {
  const total = totalSteps();
  const pct = totalSteps() <= 1 ? 100 : (stepIndex / (total - 1)) * 100;

  document.getElementById('kMain').innerHTML = `
    <div class="k-progress-bar"><div class="k-progress-fill" style="width:${pct}%"></div></div>
    <div class="k-step-counter">${stepIndex === 0 ? 'Ingredients' : `Step ${stepIndex} of ${total - 1}`}</div>
    <div class="k-step-wrap" id="kStepWrap">
      ${stepIndex === 0 ? renderIngredients() : renderInstruction()}
    </div>
    <div class="k-nav">
      <button class="k-nav-btn k-prev-btn" id="kPrev" ${stepIndex === 0 ? 'disabled' : ''}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 3L5 8l5 5"/></svg>
        Prev
      </button>
      <button class="k-nav-btn k-next-btn ${stepIndex === total - 1 ? 'done' : ''}" id="kNext">
        ${stepIndex === total - 1
          ? 'Done 🎉'
          : `Next <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 3l5 5-5 5"/></svg>`}
      </button>
    </div>`;

  document.getElementById('kPrev').addEventListener('click', () => { if (stepIndex > 0) { stepIndex--; renderStep(); } });
  document.getElementById('kNext').addEventListener('click', () => {
    if (stepIndex < totalSteps() - 1) { stepIndex++; renderStep(); }
    else { window.location.href = document.getElementById('backBtn').href; }
  });
}

function renderIngredients() {
  const items = (recipe.ingredients || []).map((ing, i) => `
    <li>
      <input type="checkbox" class="k-ing-check" id="king_${i}">
      <span>${escHtml(ing)}</span>
    </li>`).join('');
  return `
    <div class="k-ingredients-view">
      <h2>Ingredients</h2>
      <ul class="k-ingredients-list">${items}</ul>
    </div>`;
}

function renderInstruction() {
  const text = recipe.instructions[stepIndex - 1] || '';
  return `<div class="k-step-text">${escHtml(text)}</div>`;
}

/* ── Keyboard nav ──────────────────────────────────────── */
function bindNav() {
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') document.getElementById('kNext')?.click();
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   document.getElementById('kPrev')?.click();
  });
}

/* ── Swipe gestures ───────────────────────────────────── */
function bindSwipe() {
  let startX = 0, startY = 0;
  document.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) document.getElementById('kNext')?.click(); // swipe left → next
      else         document.getElementById('kPrev')?.click(); // swipe right → prev
    }
  }, { passive: true });
}

/* ── Wake Lock ────────────────────────────────────────── */
async function bindWakeLock() {
  const btn = document.getElementById('wakeLockBtn');
  if (!('wakeLock' in navigator)) {
    btn.style.display = 'none';
    return;
  }

  async function acquire() {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      btn.classList.add('active');
      btn.textContent = '☀ Screen on';
      wakeLock.addEventListener('release', () => {
        btn.classList.remove('active');
      });
    } catch { btn.classList.remove('active'); }
  }

  // Auto-acquire on load
  await acquire();

  btn.addEventListener('click', async () => {
    if (wakeLock && !wakeLock.released) {
      wakeLock.release();
      wakeLock = null;
      btn.classList.remove('active');
    } else {
      await acquire();
    }
  });

  // Re-acquire when tab becomes visible again
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && btn.classList.contains('active')) {
      await acquire();
    }
  });
}

/* ── Error ─────────────────────────────────────────────── */
function showError(msg) {
  document.getElementById('kMain').innerHTML = `
    <div class="k-center">
      <div style="font-size:40px">😕</div>
      <p>${escHtml(msg)}</p>
      <a href="index.html" style="color:var(--accent)">Back to recipes</a>
    </div>`;
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
