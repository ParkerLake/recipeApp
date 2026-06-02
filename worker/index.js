/**
 * Salty Lake Recipes — Cloudflare Worker
 *
 * Handles three things so they never touch the browser:
 *   1. Recipe extraction (fetches URL + calls Claude API)
 *   2. Recipe save / update / delete (writes to GitHub)
 *
 * Environment variables (set in Cloudflare dashboard):
 *   APP_PASSWORD      — shared password for the app
 *   ANTHROPIC_API_KEY — your Claude API key
 *   GITHUB_TOKEN      — fine-grained PAT with "contents: write" on this repo
 *   GITHUB_OWNER      — your GitHub username  (e.g. parkerlake)
 *   GITHUB_REPO       — repo name             (e.g. recipeApp)
 *   GITHUB_BRANCH     — branch to write to    (e.g. main)
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (request.method !== 'POST') {
      return jsonResp({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResp({ error: 'Invalid JSON' }, 400);
    }

    // Auth
    if (!body.password || body.password !== env.APP_PASSWORD) {
      return jsonResp({ error: 'Unauthorized' }, 401);
    }

    const { action } = body;

    if (action === 'extract') {
      return handleExtract(body, env);
    }

    if (action === 'upsert' || action === 'delete') {
      return handleSave(body, env);
    }

    return jsonResp({ error: 'Unknown action' }, 400);
  }
};

/* ── Extract recipe from URL via Claude ───────────────── */
async function handleExtract({ url }, env) {
  if (!url) return jsonResp({ error: 'url is required' }, 400);

  // Resolve Pinterest → follow redirect to get actual recipe page
  let targetUrl = url;
  try {
    if (url.includes('pinterest.com')) {
      const pinResp = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }
      });
      // Pinterest embeds the destination link in the HTML
      const html = await pinResp.text();
      const match = html.match(/"url"\s*:\s*"(https?:\/\/(?!www\.pinterest)[^"]+)"/);
      if (match) {
        targetUrl = match[1].replace(/\\u002F/g, '/');
      } else {
        return jsonResp({
          error: 'Could not resolve the Pinterest link to a recipe page. Try opening the pin and copying the direct recipe URL.'
        }, 422);
      }
    }

    // Fetch the actual recipe page
    const pageResp = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });

    if (!pageResp.ok) {
      return jsonResp({ error: `Could not fetch the recipe page (HTTP ${pageResp.status})` }, 422);
    }

    const html = await pageResp.text();

    // First try: schema.org JSON-LD (fast, no AI needed)
    const schemaResult = extractSchemaOrg(html, targetUrl);
    if (schemaResult) return jsonResp(schemaResult);

    // Fallback: Claude API extraction
    const claudeResult = await extractWithClaude(html, targetUrl, env);
    return jsonResp(claudeResult);

  } catch (e) {
    return jsonResp({ error: e.message || 'Extraction failed' }, 500);
  }
}

/* ── Schema.org JSON-LD extraction (no AI needed) ────── */
function extractSchemaOrg(html, sourceUrl) {
  const scriptMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of scriptMatches) {
    try {
      let data = JSON.parse(m[1]);
      // Handle @graph arrays
      if (data['@graph']) data = data['@graph'].find(n => n['@type'] === 'Recipe') || data;
      if (Array.isArray(data)) data = data.find(n => n['@type'] === 'Recipe') || data[0];
      if (data['@type'] !== 'Recipe') continue;

      const toMinutes = (iso) => {
        if (!iso) return null;
        const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
        if (!match) return null;
        return (parseInt(match[1]||0) * 60) + parseInt(match[2]||0);
      };

      const instructions = (() => {
        const raw = data.recipeInstructions;
        if (!raw) return [];

        // Strip HTML tags and collapse whitespace
        const stripHtml = s => String(s)
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
          .replace(/\s{2,}/g, ' ').trim();

        // Recursively extract steps — handles HowToStep, HowToSection, strings
        const extractStep = (s) => {
          if (typeof s === 'string') return [stripHtml(s)];
          // HowToSection wraps steps in itemListElement — flatten them
          if (s['@type'] === 'HowToSection' || Array.isArray(s.itemListElement)) {
            return (s.itemListElement || []).flatMap(extractStep);
          }
          // HowToStep: prefer text, fall back to description then name
          const text = s.text || s.description || s.name || '';
          return text ? [stripHtml(text)] : [];
        };

        if (typeof raw === 'string') return raw.split(/\n+/).map(s => s.trim()).filter(Boolean);
        if (Array.isArray(raw)) return raw.flatMap(extractStep).filter(Boolean);
        return [];
      })();

      const ingredients = (data.recipeIngredient || []).map(i => String(i).trim()).filter(Boolean);

      const imageUrl = (() => {
        const img = data.image;
        if (!img) return '';
        if (typeof img === 'string') return img;
        if (Array.isArray(img)) return typeof img[0] === 'string' ? img[0] : img[0]?.url || '';
        return img.url || '';
      })();

      const prepTime  = toMinutes(data.prepTime);
      const cookTime  = toMinutes(data.cookTime);
      const totalTime = toMinutes(data.totalTime) || (prepTime && cookTime ? prepTime + cookTime : null);

      if (!data.name || instructions.length === 0) continue;

      return {
        title:        data.name,
        description:  data.description || '',
        prepTime,
        cookTime,
        totalTime,
        servings:     parseInt(data.recipeYield) || null,
        ingredients,
        instructions,
        imageUrl,
        sourceUrl,
        suggestedTags: guessTagsFromData({ ingredients, title: data.name, description: data.description || '' })
      };
    } catch { continue; }
  }
  return null;
}

/* ── Claude API extraction (fallback) ────────────────── */
async function extractWithClaude(html, sourceUrl, env) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('No Claude API key configured');

  // Trim HTML — keep readable text, strip noise
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{3,}/g, '\n')
    .slice(0, 40000);

  const prompt = `Extract the recipe from this webpage text and return ONLY a JSON object with this exact structure (no markdown, no explanation):

{
  "title": "Recipe name",
  "description": "1-2 sentence description or intro",
  "prepTime": 10,
  "cookTime": 25,
  "totalTime": 35,
  "servings": 4,
  "ingredients": ["ingredient 1", "ingredient 2"],
  "instructions": ["Step 1 text", "Step 2 text"],
  "imageUrl": ""
}

Rules:
- All time values are integers in MINUTES (null if not mentioned)
- servings is an integer (null if not mentioned)
- ingredients: each item is a complete ingredient string with quantity and unit
- instructions: each item is one complete step as a full sentence or paragraph
- If there is no recipe on this page, return {"error": "No recipe found"}

Webpage text:
${text}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json'
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!resp.ok) throw new Error('Claude API error');
  const result = await resp.json();
  const text2 = result.content?.[0]?.text?.trim() || '';

  // Extract JSON even if wrapped in ```
  const jsonMatch = text2.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse Claude response');

  const data = JSON.parse(jsonMatch[0]);
  if (data.error) throw new Error(data.error);

  data.sourceUrl = sourceUrl;
  data.suggestedTags = guessTagsFromData(data);
  return data;
}

/* ── Guess tags from extracted content ────────────────── */
function guessTagsFromData({ ingredients = [], title = '', description = '' }) {
  const text = [title, description, ...ingredients].join(' ').toLowerCase();
  const tags = { protein: [], region: [], complexity: [], meal: [] };

  const proteins = {
    Chicken:     /\bchicken|poultry|hen\b/,
    Beef:        /\bbeef|steak|ground beef|brisket|ribeye\b/,
    Pork:        /\bpork|bacon|ham|prosciutto|pancetta|sausage\b/,
    Lamb:        /\blamb|mutton\b/,
    Seafood:     /\bsalmon|shrimp|fish|tuna|cod|scallop|crab|lobster|clam|mussel|anchov|tilapia|halibut|prawn\b/,
    Turkey:      /\bturkey\b/,
    Eggs:        /\begg|frittata|omelette|quiche\b/,
    Vegetarian:  /\bvegetarian|veggie\b/,
    Vegan:       /\bvegan\b/
  };
  const regions = {
    Italian:         /\bpasta|risotto|pizza|italian|parmesan|pecorino|mozzarella|gnocchi|tiramisu|bruschetta\b/,
    Mexican:         /\btaco|burrito|enchilada|mexican|salsa|guacamole|jalapeño|chipotle|tortilla|carnitas\b/,
    Indian:          /\bcurry|masala|tikka|biryani|naan|dal|paneer|garam masala|turmeric|cumin seed|cardamom\b/,
    Asian:           /\bsoy sauce|sesame|ginger|stir.?fry|fried rice|asian|ramen|noodle|miso|tofu\b/,
    Japanese:        /\bsushi|ramen|miso|dashi|sake|mirin|wasabi|teriyaki|japanese\b/,
    Thai:            /\bthai|pad thai|coconut milk|fish sauce|lemongrass|galangal\b/,
    Korean:          /\bkorean|kimchi|gochujang|bibimbap|bulgogi\b/,
    Mediterranean:   /\bmediterranean|feta|hummus|tzatziki|tahini|olive oil\b/,
    Greek:           /\bgreek|feta|tzatziki|spanakopita|moussaka\b/,
    French:          /\bfrench|beurre|gratin|coq au vin|ratatouille|croissant|baguette|crème brûlée\b/,
    American:        /\bbbq|barbecue|mac and cheese|burger|hot dog|cornbread\b/,
    African:         /\btagine|injera|jollof|berbere|harissa|moroccan|ethiopian\b/,
    'Middle Eastern': /\bhummus|falafel|shawarma|pita|za'atar|sumac|tahini|middle east|lebanese\b/
  };
  const meals = {
    Breakfast:  /\bbreakfast|pancake|waffle|oatmeal|granola|brunch|morning|egg.+bacon\b/,
    Lunch:      /\blunch|sandwich|salad|wrap|soup\b/,
    Dinner:     /\bdinner|supper|entrée|main course|roast\b/,
    Appetizer:  /\bappetizer|starter|dip|canapé|bruschetta\b/,
    Dessert:    /\bdessert|cake|cookie|brownie|pie|tart|ice cream|pudding|candy\b/,
    'Side dish': /\bside dish|side|accompaniment|slaw|salad\b/
  };

  for (const [k, rx] of Object.entries(proteins)) if (rx.test(text)) { tags.protein.push(k); break; }
  for (const [k, rx] of Object.entries(regions))  if (rx.test(text)) { tags.region.push(k);  break; }
  for (const [k, rx] of Object.entries(meals))    if (rx.test(text)) { tags.meal.push(k);    break; }

  return tags;
}

/* ── Save / update / delete recipe in GitHub ─────────── */
async function handleSave({ action, recipes, payload }, env) {
  if (!Array.isArray(recipes)) return jsonResp({ error: 'recipes array required' }, 400);

  try {
    const filePath = 'data/recipes.json';
    const apiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`;
    const headers = {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept':        'application/vnd.github.v3+json',
      'Content-Type':  'application/json',
      'User-Agent':    'MiseEnPlaceApp/1.0'
    };

    // Get current file SHA (required for updates)
    const getResp = await fetch(apiUrl, { headers });
    let sha;
    if (getResp.ok) {
      const fileData = await getResp.json();
      sha = fileData.sha;
    } else if (getResp.status !== 404) {
      throw new Error(`GitHub API error: ${getResp.status}`);
    }

    // The frontend already applied the change to `recipes` before sending,
    // so we just write whatever we received (it's the full up-to-date array).
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(recipes, null, 2))));
    const commitMsg = action === 'delete'
      ? `Delete recipe: ${payload?.id || 'unknown'}`
      : `${payload?.title ? `Save recipe: ${payload.title}` : 'Update recipes'}`;

    const putBody = { message: commitMsg, content, branch: env.GITHUB_BRANCH || 'main' };
    if (sha) putBody.sha = sha;

    const putResp = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(putBody)
    });

    if (!putResp.ok) {
      const err = await putResp.json().catch(() => ({}));
      throw new Error(err.message || `GitHub write failed: ${putResp.status}`);
    }

    return jsonResp({ ok: true });
  } catch (e) {
    return jsonResp({ error: e.message }, 500);
  }
}

/* ── Helpers ──────────────────────────────────────────── */
function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}
