/* ═══════════════════════════════════════════════════════
   ANIMOOD — SCRIPT.JS
   AI-Powered Anime Recommendation Engine
   Uses: Jikan API (MyAnimeList) + Google Gemini AI
═══════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────
// 1. CONFIGURATION
// ─────────────────────────────────────────────

const CONFIG = {
  jikanBase: 'https://api.jikan.moe/v4',
  geminiBase: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
  maxResults: 10,
  similarCount: 6,
  jikanDelay: 350, // ms between Jikan requests (rate limit)
};

// Mood definitions with associated genres, colors, and metadata
const MOODS = [
  { id: 'excited',     emoji: '⚡', label: 'Excited',     sub: 'full of energy',  color: '#ffca28', genres: [1, 2],    tags: ['action', 'adventure', 'hype'] },
  { id: 'sad',         emoji: '🌧', label: 'Sad',         sub: 'need comfort',    color: '#5ce6f0', genres: [8, 22],   tags: ['drama', 'emotional', 'healing'] },
  { id: 'bored',       emoji: '😴', label: 'Bored',       sub: 'need something',  color: '#c678f0', genres: [4, 2],    tags: ['comedy', 'adventure', 'fun'] },
  { id: 'anxious',     emoji: '😰', label: 'Anxious',     sub: 'need to unwind',  color: '#69ff47', genres: [36, 4],   tags: ['slice of life', 'calm', 'cozy'] },
  { id: 'romantic',    emoji: '💕', label: 'Romantic',    sub: 'feeling love',    color: '#ff6b9d', genres: [22, 8],   tags: ['romance', 'drama', 'emotional'] },
  { id: 'curious',     emoji: '🔭', label: 'Curious',     sub: 'want to explore', color: '#00e5ff', genres: [24, 7],   tags: ['sci-fi', 'mystery', 'mind-bending'] },
  { id: 'nostalgic',   emoji: '🌸', label: 'Nostalgic',   sub: 'reminiscing',     color: '#ffb347', genres: [36, 22],  tags: ['classic', 'coming-of-age', 'emotional'] },
  { id: 'epic',        emoji: '🔥', label: 'Epic',        sub: 'want grandeur',   color: '#ff4757', genres: [1, 10],   tags: ['action', 'fantasy', 'battles'] },
  { id: 'philosophical',emoji: '🌌',label: 'Thoughtful',  sub: 'deep thinking',   color: '#a29bfe', genres: [37, 24],  tags: ['supernatural', 'philosophical', 'dark'] },
  { id: 'scared',      emoji: '👻', label: 'Thrill',      sub: 'want horror',     color: '#636e72', genres: [14, 37],  tags: ['horror', 'thriller', 'supernatural'] },
];

// Available genre filters (Jikan genre IDs)
const GENRES = [
  { id: 1,  name: 'Action' },
  { id: 2,  name: 'Adventure' },
  { id: 4,  name: 'Comedy' },
  { id: 8,  name: 'Drama' },
  { id: 10, name: 'Fantasy' },
  { id: 14, name: 'Horror' },
  { id: 22, name: 'Romance' },
  { id: 24, name: 'Sci-Fi' },
  { id: 36, name: 'Slice of Life' },
  { id: 37, name: 'Supernatural' },
  { id: 7,  name: 'Mystery' },
  { id: 30, name: 'Sports' },
];

// ─────────────────────────────────────────────
// 2. STATE
// ─────────────────────────────────────────────

const state = {
  apiKey: localStorage.getItem('animood_gemini_key') || '',
  selectedMood: null,        // mood id string
  detectedMood: null,        // AI-detected mood object
  activeGenres: new Set(),   // selected genre filter IDs
  favorites: JSON.parse(localStorage.getItem('animood_favorites') || '[]'),
  history: JSON.parse(localStorage.getItem('animood_history') || '[]'),
  currentResults: [],        // last recommendation batch
  currentDetail: null,       // anime being viewed in detail panel
};

// Persist state to localStorage
const persist = {
  saveFavorites: () => localStorage.setItem('animood_favorites', JSON.stringify(state.favorites)),
  saveHistory:   () => localStorage.setItem('animood_history',   JSON.stringify(state.history)),
  saveKey:       (k) => localStorage.setItem('animood_gemini_key', k),
};

// ─────────────────────────────────────────────
// 3. DOM REFERENCES
// ─────────────────────────────────────────────

const $ = id => document.getElementById(id);
const dom = {
  loader:         $('loader'),
  moodGrid:       $('moodGrid'),
  moodText:       $('moodText'),
  charCount:      $('charCount'),
  analyzeBtn:     $('analyzeBtn'),
  detectedMood:   $('detectedMood'),
  detectedValue:  $('detectedValue'),
  clearDetected:  $('clearDetected'),
  filterSection:  $('filterSection'),
  genrePills:     $('genrePills'),
  recommendBtn:   $('recommendBtn'),
  ctaHint:        $('ctaHint'),
  resultsSection: $('resultsSection'),
  resultsTitle:   $('resultsTitle'),
  resultsSub:     $('resultsSub'),
  animeGrid:      $('animeGrid'),
  retryBtn:       $('retryBtn'),
  similarSection: $('similarSection'),
  similarGrid:    $('similarGrid'),
  favsGrid:       $('favsGrid'),
  favsEmpty:      $('favsEmpty'),
  favCount:       $('favCount'),
  historyList:    $('historyList'),
  historyEmpty:   $('historyEmpty'),
  chartBars:      $('chartBars'),
  detailOverlay:  $('detailOverlay'),
  detailPanel:    $('detailPanel'),
  detailContent:  $('detailContent'),
  detailClose:    $('detailClose'),
  settingsBtn:    $('settingsBtn'),
  settingsModal:  $('settingsModal'),
  apiKeyInput:    $('apiKeyInput'),
  saveApiKey:     $('saveApiKey'),
  keyStatus:      $('keyStatus'),
  closeSettings:  $('closeSettings'),
  toast:          $('toast'),
};

// ─────────────────────────────────────────────
// 4. UTILITY HELPERS
// ─────────────────────────────────────────────

/** Simple sleep for rate limiting */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Show a toast notification */
function showToast(msg, duration = 2800) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  setTimeout(() => dom.toast.classList.remove('show'), duration);
}

/** Format a relative time string */
function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Calculate a match score (0–100) based on mood-genre alignment */
function calcMatchScore(anime, mood) {
  if (!mood) return Math.floor(Math.random() * 20) + 75; // fallback
  const animeGenreIds = (anime.genres || []).map(g => g.mal_id);
  const moodData = MOODS.find(m => m.id === mood);
  if (!moodData) return 80;
  const overlap = moodData.genres.filter(g => animeGenreIds.includes(g)).length;
  const base = 60 + (overlap / moodData.genres.length) * 35;
  // bonus for high score
  const scoreBonus = anime.score ? Math.min((anime.score - 7) * 2, 5) : 0;
  return Math.min(Math.round(base + scoreBonus + Math.random() * 5), 99);
}

/** Check if an anime is favorited */
const isFav = (malId) => state.favorites.some(f => f.mal_id === malId);

/** Toggle favorite status */
function toggleFav(anime) {
  if (isFav(anime.mal_id)) {
    state.favorites = state.favorites.filter(f => f.mal_id !== anime.mal_id);
    showToast('💔 Removed from favorites');
  } else {
    state.favorites.push({
      mal_id: anime.mal_id,
      title: anime.title_english || anime.title,
      image: anime.images?.jpg?.image_url,
      score: anime.score,
      episodes: anime.episodes,
      genres: (anime.genres || []).map(g => g.name),
    });
    showToast('❤️ Added to favorites!');
  }
  persist.saveFavorites();
  updateFavCount();
  refreshAllFavButtons(anime.mal_id);
}

/** Update the favorites count badge */
function updateFavCount() {
  dom.favCount.textContent = state.favorites.length;
}

/** Refresh all favorite buttons for a given malId */
function refreshAllFavButtons(malId) {
  document.querySelectorAll(`[data-fav-id="${malId}"]`).forEach(btn => {
    btn.classList.toggle('faved', isFav(malId));
    btn.textContent = isFav(malId) ? '❤️' : '🤍';
  });
}

// ─────────────────────────────────────────────
// 5. JIKAN API (MyAnimeList)
// ─────────────────────────────────────────────

/**
 * Fetch anime from Jikan with genre filter and popularity sort.
 * We fetch multiple pages and merge to get enough results.
 */
async function fetchAnimeByGenres(genreIds, limit = CONFIG.maxResults) {
  const params = new URLSearchParams({
    order_by: 'score',
    sort: 'desc',
    limit: Math.min(limit + 5, 25), // fetch extra to filter
    min_score: 7,
    genres: genreIds.join(','),
    sfw: true,
  });

  const url = `${CONFIG.jikanBase}/anime?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jikan API error: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

/**
 * Fetch top anime with optional genre filters.
 * Combines mood genres + user-selected genre filters.
 */
async function fetchRecommendations(moodId, genreFilter = []) {
  const mood = MOODS.find(m => m.id === moodId);
  if (!mood) return [];

  // Merge mood genres with user-selected genre filters
  const genreIds = genreFilter.length > 0
    ? [...new Set([...mood.genres, ...genreFilter])]
    : mood.genres;

  const results = await fetchAnimeByGenres(genreIds, CONFIG.maxResults);

  // Add match scores and sort
  return results
    .map(a => ({ ...a, _matchScore: calcMatchScore(a, moodId) }))
    .sort((a, b) => b._matchScore - a._matchScore)
    .slice(0, CONFIG.maxResults);
}

/**
 * Fetch similar anime based on a selected anime's genres.
 * Used for the "You might also like" section.
 */
async function fetchSimilarAnime(anime, excludeIds = []) {
  const genreIds = (anime.genres || []).slice(0, 2).map(g => g.mal_id);
  if (!genreIds.length) return [];
  await sleep(CONFIG.jikanDelay);

  const results = await fetchAnimeByGenres(genreIds, CONFIG.similarCount + 5);
  return results
    .filter(a => !excludeIds.includes(a.mal_id))
    .slice(0, CONFIG.similarCount);
}

/**
 * Search anime by title (for AI-recommended titles).
 */
async function searchAnimeByTitle(title) {
  await sleep(CONFIG.jikanDelay);
  const params = new URLSearchParams({ q: title, limit: 1, sfw: true });
  const res = await fetch(`${CONFIG.jikanBase}/anime?${params}`);
  const json = await res.json();
  return json.data?.[0] || null;
}

// ─────────────────────────────────────────────
// 6. GEMINI AI INTEGRATION
// ─────────────────────────────────────────────

/**
 * Analyze mood from free text using Gemini AI.
 * Returns a refined mood category matching our MOODS array.
 */
async function analyzeMoodWithAI(text) {
  if (!state.apiKey) {
    showToast('⚙️ Add your Gemini API key in Settings');
    return null;
  }

  // Structured prompt for reliable JSON output
  const prompt = `You are an emotional intelligence AI specialized in anime recommendations.

Analyze the following text describing someone's current emotional state:
"${text}"

Return ONLY a valid JSON object (no markdown, no backticks) with this exact structure:
{
  "mood": "<one of: excited, sad, bored, anxious, romantic, curious, nostalgic, epic, philosophical, scared>",
  "confidence": <number 0-100>,
  "reason": "<one sentence explanation>",
  "emoji": "<single relevant emoji>",
  "intensity": "<low|medium|high>"
}

Map the emotion to the closest mood category. If unsure, pick the most fitting one.`;

  const res = await fetch(`${CONFIG.geminiBase}?key=${state.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,      // low temperature for consistent output
        maxOutputTokens: 300,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `Gemini error ${res.status}`);
  }

  const data = await res.json();

  // Extract and parse the JSON response
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = rawText.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Get AI-powered anime recommendations by title using Gemini.
 * Falls back to Jikan genre-based search if this fails.
 */
async function getAIAnimeRecommendations(moodId, moodText, count = 5) {
  if (!state.apiKey) return [];

  const mood = MOODS.find(m => m.id === moodId);
  const favTitles = state.favorites.slice(0, 3).map(f => f.title).join(', ') || 'none';

  const prompt = `You are an expert anime recommender.

User's mood: "${mood?.label}" — ${moodText || mood?.sub}
User's favorites: ${favTitles}

Recommend exactly ${count} anime titles perfectly matching this mood.
Return ONLY a valid JSON array (no markdown):
[
  { "title": "exact romaji title", "reason": "one sentence why it fits" },
  ...
]

Requirements: well-known anime, different genres, mix of classic and recent.`;

  const res = await fetch(`${CONFIG.geminiBase}?key=${state.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
    }),
  });

  if (!res.ok) return [];
  const data = await res.json();
  const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// 7. RENDER FUNCTIONS
// ─────────────────────────────────────────────

/** Render all mood selection tiles */
function renderMoodGrid() {
  dom.moodGrid.innerHTML = MOODS.map(m => `
    <div class="mood-tile" data-mood="${m.id}"
         style="--tile-color: ${m.color}"
         title="${m.label} — ${m.sub}">
      <span class="tile-emoji">${m.emoji}</span>
      <span class="tile-label">${m.label}</span>
      <span class="tile-sub">${m.sub}</span>
    </div>
  `).join('');

  // Attach click events
  dom.moodGrid.querySelectorAll('.mood-tile').forEach(tile => {
    tile.addEventListener('click', () => selectMood(tile.dataset.mood));
  });
}

/** Render genre filter pills */
function renderGenrePills() {
  dom.genrePills.innerHTML = GENRES.map(g => `
    <button class="genre-pill" data-genre-id="${g.id}">${g.name}</button>
  `).join('');

  dom.genrePills.querySelectorAll('.genre-pill').forEach(pill => {
    pill.addEventListener('click', () => toggleGenre(pill));
  });
}

/**
 * Render a single anime card.
 * @param {object} anime - Jikan anime object
 * @param {object} opts  - { rank, matchScore, showMatch, small }
 */
function renderAnimeCard(anime, opts = {}) {
  const { rank, matchScore, showMatch = true, small = false } = opts;
  const title = anime.title_english || anime.title;
  const score = anime.score ? anime.score.toFixed(1) : '—';
  const episodes = anime.episodes || '?';
  const genre = anime.genres?.[0]?.name || '';
  const img = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
  const faved = isFav(anime.mal_id);
  const ms = matchScore ?? anime._matchScore ?? 80;

  return `
    <div class="anime-card" data-mal-id="${anime.mal_id}">
      <div class="card-poster-wrap">
        ${img
          ? `<img class="card-poster" src="${img}" alt="${title}" loading="lazy">`
          : `<div class="card-poster-placeholder">🎌</div>`
        }
        ${rank ? `<div class="card-rank">#${rank}</div>` : ''}
        ${showMatch ? `<div class="card-match">✦ ${ms}%</div>` : ''}
        <button class="card-fav ${faved ? 'faved' : ''}"
                data-fav-id="${anime.mal_id}"
                title="${faved ? 'Remove from favorites' : 'Add to favorites'}">
          ${faved ? '❤️' : '🤍'}
        </button>
      </div>
      <div class="card-body">
        <div class="card-genre">${genre}</div>
        <div class="card-title">${title}</div>
        <div class="card-meta">
          <div class="card-score">⭐ ${score}</div>
          <div class="card-eps">${episodes} ep</div>
        </div>
      </div>
    </div>
  `;
}

/** Render skeleton loading cards */
function renderSkeletons(count = 8) {
  return Array(count).fill(0).map(() => `
    <div class="skel-card">
      <div class="skeleton" style="aspect-ratio:2/3;width:100%"></div>
      <div style="padding:.9rem;display:flex;flex-direction:column;gap:8px">
        <div class="skeleton" style="height:10px;width:40%"></div>
        <div class="skeleton" style="height:13px;width:85%"></div>
        <div class="skeleton" style="height:11px;width:60%"></div>
      </div>
    </div>
  `).join('');
}

/** Attach card event listeners (click → detail, fav button) */
function attachCardListeners(container, animeList) {
  container.querySelectorAll('.anime-card').forEach(card => {
    const malId = parseInt(card.dataset.malId);
    const anime = animeList.find(a => a.mal_id === malId);
    if (!anime) return;

    // Open detail panel on card click
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-fav')) return; // don't open detail when clicking fav
      openDetailPanel(anime);
    });

    // Favorite button
    const favBtn = card.querySelector('.card-fav');
    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFav(anime);
      });
    }
  });
}

/** Render the results grid with skeleton → real cards transition */
async function renderResults(animeList, moodLabel = '') {
  // Show skeleton first for better UX
  dom.animeGrid.innerHTML = renderSkeletons(animeList.length || 8);
  dom.resultsSection.style.display = 'block';
  dom.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Small delay to let skeleton render
  await sleep(200);

  // Render real cards
  dom.animeGrid.innerHTML = animeList.map((a, i) =>
    renderAnimeCard(a, { rank: i + 1, matchScore: a._matchScore })
  ).join('');

  attachCardListeners(dom.animeGrid, animeList);

  // Update header
  dom.resultsTitle.textContent = `${moodLabel} Recommendations`;
  dom.resultsSub.textContent = `${animeList.length} anime matched your mood · Click any card for details`;
}

/** Render the similar anime section */
async function renderSimilar(anime) {
  dom.similarSection.style.display = 'none';
  try {
    const excludeIds = state.currentResults.map(a => a.mal_id);
    const similar = await fetchSimilarAnime(anime, excludeIds);
    if (!similar.length) return;

    dom.similarGrid.innerHTML = similar.map(a =>
      renderAnimeCard(a, { showMatch: false, small: true })
    ).join('');
    attachCardListeners(dom.similarGrid, similar);
    dom.similarSection.style.display = 'block';
  } catch (e) {
    // silently fail — similar is a bonus feature
    console.warn('Could not load similar anime:', e);
  }
}

// ─────────────────────────────────────────────
// 8. DETAIL PANEL
// ─────────────────────────────────────────────

/** Open the slide-in detail panel for an anime */
async function openDetailPanel(anime) {
  state.currentDetail = anime;
  dom.detailContent.innerHTML = `<div style="height:300px;display:flex;align-items:center;justify-content:center"><div style="color:var(--text3)">Loading...</div></div>`;
  dom.detailOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Fetch full details if synopsis is missing
  let fullAnime = anime;
  if (!anime.synopsis) {
    try {
      await sleep(CONFIG.jikanDelay);
      const res = await fetch(`${CONFIG.jikanBase}/anime/${anime.mal_id}`);
      const json = await res.json();
      fullAnime = json.data || anime;
    } catch { /* use basic data */ }
  }

  renderDetailContent(fullAnime);

  // Load similar anime in background
  renderSimilar(fullAnime);
}

/** Render the detail panel content */
function renderDetailContent(anime) {
  const title = anime.title_english || anime.title;
  const score = anime.score ? anime.score.toFixed(1) : '—';
  const img = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
  const faved = isFav(anime.mal_id);
  const matchScore = anime._matchScore ?? calcMatchScore(anime, state.selectedMood);
  const genres = (anime.genres || []).map(g =>
    `<span class="det-genre-tag">${g.name}</span>`
  ).join('');

  dom.detailContent.innerHTML = `
    <div class="det-hero">
      ${img ? `<img class="det-hero-img" src="${img}" alt="${title}">` : ''}
      <div class="det-hero-gradient"></div>
      <div class="det-hero-body">
        ${img ? `<img class="det-poster" src="${anime.images?.jpg?.image_url}" alt="${title}">` : ''}
        <div>
          <div class="det-title">${title}</div>
          <div class="det-native">${anime.title !== title ? anime.title : ''}</div>
          <div class="det-genres">${genres}</div>
        </div>
      </div>
    </div>

    <div class="det-body">
      <!-- Stats row -->
      <div class="det-stats">
        <div class="det-stat">
          <div class="val">⭐ ${score}</div>
          <div class="lbl">MAL Score</div>
        </div>
        <div class="det-stat">
          <div class="val">${anime.episodes || '?'}</div>
          <div class="lbl">Episodes</div>
        </div>
        <div class="det-stat">
          <div class="val">${anime.year || '—'}</div>
          <div class="lbl">Year</div>
        </div>
        <div class="det-stat">
          <div class="val">${anime.members ? (anime.members / 1000).toFixed(0) + 'k' : '—'}</div>
          <div class="lbl">Members</div>
        </div>
        <div class="det-stat">
          <div class="val">${anime.status || '—'}</div>
          <div class="lbl">Status</div>
        </div>
      </div>

      <!-- Match score bar -->
      <div class="det-match-bar">
        <div class="det-match-label">Mood Match Score</div>
        <div class="det-bar-track">
          <div class="det-bar-fill" id="detMatchFill" style="width:0%"></div>
        </div>
        <div class="det-match-score">${matchScore}% match</div>
      </div>

      <!-- Synopsis -->
      ${anime.synopsis ? `
        <div class="det-synopsis-label">Synopsis</div>
        <div class="det-synopsis" id="detSynopsis">${anime.synopsis}</div>
        <button class="det-readmore" id="detReadMore">Read more ▾</button>
      ` : ''}

      <!-- Action buttons -->
      <div class="det-actions">
        <button class="det-fav-btn ${faved ? 'faved' : ''}"
                id="detFavBtn"
                data-fav-id="${anime.mal_id}">
          ${faved ? '❤️ In Favorites' : '🤍 Add to Favorites'}
        </button>
        <a href="https://myanimelist.net/anime/${anime.mal_id}"
           target="_blank" class="det-mal-btn">
          MAL ↗
        </a>
      </div>
    </div>
  `;

  // Animate match bar
  requestAnimationFrame(() => {
    setTimeout(() => {
      const fill = $('detMatchFill');
      if (fill) fill.style.width = matchScore + '%';
    }, 100);
  });

  // Read more toggle
  const readMore = $('detReadMore');
  const synopsis = $('detSynopsis');
  if (readMore && synopsis) {
    readMore.addEventListener('click', () => {
      synopsis.classList.toggle('expanded');
      readMore.textContent = synopsis.classList.contains('expanded') ? 'Read less ▴' : 'Read more ▾';
    });
  }

  // Detail favorite button
  const detFavBtn = $('detFavBtn');
  if (detFavBtn) {
    detFavBtn.addEventListener('click', () => {
      toggleFav(anime);
      detFavBtn.classList.toggle('faved', isFav(anime.mal_id));
      detFavBtn.textContent = isFav(anime.mal_id) ? '❤️ In Favorites' : '🤍 Add to Favorites';
    });
  }
}

/** Close the detail panel */
function closeDetailPanel() {
  dom.detailOverlay.classList.remove('open');
  document.body.style.overflow = '';
  state.currentDetail = null;
}

// ─────────────────────────────────────────────
// 9. MOOD SELECTION & FLOW
// ─────────────────────────────────────────────

/** Handle mood tile selection */
function selectMood(moodId) {
  state.selectedMood = moodId;

  // Update tile UI
  document.querySelectorAll('.mood-tile').forEach(t => {
    t.classList.toggle('selected', t.dataset.mood === moodId);
  });

  // Show genre filter and update CTA
  dom.filterSection.style.display = 'block';
  updateCTA();

  // Clear any AI-detected mood conflict
  if (state.detectedMood && state.detectedMood.mood !== moodId) {
    state.detectedMood = null;
    dom.detectedMood.style.display = 'none';
  }
}

/** Handle text analysis with Gemini AI */
async function handleAnalyze() {
  const text = dom.moodText.value.trim();
  if (!text) { showToast('✏️ Write something first!'); return; }

  dom.analyzeBtn.disabled = true;
  dom.analyzeBtn.innerHTML = '<span class="analyze-icon">⏳</span> Analyzing...';

  try {
    const result = await analyzeMoodWithAI(text);
    if (!result) return;

    state.detectedMood = result;

    // Show detected mood pill
    dom.detectedValue.textContent = `${result.emoji} ${result.mood} (${result.confidence}% confidence) — ${result.reason}`;
    dom.detectedMood.style.display = 'flex';

    // Auto-select the detected mood tile
    selectMood(result.mood);
    showToast(`✦ Mood detected: ${result.mood}`);
  } catch (err) {
    showToast(`❌ AI Error: ${err.message}`);
    console.error('Gemini error:', err);
  } finally {
    dom.analyzeBtn.disabled = false;
    dom.analyzeBtn.innerHTML = '<span class="analyze-icon">✦</span> Analyze with AI';
  }
}

/** Toggle a genre filter pill */
function toggleGenre(pill) {
  const id = parseInt(pill.dataset.genreId);
  if (state.activeGenres.has(id)) {
    state.activeGenres.delete(id);
    pill.classList.remove('active');
  } else {
    state.activeGenres.add(id);
    pill.classList.add('active');
  }
}

/** Update the recommend button state based on current selections */
function updateCTA() {
  const hasMood = !!state.selectedMood;
  dom.recommendBtn.disabled = !hasMood;
  dom.ctaHint.textContent = hasMood
    ? 'Ready! Click to get your personalized anime'
    : 'Select a mood or write how you feel to continue';
}

/** Main recommendation flow */
async function handleRecommend() {
  if (!state.selectedMood) return;

  const mood = MOODS.find(m => m.id === state.selectedMood);
  const genreFilter = [...state.activeGenres];
  const moodText = dom.moodText.value.trim();

  // Disable button during loading
  dom.recommendBtn.disabled = true;
  dom.recommendBtn.querySelector('.recommend-text').textContent = 'Finding anime...';

  // Show loading skeletons
  dom.resultsSection.style.display = 'block';
  dom.animeGrid.innerHTML = renderSkeletons();
  dom.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  dom.similarSection.style.display = 'none';

  try {
    let animeList = [];

    // If AI key is available, use Gemini to get title recommendations
    if (state.apiKey && moodText) {
      try {
        const aiRecs = await getAIAnimeRecommendations(state.selectedMood, moodText, 5);
        if (aiRecs.length > 0) {
          // Search Jikan for each AI-recommended title
          const aiResults = await Promise.allSettled(
            aiRecs.map(async (rec) => {
              const anime = await searchAnimeByTitle(rec.title);
              if (anime) anime._aiReason = rec.reason;
              return anime;
            })
          );
          const validAI = aiResults
            .filter(r => r.status === 'fulfilled' && r.value)
            .map(r => r.value);

          animeList = validAI.map(a => ({
            ...a,
            _matchScore: calcMatchScore(a, state.selectedMood),
          }));
        }
      } catch (aiErr) {
        console.warn('AI recommendations failed, using genre-based:', aiErr);
      }
    }

    // Fallback or supplement with genre-based recommendations
    if (animeList.length < 5) {
      const genreResults = await fetchRecommendations(state.selectedMood, genreFilter);
      // Merge: avoid duplicates
      const existingIds = new Set(animeList.map(a => a.mal_id));
      const newOnes = genreResults.filter(a => !existingIds.has(a.mal_id));
      animeList = [...animeList, ...newOnes].slice(0, CONFIG.maxResults);
    }

    // Sort by match score
    animeList.sort((a, b) => b._matchScore - a._matchScore);

    state.currentResults = animeList;

    // Render results
    await renderResults(animeList, mood.label);

    // Save to history
    addToHistory(state.selectedMood, moodText, animeList.length);

  } catch (err) {
    dom.animeGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text2)">
        <div style="font-size:2.5rem;margin-bottom:0.8rem">😵</div>
        <p>Could not load recommendations. Check your connection and try again.</p>
        <p style="font-size:0.75rem;color:var(--text3);margin-top:0.4rem">${err.message}</p>
      </div>`;
    console.error('Recommendation error:', err);
    showToast('❌ Failed to load anime. Try again.');
  } finally {
    dom.recommendBtn.disabled = false;
    dom.recommendBtn.querySelector('.recommend-text').textContent = 'Find My Anime';
  }
}

/** Reset the mood selection to start over */
function handleRetry() {
  state.selectedMood = null;
  state.detectedMood = null;
  state.activeGenres.clear();

  document.querySelectorAll('.mood-tile').forEach(t => t.classList.remove('selected'));
  document.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
  dom.moodText.value = '';
  dom.charCount.textContent = '0 / 200';
  dom.detectedMood.style.display = 'none';
  dom.filterSection.style.display = 'none';
  dom.resultsSection.style.display = 'none';
  updateCTA();

  // Scroll back to top of page
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─────────────────────────────────────────────
// 10. HISTORY SYSTEM
// ─────────────────────────────────────────────

/** Add an entry to mood history */
function addToHistory(moodId, text, resultCount) {
  const mood = MOODS.find(m => m.id === moodId);
  state.history.unshift({
    id: Date.now(),
    moodId,
    label: mood?.label || moodId,
    emoji: mood?.emoji || '✦',
    text: text || mood?.sub,
    resultCount,
    timestamp: Date.now(),
  });

  // Keep max 50 entries
  if (state.history.length > 50) state.history.pop();
  persist.saveHistory();
}

/** Render the history view */
function renderHistory() {
  if (!state.history.length) {
    dom.historyList.innerHTML = '';
    dom.historyEmpty.style.display = 'flex';
    $('chartWrap').style.display = 'none';
    return;
  }

  dom.historyEmpty.style.display = 'none';
  $('chartWrap').style.display = 'block';

  // Mood distribution chart
  const counts = {};
  state.history.forEach(h => counts[h.label] = (counts[h.label] || 0) + 1);
  const max = Math.max(...Object.values(counts), 1);

  dom.chartBars.innerHTML = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => {
      const mood = MOODS.find(m => m.label === label);
      return `
        <div class="chart-row">
          <div class="chart-label">${mood?.emoji || ''} ${label}</div>
          <div class="chart-track">
            <div class="chart-fill" style="width:${(count / max) * 100}%"></div>
          </div>
          <div class="chart-count">${count}</div>
        </div>
      `;
    }).join('');

  // History items
  dom.historyList.innerHTML = state.history.map(h => `
    <div class="history-item" data-mood="${h.moodId}">
      <div class="history-mood-emoji">${h.emoji}</div>
      <div class="history-info">
        <h4>${h.label}</h4>
        <p>${h.text || ''} · ${h.resultCount} anime found</p>
      </div>
      <div class="history-time">${timeAgo(h.timestamp)}</div>
    </div>
  `).join('');

  // Click history item to re-run that mood
  dom.historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      showView('home');
      selectMood(item.dataset.mood);
      setTimeout(() => handleRecommend(), 300);
    });
  });
}

// ─────────────────────────────────────────────
// 11. FAVORITES VIEW
// ─────────────────────────────────────────────

/** Render the favorites view */
function renderFavorites() {
  if (!state.favorites.length) {
    dom.favsGrid.innerHTML = '';
    dom.favsEmpty.style.display = 'flex';
    return;
  }

  dom.favsEmpty.style.display = 'none';

  // Construct minimal anime objects from stored favorites
  const favAnimes = state.favorites.map(f => ({
    mal_id: f.mal_id,
    title: f.title,
    title_english: f.title,
    images: { jpg: { image_url: f.image, large_image_url: f.image } },
    score: f.score,
    episodes: f.episodes,
    genres: (f.genres || []).map(name => ({ name })),
    _matchScore: null,
  }));

  dom.favsGrid.innerHTML = favAnimes.map(a =>
    renderAnimeCard(a, { showMatch: false })
  ).join('');

  attachCardListeners(dom.favsGrid, favAnimes);
}

// ─────────────────────────────────────────────
// 12. VIEW NAVIGATION
// ─────────────────────────────────────────────

/** Switch between main views */
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const view = document.getElementById(`view-${viewId}`);
  const btn  = document.querySelector(`[data-view="${viewId}"]`);
  if (view) view.classList.add('active');
  if (btn)  btn.classList.add('active');

  // Trigger view-specific renders
  if (viewId === 'favorites') renderFavorites();
  if (viewId === 'history')   renderHistory();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─────────────────────────────────────────────
// 13. SETTINGS (API KEY)
// ─────────────────────────────────────────────

function openSettings() {
  dom.apiKeyInput.value = state.apiKey;
  dom.keyStatus.textContent = state.apiKey ? '✓ Key is saved' : '';
  dom.keyStatus.className = 'modal-status ok';
  dom.settingsModal.classList.add('open');
}

function closeSettings() {
  dom.settingsModal.classList.remove('open');
}

function saveApiKey() {
  const key = dom.apiKeyInput.value.trim();
  if (!key) {
    dom.keyStatus.textContent = '✕ Please enter a key';
    dom.keyStatus.className = 'modal-status err';
    return;
  }
  state.apiKey = key;
  persist.saveKey(key);
  dom.keyStatus.textContent = '✓ Key saved successfully!';
  dom.keyStatus.className = 'modal-status ok';
  showToast('✓ API key saved');
  setTimeout(closeSettings, 1000);
}

// ─────────────────────────────────────────────
// 14. EVENT LISTENERS
// ─────────────────────────────────────────────

function attachListeners() {
  // Nav buttons
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Textarea character count
  dom.moodText.addEventListener('input', () => {
    const len = Math.min(dom.moodText.value.length, 200);
    dom.moodText.value = dom.moodText.value.slice(0, 200);
    dom.charCount.textContent = `${len} / 200`;
    dom.charCount.style.color = len > 180 ? 'var(--red)' : '';
  });

  // Analyze button
  dom.analyzeBtn.addEventListener('click', handleAnalyze);

  // Clear detected mood
  dom.clearDetected.addEventListener('click', () => {
    state.detectedMood = null;
    dom.detectedMood.style.display = 'none';
  });

  // Recommend button
  dom.recommendBtn.addEventListener('click', handleRecommend);

  // Retry button
  dom.retryBtn.addEventListener('click', handleRetry);

  // Settings modal
  dom.settingsBtn.addEventListener('click', openSettings);
  dom.closeSettings.addEventListener('click', closeSettings);
  dom.saveApiKey.addEventListener('click', saveApiKey);
  dom.settingsModal.addEventListener('click', e => {
    if (e.target === dom.settingsModal) closeSettings();
  });

  // Detail panel close
  dom.detailClose.addEventListener('click', closeDetailPanel);
  dom.detailOverlay.addEventListener('click', e => {
    if (e.target === dom.detailOverlay) closeDetailPanel();
  });

  // Clear favorites
  $('clearFavs').addEventListener('click', () => {
    state.favorites = [];
    persist.saveFavorites();
    updateFavCount();
    renderFavorites();
    showToast('🗑 Favorites cleared');
  });

  // Clear history
  $('clearHistory').addEventListener('click', () => {
    state.history = [];
    persist.saveHistory();
    renderHistory();
    showToast('🗑 History cleared');
  });

  // Keyboard: Escape to close panels
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeDetailPanel();
      closeSettings();
    }
    // Enter in textarea triggers analyze
    if (e.key === 'Enter' && e.ctrlKey && document.activeElement === dom.moodText) {
      handleAnalyze();
    }
  });
}

// ─────────────────────────────────────────────
// 15. BOOT
// ─────────────────────────────────────────────

async function init() {
  // Render static UI
  renderMoodGrid();
  renderGenrePills();
  updateFavCount();
  updateCTA();

  // If no API key saved, open settings after a delay
  if (!state.apiKey) {
    setTimeout(() => {
      dom.keyStatus.textContent = '⚡ Add a free key to enable AI features';
      dom.keyStatus.className = 'modal-status ok';
      openSettings();
    }, 1800);
  }

  // Attach all event listeners
  attachListeners();

  // Hide loader
  await sleep(1400);
  dom.loader.classList.add('hidden');
}

// Start the app
init();
