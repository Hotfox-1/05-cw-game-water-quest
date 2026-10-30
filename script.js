const TRIPS = {
  large: { duration: 8, points: 3, hydration: 38, health: 0, label: 'Large bucket water trip', destination: 'the lake' },
  small: { duration: 4, points: 1, hydration: 17, health: 0, label: 'Small bottle water trip', destination: 'the lake' },
  clinic: { duration: 6, points: 2, hydration: 0, health: 34, label: 'Clinic medicine trip', destination: 'the clinic' }
};

const DIFFICULTIES = {
  easy: { label: 'Easy', drainMultiplier: 1 },
  medium: { label: 'Medium', drainMultiplier: 1.2 },
  hard: { label: 'Hard', drainMultiplier: 1.4 }
};

const state = {
  active: false,
  hydration: 70,
  health: 75,
  score: 0,
  elapsed: 0,
  paused: false,
  trip: null,
  tripElapsed: 0,
  difficulty: 'easy',
  statusMessage: '',
  milestones: [],
  nextSurvivalMilestone: 20,
  lastTick: 0
};

const byId = id => document.getElementById(id);
const tripButtons = [...document.querySelectorAll('[data-trip]')];
let gameLoop;

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function updateMeter(name, value) {
  const rounded = Math.max(0, Math.ceil(value));
  const bar = byId(`${name}-bar`);
  const track = bar.parentElement;
  byId(`${name}-value`).textContent = `${rounded}%`;
  bar.style.width = `${Math.max(0, value)}%`;
  track.setAttribute('aria-valuenow', String(rounded));
  track.classList.toggle('is-low', value <= 25);
}

function updateView() {
  updateMeter('hydration', state.hydration);
  updateMeter('health', state.health);
  byId('timer').textContent = formatTime(state.elapsed);
  byId('score').textContent = String(state.score);
  byId('difficulty-label').textContent = DIFFICULTIES[state.difficulty].label;
  tripButtons.forEach(button => { button.disabled = !state.active || state.paused || Boolean(state.trip); });
  byId('pause-game').disabled = !state.active;
  byId('pause-game').setAttribute('aria-label', state.paused ? 'Resume game' : 'Pause game');
  byId('pause-symbol').textContent = state.paused ? '▶' : 'Ⅱ';
  byId('pause-label').textContent = state.paused ? 'Resume' : 'Pause';
  byId('pause-overlay').hidden = !state.paused;
  const milestoneMessage = byId('milestone-message');
  const latestMilestone = state.milestones.at(-1);
  milestoneMessage.hidden = !latestMilestone;
  milestoneMessage.textContent = latestMilestone ? `Milestone reached: ${latestMilestone.title}` : '';
  updateScene();

  const status = byId('trip-status');
  const dot = byId('status-dot');
  if (state.trip) {
    const remaining = Math.max(0, Math.ceil(state.trip.duration - state.tripElapsed));
    const isReturning = state.tripElapsed >= state.trip.duration / 2;
    status.textContent = `${state.trip.label} — ${isReturning ? 'returning' : 'outbound'}, ${remaining}s left`;
    dot.classList.add('is-traveling');
  } else {
    status.textContent = state.statusMessage || (state.active ? 'At home · choose your next supply run' : 'Ready at home');
    dot.classList.remove('is-traveling');
  }
}

function awardMilestone(key, title, detail) {
  if (state.milestones.some(milestone => milestone.key === key)) return;
  state.milestones.push({ key, title, detail });
}

function renderMilestoneRecap() {
  const list = byId('milestone-list');
  list.replaceChildren();
  if (!state.milestones.length) {
    const item = document.createElement('li');
    item.textContent = 'No milestones reached this journey. Every attempt is a fresh start.';
    list.append(item);
    return;
  }

  state.milestones.forEach(milestone => {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = milestone.title;
    const detail = document.createElement('span');
    detail.textContent = milestone.detail;
    item.append(title, detail);
    list.append(item);
  });
}

function updateScene() {
  const traveler = byId('traveler');
  const caption = byId('scene-caption');
  const lake = byId('lake-location');
  const clinic = byId('clinic-location');
  lake.classList.toggle('is-active', state.trip?.destination === 'the lake');
  clinic.classList.toggle('is-active', state.trip?.destination === 'the clinic');
  traveler.classList.toggle('is-walking', Boolean(state.trip) && !state.paused);
  const journeyProgress = state.trip ? Math.min(state.tripElapsed / state.trip.duration, 1) : 0;
  const isReturningEmpty = Boolean(state.trip?.lostSupplies) && journeyProgress >= 0.5;
  const isHeadingLeft = state.trip && (state.trip.destination === 'the lake'
    ? journeyProgress < 0.5
    : journeyProgress >= 0.5);
  traveler.classList.toggle('is-facing-left', Boolean(isHeadingLeft));
  traveler.classList.toggle('has-supplies', Boolean(state.trip) && state.tripElapsed >= state.trip.duration / 2 && !state.trip.lostSupplies);
  traveler.classList.toggle('is-tripped', isReturningEmpty);
  traveler.dataset.supply = state.trip?.type || '';
  traveler.setAttribute('aria-label', state.trip ? `Traveler going to ${state.trip.destination}` : 'Traveler at home');

  if (!state.trip) {
    traveler.style.setProperty('--traveler-x', '50%');
    caption.textContent = state.active ? 'Home is waiting. Choose your next trip.' : 'A safe home is worth every step';
    return;
  }

  const destinationX = state.trip.destination === 'the lake' ? 12 : 88;
  const position = journeyProgress <= 0.5
    ? 50 + (destinationX - 50) * (journeyProgress * 2)
    : destinationX + (50 - destinationX) * ((journeyProgress - 0.5) * 2);
  traveler.style.setProperty('--traveler-x', `${position}%`);
  caption.textContent = journeyProgress < 0.5
    ? `Walking to ${state.trip.destination}…`
    : isReturningEmpty ? 'They stumbled and are heading home empty-handed…' : 'Supplies collected · walking home…';
}

function togglePause(forcePaused) {
  if (!state.active) return;
  state.paused = typeof forcePaused === 'boolean' ? forcePaused : !state.paused;
  state.lastTick = performance.now();
  updateView();
  if (state.paused) byId('resume-game').focus();
  else byId('pause-game').focus();
}

function startGame() {
  clearInterval(gameLoop);
  state.difficulty = byId('difficulty-select').value;
  Object.assign(state, {
    active: true,
    hydration: 70,
    health: 75,
    score: 0,
    elapsed: 0,
    paused: false,
    trip: null,
    tripElapsed: 0,
    statusMessage: '',
    milestones: [],
    nextSurvivalMilestone: 30,
    lastTick: performance.now()
  });
  byId('start-overlay').hidden = true;
  byId('game-over').hidden = true;
  document.querySelector('.dashboard').classList.remove('is-danger');
  updateView();
  gameLoop = setInterval(tick, 100);
}

function beginTrip(type) {
  if (!state.active || state.trip) return;
  const difficulty = state.difficulty;
  const tripChance = difficulty === 'easy' ? 0 : difficulty === 'medium'
    ? 1 / 20
    : 1 / 20 + (1 / 12 - 1 / 20) * Math.min(state.elapsed / 180, 1);
  state.trip = { ...TRIPS[type], type, lostSupplies: Math.random() < tripChance };
  state.tripElapsed = 0;
  state.statusMessage = '';
  updateView();
}

function tick() {
  if (!state.active || state.paused) return;
  const now = performance.now();
  const delta = Math.min((now - state.lastTick) / 1000, 0.5);
  state.lastTick = now;
  state.elapsed += delta;

  while (state.elapsed >= state.nextSurvivalMilestone) {
    const seconds = state.nextSurvivalMilestone;
    awardMilestone(`survival-${seconds}`, `Survived ${seconds} seconds`, 'Kept the household going through another stretch.');
    state.nextSurvivalMilestone += 30;
  }

  // Needs gradually drain faster as survival time grows, including during travel.
  const drainMultiplier = Math.min(1 + Math.floor(state.elapsed / 25) * 0.1, 2.2);
  const difficultyDrain = DIFFICULTIES[state.difficulty].drainMultiplier;
  state.hydration -= delta * 1.45 * difficultyDrain;
  state.health -= delta * 0.82 * drainMultiplier * difficultyDrain;

  if (state.hydration <= 0 || state.health <= 0) {
    state.hydration = Math.max(0, state.hydration);
    state.health = Math.max(0, state.health);
    updateView();
    endGame();
    return;
  }

  if (state.trip) {
    state.tripElapsed += delta;
    if (state.tripElapsed >= state.trip.duration) {
      const completedTrip = state.trip;
      if (completedTrip.lostSupplies) {
        state.statusMessage = `${completedTrip.label} failed — they tripped and returned with nothing.`;
      } else {
        state.hydration = Math.min(100, state.hydration + completedTrip.hydration);
        state.health = Math.min(100, state.health + completedTrip.health);
        state.score += completedTrip.points;
        state.statusMessage = `${completedTrip.label} complete — supplies delivered!`;
        if (!state.milestones.some(milestone => milestone.key === 'first-delivery')) {
          awardMilestone('first-delivery', 'First supply run delivered', 'Brought the first water or medicine safely home.');
        }
        if (state.score >= 5) {
          awardMilestone('score-5', 'Reached 5 points', 'Successful supply trips are adding up.');
        }
        if (state.score >= 10) {
          awardMilestone('score-10', 'Reached 10 points', 'A standout record of successful deliveries.');
        }
      }
      state.trip = null;
      state.tripElapsed = 0;
    }
  }

  if (state.hydration <= 0 || state.health <= 0) {
    state.hydration = Math.max(0, state.hydration);
    state.health = Math.max(0, state.health);
    updateView();
    endGame();
    return;
  }
  updateView();
}

function endGame() {
  state.active = false;
  state.paused = false;
  clearInterval(gameLoop);
  byId('final-time').textContent = formatTime(state.elapsed);
  byId('final-score').textContent = String(state.score);
  renderMilestoneRecap();
  byId('result-message').textContent = state.hydration <= 0
    ? 'The household ran out of water. Every safe trip made a difference.'
    : 'The household’s health ran out. Every safe trip made a difference.';
  byId('game-over').hidden = false;
  document.querySelector('.dashboard').classList.add('is-danger');
  byId('start-game').focus();
  updateView();
}

tripButtons.forEach(button => {
  button.addEventListener('click', () => beginTrip(button.dataset.trip));
});
byId('pause-game').addEventListener('click', () => togglePause());
byId('resume-game').addEventListener('click', () => togglePause(false));
byId('begin-game').addEventListener('click', startGame);
byId('start-game').addEventListener('click', startGame);
updateView();
