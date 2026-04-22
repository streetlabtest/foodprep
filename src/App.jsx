import { useEffect, useMemo, useState } from 'react';
import recipeDb from './data/recipes.fr.student.json';
import STAPLE_SUGGESTIONS from './data/staples.json';
import { version } from '../package.json';
import { getGroceryList, getWeeklyRecommendations, reassuranceLabel, weekKeyForDate } from './selectors';

const { recipes } = recipeDb;

const ALL_INGREDIENTS = [...new Set(recipes.flatMap((r) => r.ingredients.map((i) => i.name)))].sort();
const ALL_TEXTURES = [...new Set(recipes.flatMap((r) => r.textures))].sort();

function CommaAutocomplete({ value, onChange, suggestions, placeholder }) {
  const [open, setOpen] = useState(false);
  const lastToken = value.split(',').pop().trim().toLowerCase();
  const already = value.split(',').map((t) => t.trim().toLowerCase());
  const matches = lastToken.length === 0 ? [] : suggestions.filter(
    (s) => s.toLowerCase().includes(lastToken) && !already.includes(s.toLowerCase())
  ).slice(0, 8);

  const pick = (s) => {
    const parts = value.split(',');
    parts[parts.length - 1] = parts.length > 1 ? ` ${s}` : s;
    onChange(parts.join(','));
    setOpen(false);
  };

  return (
    <div className="autocomplete-wrap">
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <ul className="autocomplete-list">
          {matches.map((s) => (
            <li key={s} onMouseDown={() => pick(s)}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STORAGE_KEY = 'steady-meals-v1';

const defaultState = {
  pantryItems: ['bread', 'milk'],
  staples: ['rice', 'olive oil', 'salt', 'pepper', 'tea', 'canned tomatoes', 'eggs'],
  prefs: {
    safeFoods: 'rice, pasta, eggs',
    dislikedTextures: '',
    excludedIngredients: '',
    includeIngredients: '',
    maxPrepTime: 30,
    adventureLevel: 50,
  },
  planByWeek: {},
  checkins: [],
};

const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    return {
      ...defaultState,
      ...parsed,
      prefs: { ...defaultState.prefs, ...(parsed.prefs ?? {}) },
    };
  } catch {
    return defaultState;
  }
};

const effortLabel = { 1: 'Easy', 2: 'Moderate' };
const noveltyLabel = { 1: 'Novelty 1', 2: 'Novelty 2', 3: 'Novelty 3' };

function App() {
  const [state, setState] = useState(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [pantryDraft, setPantryDraft] = useState('');
  const [stapleDraft, setStapleDraft] = useState('');
  const [activeTab, setActiveTab] = useState('pantry');
  const [timer, setTimer] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [mealJustCompleted, setMealJustCompleted] = useState(null);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  useEffect(() => {
    if (!timer) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timer]);

  const weekKey = weekKeyForDate();
  const currentPlan = state.planByWeek[weekKey] || {
    selectedRecipeIds: [],
    activeCookId: '',
    currentStepIndex: 0,
    shuffleIndex: 0,
  };

  const recommendations = useMemo(
    () =>
      getWeeklyRecommendations({
        recipes,
        prefs: state.prefs,
        pantryItems: state.pantryItems,
        staples: state.staples,
        checkins: state.checkins,
        weekKey,
        shuffleIndex: currentPlan.shuffleIndex ?? 0,
        adventureLevel: state.prefs.adventureLevel ?? 50,
      }),
    [state.pantryItems, state.staples, state.prefs, state.checkins, weekKey, currentPlan.shuffleIndex]
  );

  useEffect(() => {
    if (!hydrated) return;
    if (!state.planByWeek[weekKey]) {
      setState((prev) => ({
        ...prev,
        planByWeek: {
          ...prev.planByWeek,
          [weekKey]: currentPlan,
        },
      }));
    }
  }, [hydrated, weekKey]);

  const updatePlan = (updates) => {
    setState((prev) => ({
      ...prev,
      planByWeek: {
        ...prev.planByWeek,
        [weekKey]: {
          ...(prev.planByWeek[weekKey] || currentPlan),
          ...updates,
        },
      },
    }));
  };

  const selectedRecipes = currentPlan.selectedRecipeIds
    .map((id) => recipes.find((recipe) => recipe.id === id))
    .filter(Boolean);

  const groceryList = useMemo(
    () =>
      getGroceryList({
        selectedRecipes,
        pantryItems: state.pantryItems,
        staples: state.staples,
      }),
    [selectedRecipes, state.pantryItems, state.staples]
  );

  const activeRecipe = recipes.find((recipe) => recipe.id === currentPlan.activeCookId) || selectedRecipes[0];
  const currentStep = activeRecipe?.steps[currentPlan.currentStepIndex] || null;
  const isLastStep = activeRecipe
    ? currentPlan.currentStepIndex === activeRecipe.steps.length - 1
    : false;

  const remainingSeconds = timer ? Math.max(0, Math.floor((timer.endsAt - now) / 1000)) : 0;

  const addPantryItem = () => {
    const next = pantryDraft.trim().toLowerCase();
    if (!next) return;
    if (state.pantryItems.includes(next)) {
      setPantryDraft('');
      return;
    }
    setState((prev) => ({ ...prev, pantryItems: [...prev.pantryItems, next] }));
    setPantryDraft('');
  };

  const removePantryItem = (name) => {
    setState((prev) => ({
      ...prev,
      pantryItems: prev.pantryItems.filter((item) => item !== name),
    }));
  };

  const addStaple = () => {
    const next = stapleDraft.trim().toLowerCase();
    if (!next || state.staples.includes(next)) { setStapleDraft(''); return; }
    setState((prev) => ({ ...prev, staples: [...prev.staples, next] }));
    setStapleDraft('');
  };

  const removeStaple = (name) => {
    setState((prev) => ({ ...prev, staples: prev.staples.filter((item) => item !== name) }));
  };

  const updatePrefs = (field, value) => {
    setState((prev) => ({
      ...prev,
      prefs: {
        ...prev.prefs,
        [field]: value,
      },
    }));
  };

  const toggleRecipeSelection = (recipeId) => {
    const selected = currentPlan.selectedRecipeIds;
    if (selected.includes(recipeId)) {
      updatePlan({ selectedRecipeIds: selected.filter((id) => id !== recipeId) });
      return;
    }
    if (selected.length >= 3) return;
    updatePlan({ selectedRecipeIds: [...selected, recipeId] });
  };

  const openRecipeInCookMode = (recipeId) => {
    updatePlan({ activeCookId: recipeId, currentStepIndex: 0 });
    setActiveTab('cook');
    setMealJustCompleted(null);
    setTimer(null);
  };

  const startTimerForStep = (minutes) => {
    setNow(Date.now());
    setTimer({
      label: `Timer for ${minutes} min`,
      endsAt: Date.now() + minutes * 60 * 1000,
    });
  };

  const moveStep = (direction) => {
    if (!activeRecipe) return;
    const next = Math.max(0, Math.min(activeRecipe.steps.length - 1, currentPlan.currentStepIndex + direction));
    updatePlan({ currentStepIndex: next });
  };

  const logCheckIn = (rating) => {
    if (!mealJustCompleted) return;
    setState((prev) => ({
      ...prev,
      checkins: [
        ...prev.checkins,
        {
          recipeId: mealJustCompleted,
          rating,
          date: new Date().toISOString(),
          weekKey,
        },
      ],
    }));
    setMealJustCompleted(null);
  };

  const latestCheckinByRecipe = new Map();
  state.checkins.forEach((entry) => latestCheckinByRecipe.set(entry.recipeId, entry.rating));

  return (
    <div className="app-shell">
      <header className="hero">
        <h1>Meal Prep</h1>
      </header>

      <nav className="tab-row" aria-label="Main navigation">
        {[
          ['pantry', 'Pantry & preferences'],
          ['week', 'Choose Weekly Recipes'],
          ['grocery', 'Grocery list'],
          ['cook', 'Cook'],
        ].map(([key, label]) => (
          <button key={key} className={activeTab === key ? 'tab active' : 'tab'} onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'week' && (
        <section className="panel-grid">
          <div className="panel span-2">
            <div className="panel-heading">
              <h2>Week of {weekKey}</h2>
              <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                <div className="status-pill">{currentPlan.selectedRecipeIds.length}/3 chosen</div>
                <button className="secondary" onClick={() => updatePlan({ shuffleIndex: (currentPlan.shuffleIndex ?? 0) + 1, selectedRecipeIds: [] })}>Randomize</button>
              </div>
            </div>
            <div className="adventure-bar">
              <span>Pantry-first</span>
              <input
                type="range"
                min="0"
                max="100"
                value={state.prefs.adventureLevel ?? 50}
                onChange={(e) => updatePrefs('adventureLevel', Number(e.target.value))}
              />
              <span>Adventurous</span>
            </div>
            <div className="recipe-grid">
              {recommendations.map(({ recipe, slot }) => {
                const selected = currentPlan.selectedRecipeIds.includes(recipe.id);
                const lastRating = latestCheckinByRecipe.get(recipe.id);
                return (
                  <article key={recipe.id} className={selected ? 'recipe-card selected' : 'recipe-card'}>
                    <div className="recipe-topline">
                      <span className={`attr-badge novelty-${recipe.novelty}`}>{noveltyLabel[recipe.novelty]}</span>
                      <span className={`attr-badge effort-${recipe.effort}`}>{effortLabel[recipe.effort]}</span>
                    </div>
                    <h3>{recipe.title}</h3>
                    <dl className="facts">
                      <div>
                        <dt>Time</dt>
                        <dd>{recipe.prepMin} min</dd>
                      </div>
                      <div>
                        <dt>Ingredients</dt>
                        <dd>{recipe.ingredients.length}</dd>
                      </div>
                      <div>
                        <dt>Servings</dt>
                        <dd>{recipe.servings}</dd>
                      </div>
                    </dl>
                    {recipe.note && <p className="recipe-note">{recipe.note}</p>}

                    <div className="card-actions">
                      <button className="secondary" onClick={() => openRecipeInCookMode(recipe.id)}>Preview</button>
                      <button
                        className={selected ? 'success' : currentPlan.selectedRecipeIds.length >= 3 ? 'ghost disabled' : 'primary'}
                        onClick={() => toggleRecipeSelection(recipe.id)}
                      >
                        {selected ? '✓ Chosen' : currentPlan.selectedRecipeIds.length >= 3 ? 'Full' : 'Choose'}
                      </button>
                    </div>
                    {lastRating && (
                      <p className={`checkin-badge checkin-${lastRating}`}>Last feedback: {lastRating}</p>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
          <div className="tab-nav span-2">
            <button className="primary" onClick={() => setActiveTab('grocery')}>Grocery list →</button>
          </div>
        </section>
      )}

      {activeTab === 'pantry' && (
        <section className="panel-grid">
          <div className="panel">
            <h2>Current Pantry</h2>
            <div className="inline-form">
              <input
                value={pantryDraft}
                onChange={(event) => setPantryDraft(event.target.value)}
                placeholder="e.g. yogurt, potatoes, bread"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addPantryItem();
                  }
                }}
              />
              <button className="primary" onClick={addPantryItem}>Add</button>
            </div>
            <div className="chip-wrap">
              {state.pantryItems.map((item) => (
                <button key={item} className="chip removable" onClick={() => removePantryItem(item)}>
                  {item} <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>Staples</h2>
            <div className="inline-form">
              <input
                value={stapleDraft}
                onChange={(event) => setStapleDraft(event.target.value)}
                placeholder="e.g. olive oil, rice, garlic"
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addStaple(); } }}
              />
              <button className="primary" onClick={addStaple}>Add</button>
            </div>
            <div className="chip-wrap">
              {state.staples.map((item) => (
                <button key={item} className="chip removable" onClick={() => removeStaple(item)}>
                  {item} <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
            <div className="chip-wrap suggestions">
              {STAPLE_SUGGESTIONS.filter((s) => !state.staples.includes(s)).map((item) => (
                <button key={item} className="chip" onClick={() => setState((prev) => ({ ...prev, staples: [...prev.staples, item] }))}>
                  + {item}
                </button>
              ))}
            </div>
          </div>

          <div className="panel span-2">
            <h2>Preferences</h2>
            <div className="form-grid">
              <label className="field">
                <span>Safe foods</span>
                <CommaAutocomplete value={state.prefs.safeFoods} onChange={(v) => updatePrefs('safeFoods', v)} suggestions={ALL_INGREDIENTS} placeholder="rice, pasta, eggs" />
              </label>
              <label className="field">
                <span>Disliked textures</span>
                <CommaAutocomplete value={state.prefs.dislikedTextures} onChange={(v) => updatePrefs('dislikedTextures', v)} suggestions={ALL_TEXTURES} placeholder="slimy, chewy" />
              </label>
              <label className="field">
                <span>Exclude ingredients</span>
                <CommaAutocomplete value={state.prefs.excludedIngredients} onChange={(v) => updatePrefs('excludedIngredients', v)} suggestions={ALL_INGREDIENTS} placeholder="mushrooms, mayo" />
              </label>
              <label className="field">
                <span>Prefer ingredients</span>
                <CommaAutocomplete value={state.prefs.includeIngredients} onChange={(v) => updatePrefs('includeIngredients', v)} suggestions={ALL_INGREDIENTS} placeholder="potatoes, tofu, bananas" />
              </label>
              <label className="field narrow">
                <span>Maximum prep time</span>
                <input type="number" min="5" max="60" value={state.prefs.maxPrepTime} onChange={(event) => updatePrefs('maxPrepTime', Number(event.target.value))} />
              </label>
            </div>
          </div>
          <div className="tab-nav span-2">
            <button className="primary" onClick={() => setActiveTab('week')}>Choose weekly recipes →</button>
          </div>
        </section>
      )}

      {activeTab === 'grocery' && (
        <section className="panel-grid">
          <div className="panel span-2">
            <div className="panel-heading">
              <h2>Grocery list</h2>
              <button className="secondary" onClick={() => setActiveTab('week')}>Back</button>
            </div>
            {selectedRecipes.length === 0 ? (
              <p className="muted">No recipes chosen yet.</p>
            ) : groceryList.length === 0 ? (
              <p className="muted">Everything needed is already marked as in the pantry or as a staple.</p>
            ) : (
              <div className="grocery-grid">
                {groceryList.map((section) => (
                  <section key={section.aisle} className="grocery-section">
                    <h3>{section.aisle}</h3>
                    <ul>
                      {section.items.map((item) => (
                        <li key={`${section.aisle}-${item.name}`}>
                          <strong>{item.name}</strong>
                          {item.amounts.length > 0 && (
                            <span className="grocery-amount">{item.amounts.join(' + ')}</span>
                          )}
                          <span className="grocery-recipes">{item.recipes.join(', ')}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
          <aside className="panel">
            <h2>This week</h2>
            <div className="stack">
              {selectedRecipes.length === 0 ? (
                <p className="muted">None chosen.</p>
              ) : (
                selectedRecipes.map((recipe) => (
                  <div key={recipe.id} className="mini-card">
                    <strong>{recipe.title}</strong>
                    <span>{recipe.prepMin} min · {effortLabel[recipe.effort]}</span>
                  </div>
                ))
              )}
            </div>
          </aside>
          <div className="tab-nav span-2">
            <button className="secondary" onClick={() => setActiveTab('week')}>← Choose recipes</button>
            <button className="primary" onClick={() => setActiveTab('cook')}>Cook →</button>
          </div>
        </section>
      )}

      {activeTab === 'cook' && (
        <section className="panel-grid">
          <div className="panel span-2">
            <div className="chip-wrap space-bottom">
              {selectedRecipes.map((recipe) => (
                <button key={recipe.id} className={activeRecipe?.id === recipe.id ? 'chip selected' : 'chip'} onClick={() => openRecipeInCookMode(recipe.id)}>
                  {recipe.title}
                </button>
              ))}
            </div>

            {activeRecipe ? (
              <>
                <article className="cook-card">
                  <div className="recipe-topline">
                    <span className="status-pill">Step {currentPlan.currentStepIndex + 1} of {activeRecipe.steps.length}</span>
                  </div>
                  <h3>{activeRecipe.title}</h3>
                  {currentStep && (
                    <div className="current-step">
                      <p>{currentStep.text}</p>
                      {currentStep.timerMin ? (
                        <button className="secondary" onClick={() => startTimerForStep(currentStep.timerMin)}>
                          Start {currentStep.timerMin}-minute timer
                        </button>
                      ) : null}
                    </div>
                  )}
                  {timer && remainingSeconds > 0 && (
                    <div className="timer-box">
                      <strong>{timer.label}</strong>
                      <span>{Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')}</span>
                    </div>
                  )}
                  {timer && remainingSeconds === 0 && <div className="timer-box done">Timer finished.</div>}
                  <div className="card-actions">
                    <button
                      className="secondary"
                      onClick={() => moveStep(-1)}
                      disabled={currentPlan.currentStepIndex === 0}
                    >
                      Previous
                    </button>
                    {isLastStep ? (
                      <button className="primary" onClick={() => setMealJustCompleted(activeRecipe.id)}>
                        Done
                      </button>
                    ) : (
                      <button className="primary" onClick={() => moveStep(1)}>
                        Next
                      </button>
                    )}
                  </div>
                </article>

                <div className="panel inset-panel">
                  <h3>Substitutions</h3>
                  <ul className="sub-list">
                    {activeRecipe.substitutions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="muted">Choose a recipe to begin.</p>
            )}
          </div>

          <aside className="panel">
            <h2>Feedback</h2>
            {mealJustCompleted && (
              <>
                <p>How did it go?</p>
                <div className="stack gap-sm">
                  <button className="primary" onClick={() => logCheckIn('like')}>Like</button>
                  <button className="secondary" onClick={() => logCheckIn('okay')}>Okay</button>
                  <button className="ghost" onClick={() => logCheckIn('no')}>No</button>
                </div>
              </>
            )}
          </aside>
        </section>
      )}
      <footer className="app-version">v{version}</footer>
    </div>
  );
}

export default App;
