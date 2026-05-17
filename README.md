# Mise en Place

A personal recipe app hosted on GitHub Pages. Save, tag, rate, and search recipes. Built for two people, powered by a Cloudflare Worker for secure saves.

---

## One-time setup

### 1. Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under *Build and deployment*, set source to **GitHub Actions**
3. Push any change to `main` — the Actions workflow will deploy automatically
4. Your app will be live at `https://YOUR_USERNAME.github.io/recipeApp/`

### 2. Create a GitHub fine-grained PAT

1. Go to **GitHub** → your avatar → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**
2. Click **Generate new token**
3. Set expiration (1 year is fine for personal use)
4. Under *Repository access*, select **Only select repositories** → choose `recipeApp`
5. Under *Permissions* → **Repository permissions** → set **Contents** to **Read and write**
6. Copy the token — you'll need it in step 4

### 3. Deploy the Cloudflare Worker

1. Sign up free at [cloudflare.com](https://cloudflare.com) (no credit card needed)
2. Go to **Workers & Pages** → **Create** → **Create Worker**
3. Paste the contents of `worker/index.js` into the editor
4. Click **Deploy**
5. Copy your worker URL — it looks like `https://your-worker.YOUR_SUBDOMAIN.workers.dev`

### 4. Add environment variables to your Worker

In the Cloudflare dashboard, go to your Worker → **Settings** → **Variables** → **Environment Variables**:

| Variable name      | Value                                          |
|--------------------|------------------------------------------------|
| `APP_PASSWORD`     | A password you make up — share it with your wife |
| `ANTHROPIC_API_KEY`| Your Claude API key from console.anthropic.com |
| `GITHUB_TOKEN`     | The fine-grained PAT from step 2              |
| `GITHUB_OWNER`     | Your GitHub username (e.g. `parkerlake`)       |
| `GITHUB_REPO`      | `recipeApp`                                    |
| `GITHUB_BRANCH`    | `main`                                         |

Click **Save and deploy** after adding them.

### 5. Configure the app in your browser

1. Open your live GitHub Pages site
2. Click the **⚙ Settings** icon in the top right
3. Enter your **Worker URL** and **App Password**
4. Click **Save settings**

Your wife does the same on her device. Settings are stored locally in the browser — they never go to GitHub.

---

## Usage

### Adding a recipe

**From a URL** — click **Add recipe**, paste any recipe URL (or follow a Pinterest pin to the actual recipe page first), click **Extract**. The form pre-fills automatically. Review, add tags and a rating, save.

**Manually** — click **Add recipe**, skip the URL section, fill in the form directly.

### Browsing

- Use the **sidebar** to filter by protein, region, complexity, or meal type
- Use the **search bar** to search titles, ingredients, notes, and instructions full-text
- Use the **sort dropdown** to sort by newest, top rated, alphabetical, or quickest

### Editing & rating

- Open any recipe, click **Edit** in the top right
- Ratings can be added or changed at any time
- Tags can be added, removed, or swapped at any time

### Skylight calendar

Each recipe's detail page has a stable URL like:
```
https://YOUR_USERNAME.github.io/recipeApp/recipe.html?id=rec_abc123
```
Paste this URL into a Skylight calendar event — Skylight will scrape the title, ingredients, and instructions automatically.

---

## How it works

```
Browser ──read──▶ data/recipes.json (GitHub Pages CDN)
Browser ──write─▶ Cloudflare Worker ──▶ GitHub API ──▶ data/recipes.json
Browser ──extract▶ Cloudflare Worker ──▶ Recipe page + Claude API
```

- All recipe data lives in `data/recipes.json` in this repo
- The Worker holds your API keys — they never touch the browser
- Every save is a GitHub commit, so you get version history for free

## File structure

```
recipeApp/
├── index.html              # Recipe browser
├── recipe.html             # Recipe detail page (Skylight URL)
├── assets/
│   ├── style.css
│   ├── app.js              # Browser logic
│   └── recipe.js           # Detail page logic
├── data/
│   └── recipes.json        # All recipe data
├── worker/
│   └── index.js            # Cloudflare Worker (deploy separately)
└── .github/workflows/
    └── deploy.yml          # Auto-deploy to GitHub Pages
```
