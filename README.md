# Meal Prep

A static React app for weekly meal planning. Pick three recipes, get a grocery list, cook step by step.

## What it does

- **Pantry & Preferences** — track what you have, set staples, exclude ingredients or textures, set a max prep time, and mark safe/preferred foods.
- **Choose Weekly Recipes** — shows 4 recipe cards (3 familiar + 1 gentle stretch). An adventure slider shifts picks from pantry-first to more varied. Randomize generates a fresh set.
- **Grocery List** — deduplicates ingredients across chosen recipes, groups by aisle, and hides anything already in the pantry or staples.
- **Cook** — one step at a time, optional countdown timers, and substitution suggestions. After the final step, leave feedback (Like / Okay / No) to tune future picks.

## Tech stack

- React 18 + Vite
- Plain CSS, no UI framework
- localStorage only — no backend, no auth
- GitHub Pages via GitHub Actions

## Local development

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. Push the repo to GitHub.
2. Go to **Settings → Pages** and set source to **GitHub Actions**.
3. Push to `main` — the workflow builds and deploys automatically.

The workflow sets the Vite base path from the repo name, so project-page URLs work without any config change.

## Project structure

```
src/
  App.jsx                     — all UI and state logic
  selectors.js                — pure scoring and filtering functions
  styles.css                  — all styles
  data/
    recipes.fr.student.json   — 50 recipes
    staples.json              — 25 default staple suggestions
```

## Recipe database

`src/data/recipes.fr.student.json` contains 50 recipes designed for:
- a student budget in France
- a small kitchen with: small pot, small pan, rice cooker, kettle, can opener, whisk, basic utensils
- no oven required

Recipes are stove-based, rice-cooker-based, kettle-based, or no-cook. At least 3 are marked as rescue/ultra-easy options.

## Reference

See `CLAUDE_CODE_IMPLEMENTATION_PLAN.md` for the full technical spec (data model, scoring algorithm, state shape, acceptance criteria).
