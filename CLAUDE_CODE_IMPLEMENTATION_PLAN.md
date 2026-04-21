# Meal Prep — Implementation Reference

Use this document as the single source of truth for the current state of the app.

## Goal
A static React + Vite web app for one user, deployed on GitHub Pages. Helps the user choose three manageable meals each week from a curated recipe database, generates a grocery list, and supports low-energy cooking — without judgment or pressure.

## Core product decisions (current)
- Single-user. No auth. No backend. Everything persisted in localStorage (`steady-meals-v1`).
- Recipe database lives in `src/data/recipes.fr.student.json` — never hard-coded in JS.
- Weekly picker shows **4 cards**: 3 familiar + 1 gentle stretch. No backup meal slot.
- User can select up to 3 recipes per week.
- After completing a meal, a short Feedback prompt appears: **Like / Okay / No**.
- Feedback ratings influence future recipe ranking.
- Tab order: Pantry & Preferences → Choose Weekly Recipes → Grocery List → Cook.
- Default tab on load: Pantry & Preferences.
- App version displayed in footer (`v1.0.0`), sourced from `package.json`.

## Tech stack
- React 18 with hooks (`useState`, `useEffect`, `useMemo`)
- Vite (content-hash asset filenames for cache-busting)
- Plain CSS only — no UI framework
- GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`)
- Cache-control meta tags in `index.html` to discourage stale HTML caching

## Repository structure
```
src/
  App.jsx                        — single component, all UI logic
  main.jsx                       — React root mount
  styles.css                     — all styles; responsive breakpoints at 980px, 720px, 540px
  selectors.js                   — pure scoring/filtering functions
  data/
    recipes.fr.student.json      — 50 recipes
    staples.json                 — 25 default staple suggestions
.github/
  workflows/
    deploy.yml                   — GitHub Pages deployment
index.html                       — cache-control meta + title "Meal Prep"
package.json                     — version 1.0.0
vite.config.js
README.md
```

## Data model

### recipes.fr.student.json
Top-level shape:
```json
{
  "version": 1,
  "locale": "en-FR",
  "countryContext": "France",
  "userProfile": "single student, low budget, small kitchen",
  "supportedEquipment": ["small pot", "small pan", "rice cooker", "kettle", "can opener", "whisk", "basic utensils"],
  "recipes": [...]
}
```

Recipe object shape:
```json
{
  "id": "r1",
  "title": "Tomato Egg Rice Bowl",
  "prepMin": 15,
  "effort": 1,
  "novelty": 1,
  "servings": 2,
  "tags": ["rice", "eggs", "soft", "familiar"],
  "textures": ["soft"],
  "equipment": ["rice-cooker", "pan"],
  "ingredients": [
    { "name": "rice", "aisle": "Grains", "amount": "75 g" }
  ],
  "steps": [
    { "text": "Cook the rice in the rice cooker.", "timerMin": 12 }
  ],
  "substitutions": ["Use couscous instead of rice."],
  "rescue": false
}
```

Key field notes:
- `effort`: 1–5 scale (1 = very easy)
- `novelty`: 1–5 scale (1 = very familiar)
- `servings`: integer, minimum 2
- `rescue`: marks ultra-easy fallback recipes (at least 3 in database)
- No `leftovers` field — replaced by `servings`
- No `note` field used in UI
- No oven-only recipes

### staples.json
Simple JSON array of 25 strings (ingredient names). Editable in-app. Imported as `STAPLE_SUGGESTIONS`.

## State shape (localStorage key: `steady-meals-v1`)
```js
{
  pantryItems: string[],         // items user has right now
  staples: string[],             // always-available items (initialized from defaultState)
  prefs: {
    safeFoods: string,           // comma-separated
    dislikedTextures: string,    // comma-separated
    excludedIngredients: string, // comma-separated
    includeIngredients: string,  // comma-separated
    maxPrepTime: number,         // minutes
    adventureLevel: number,      // 0–100, default 50
  },
  planByWeek: {
    [weekKey]: {
      selectedRecipeIds: string[],
      activeCookId: string,
      currentStepIndex: number,
      shuffleIndex: number,      // increments on each Randomize press
    }
  },
  checkins: [
    { recipeId, rating, date, weekKey }  // rating: 'like' | 'okay' | 'no'
  ]
}
```

**Deep merge on load**: `prefs` is deep-merged against `defaultState.prefs` so new fields always get their defaults when the user upgrades. Arrays (`pantryItems`, `staples`, `checkins`) are replaced wholesale from stored values.

## Selection algorithm (`src/selectors.js`)

### Week key
Monday-anchored ISO date string: `weekKeyForDate()`.

### Filtering
Exclude recipes where:
- `prepMin > maxPrepTime`
- any excluded ingredient matches a recipe ingredient
- any disliked texture matches a recipe texture

### Scoring inputs
- `pantryBoost`: +1 per ingredient already in pantry/staples
- `safeFoodBoost`: +1.8 per safe food found in title/tags/ingredients
- `includeBoost`: +1.2 per preferred food found
- `historyBoost`: recipeSpecific + tagScore from past checkins (`like`=+2, `okay`=+1, `no`=−2; tag score weighted ×0.6)
- `jitter`: deterministic hash from `weekKey + shuffleIndex + recipeId`; range 0–0.099 when shuffleIndex=0, range 0–3.99 when shuffleIndex>0 (ensures Randomize produces visibly different results)

### Adventure level weighting (0–100 slider)
```js
const t = adventureLevel / 100;
const pantryWeight = 3.0 - t * 2.7;   // 3.0 at pantry-first → 0.3 at adventurous
const noveltyWeight = -4.0 + t * 6.0; // -4 (penalty) at pantry-first → +2 (bonus) at adventurous
```

### Output
4 picks: 3 familiar (highest-scoring by familiar formula) + 1 stretch (novelty 2–4, effort ≤ 3, not already in familiar set).

### Grocery list
`getGroceryList()` deduplicates by normalized ingredient name, groups by aisle, hides pantry/staple items, collects amounts and recipe names per ingredient.

## UI components (all in App.jsx)

### CommaAutocomplete
Autocomplete input for comma-separated fields. Filters `ALL_INGREDIENTS` or `ALL_TEXTURES` (derived from recipe database at module load). Picks the last token, excludes already-entered values, shows up to 8 matches. Uses 150ms blur delay so `onMouseDown` fires before the list closes.

### Tab navigation
Each tab section has a `.tab-nav` row at the bottom with forward/back buttons:
- Pantry → Choose Weekly Recipes
- Choose Weekly Recipes → Grocery List
- Grocery List ← → Cook

### Recipe card states
- Default: dark "Choose" primary button
- Selected (up to 3): green "✓ Chosen" success button, card gets `selected` outline
- Full (3 chosen, not this card): faded "Full" ghost disabled button

### Feedback (post-meal check-in)
Triggered by clicking "Done" on the last cook step. Sidebar shows: Like / Okay / No buttons. Saved as checkin entry and used in future ranking.

### Last feedback badge
Each recipe card shows a color-coded badge if a checkin exists:
- `checkin-like` → green
- `checkin-okay` → orange
- `checkin-no` → red

### Cook tab step navigation
- "Previous" disabled on step 1
- "Next" advances through steps
- On last step: "Next" replaced by "Done" (triggers feedback prompt)

## Responsive design
- **980px**: panel-grid collapses to single column
- **720px**: form-grid and facts collapse to 1 column; panel-heading, card-actions, inline-form, recipe-topline stack vertically
- **540px**: tabs shrink; adventure slider wraps to full-width row; tab-nav buttons stack full-width; narrow field max-width removed
- `overflow-x: hidden` on body

## Acceptance criteria (all met)
- `npm install && npm run build` succeeds
- Recipe data from JSON, not JS constants
- No oven-only recipe in database
- 50 recipes suitable for France/student/small-kitchen constraints
- At least 3 rescue recipes
- Grocery list hides pantry and staple items, shows amounts
- Feedback ratings alter future ranking
- GitHub Pages deployment via GitHub Actions
- Mobile-friendly at 375px+
- Version number visible in footer

## Known constraints / design decisions
- No sum of ingredient quantities when units differ (amounts shown as "75 g + 100 g")
- Staples edited in-app; default list from `staples.json` only applies on first load
- No oven equipment in any recipe (hard constraint for student kitchen)
- All recipe ingredient names normalized for deduplication (lowercase, trimmed, punctuation stripped)

## Nice-to-have improvements (not yet built)
- Sum quantities when units match
- Import/export user data as JSON
- Pin a favorite recipe to make it reappear more often
- "Repeat last week" action
- Bilingual labels (French/English)
