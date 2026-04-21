const normalize = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');

export const weekKeyForDate = (date = new Date()) => {
  const local = new Date(date);
  const day = (local.getDay() + 6) % 7;
  local.setHours(0, 0, 0, 0);
  local.setDate(local.getDate() - day);
  return local.toISOString().slice(0, 10);
};

export const parseCommaList = (value) =>
  value
    .split(',')
    .map((item) => normalize(item))
    .filter(Boolean);

export const ingredientNameSet = (pantryItems = [], staples = []) =>
  new Set([...pantryItems, ...staples].map(normalize).filter(Boolean));

export const matchesPreferenceExclusions = (recipe, prefs) => {
  const excludedIngredients = parseCommaList(prefs.excludedIngredients || '');
  const dislikedTextures = parseCommaList(prefs.dislikedTextures || '');
  const maxPrepTime = Number(prefs.maxPrepTime || 0);

  if (maxPrepTime && recipe.prepMin > maxPrepTime) return true;

  const recipeIngredientNames = recipe.ingredients.map((item) => normalize(item.name));
  if (excludedIngredients.some((blocked) => recipeIngredientNames.some((name) => name.includes(blocked)))) return true;

  const recipeTextures = recipe.textures.map(normalize);
  if (dislikedTextures.some((texture) => recipeTextures.includes(texture))) return true;

  return false;
};

const ratingValue = {
  like: 2,
  okay: 1,
  no: -2,
};

export const buildHistoryProfile = (checkins = []) => {
  const byRecipe = new Map();

  checkins.forEach((entry) => {
    const value = ratingValue[entry.rating] ?? 0;
    byRecipe.set(entry.recipeId, (byRecipe.get(entry.recipeId) || 0) + value);
  });

  return { byRecipe };
};

const hash = (input) => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
};

const safeFoodBoost = (recipe, safeFoods) => {
  const haystack = [recipe.title, ...recipe.ingredients.map((item) => item.name)]
    .map(normalize)
    .join(' ');
  return safeFoods.reduce((sum, food) => (haystack.includes(food) ? sum + 1.8 : sum), 0);
};

const includeBoost = (recipe, includeFoods) => {
  const haystack = [recipe.title, ...recipe.ingredients.map((item) => item.name)]
    .map(normalize)
    .join(' ');
  return includeFoods.reduce((sum, food) => (haystack.includes(food) ? sum + 1.2 : sum), 0);
};

const pantryBoost = (recipe, pantrySet) =>
  recipe.ingredients.reduce((sum, ingredient) => sum + (pantrySet.has(normalize(ingredient.name)) ? 1 : 0), 0);

const historyBoost = (recipe, history) => history.byRecipe.get(recipe.id) || 0;

const roleScore = (recipe, role, context) => {
  const { pantrySet, safeFoods, includeFoods, history, weekKey, shuffleIndex, pantryWeight, noveltyWeight } = context;
  const pantry = pantryBoost(recipe, pantrySet);
  const safe = safeFoodBoost(recipe, safeFoods);
  const include = includeBoost(recipe, includeFoods);
  const historyScore = historyBoost(recipe, history);
  const jitter = shuffleIndex === 0
    ? (hash(`${weekKey}:${recipe.id}`) % 100) / 1000
    : (hash(`${weekKey}:${shuffleIndex}:${recipe.id}`) % 400) / 100;

  if (role === 'familiar') {
    return (
      20 - recipe.effort * 2.5 + recipe.novelty * noveltyWeight + pantry * pantryWeight + safe * 1.6 + include + historyScore +
      (recipe.servings >= 3 ? 0.8 : 0) +
      jitter
    );
  }

  const noveltyTarget = 4 - Math.abs(3 - recipe.novelty) * 1.6;
  return 10 + noveltyTarget - recipe.effort * 1.4 + pantry * pantryWeight + safe * 1.2 + include + historyScore * 0.7 + jitter;
};

export const getWeeklyRecommendations = ({ recipes, prefs, pantryItems, staples, checkins, weekKey, shuffleIndex = 0, adventureLevel = 50 }) => {
  const pantrySet = ingredientNameSet(pantryItems, staples);
  const safeFoods = parseCommaList(prefs.safeFoods || '');
  const includeFoods = parseCommaList(prefs.includeIngredients || '');
  const history = buildHistoryProfile(checkins);

  const filtered = recipes.filter((recipe) => !matchesPreferenceExclusions(recipe, prefs));
  const t = adventureLevel / 100;
  const pantryWeight = 3.0 - t * 2.7;       // 3.0 at pantry-first → 0.3 at adventurous
  const noveltyWeight = -4.0 + t * 6.0;     // -4 (penalty) at pantry-first → +2 (bonus) at adventurous
  const context = { pantrySet, safeFoods, includeFoods, history, weekKey, shuffleIndex, pantryWeight, noveltyWeight };

  const familiar = [...filtered]
    .sort((a, b) => roleScore(b, 'familiar', context) - roleScore(a, 'familiar', context))
    .slice(0, 3);

  const used = new Set(familiar.map((item) => item.id));

  const stretchPool = filtered.filter((recipe) => !used.has(recipe.id) && recipe.novelty >= 2 && recipe.novelty <= 4 && recipe.effort <= 3);
  const stretch = stretchPool
    .sort((a, b) => roleScore(b, 'stretch', context) - roleScore(a, 'stretch', context))[0] ||
    filtered.find((recipe) => !used.has(recipe.id));

  const picks = [
    ...familiar.map((recipe) => ({ recipe, slot: 'familiar' })),
    ...(stretch ? [{ recipe: stretch, slot: 'stretch' }] : []),
  ];

  return picks;
};

export const getGroceryList = ({ selectedRecipes, pantryItems, staples }) => {
  const pantrySet = ingredientNameSet(pantryItems, staples);
  const grouped = new Map();

  selectedRecipes.forEach((recipe) => {
    recipe.ingredients.forEach((ingredient) => {
      const key = normalize(ingredient.name);
      if (pantrySet.has(key)) return;
      if (!grouped.has(ingredient.aisle)) grouped.set(ingredient.aisle, new Map());
      const aisleMap = grouped.get(ingredient.aisle);
      const existing = aisleMap.get(key) || {
        name: ingredient.name,
        aisle: ingredient.aisle,
        amounts: [],
        recipes: [],
      };
      if (ingredient.amount) existing.amounts.push(ingredient.amount);
      if (!existing.recipes.includes(recipe.title)) existing.recipes.push(recipe.title);
      aisleMap.set(key, existing);
    });
  });

  return [...grouped.entries()].map(([aisle, itemsMap]) => ({
    aisle,
    items: [...itemsMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }));
};

export const reassuranceLabel = (effort) => {
  if (effort <= 1) return 'very manageable';
  if (effort <= 2) return 'manageable';
  if (effort <= 3) return 'gentle stretch';
  return 'save for a stronger day';
};
