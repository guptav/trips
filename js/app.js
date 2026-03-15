/* =============================================
   Trip Planner – Application Logic
   ============================================= */

/* ---------- State ---------- */
let state = {
  trips: [],
  currentTripId: null,
};

/* ---------- LocalStorage helpers ---------- */
const STORAGE_KEY = 'tripplanner_data';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.trips)) {
        state = parsed;
      }
    }
  } catch (_) {
    // If parsing fails, start fresh
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {
    // If storage fails (e.g., private mode), silently continue
  }
}

/* ---------- ID generation ---------- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Activity helpers ---------- */
const DEFAULT_SORT_TIME = '99:99';

function sortActivitiesByTime(activities) {
  activities.sort((a, b) =>
    (a.time || DEFAULT_SORT_TIME).localeCompare(b.time || DEFAULT_SORT_TIME)
  );
}

/* ---------- DOM refs ---------- */
const viewDashboard    = document.getElementById('view-dashboard');
const viewTrip         = document.getElementById('view-trip');
const tripsGrid        = document.getElementById('trips-grid');
const tripsEmpty       = document.getElementById('trips-empty');
const daysList         = document.getElementById('days-list');
const daysEmpty        = document.getElementById('days-empty');
const modalOverlay     = document.getElementById('modal-overlay');
const modalTitle       = document.getElementById('modal-title');
const modalBody        = document.getElementById('modal-body');
const modalCloseBtn    = document.getElementById('modal-close-btn');

const tripNameDisplay  = document.getElementById('trip-name-display');
const tripDestDisplay  = document.getElementById('trip-destination-display');
const tripDatesDisplay = document.getElementById('trip-dates-display');
const tripNotesDisplay = document.getElementById('trip-notes-display');

/* ---------- View management ---------- */
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Modal ---------- */
function openModal(title, bodyHTML, onSubmit) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHTML;
  modalOverlay.classList.remove('hidden');

  // Wire up cancel button if present
  const cancelBtn = modalBody.querySelector('[data-action="cancel"]');
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  // Wire up form submission
  const form = modalBody.querySelector('form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      onSubmit(form);
    });
  }
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  modalBody.innerHTML = '';
}

/* ---------- Date helpers ---------- */
function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function tripDuration(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const ms = new Date(endDate) - new Date(startDate);
  const days = Math.round(ms / 86400000) + 1;
  return days > 0 ? days : null;
}

/* ---------- Trip CRUD ---------- */
function getTripById(id) {
  return state.trips.find(t => t.id === id);
}

function tripFormHTML(trip) {
  const t = trip || {};
  return `
    <form id="trip-form" novalidate>
      <div class="form-group">
        <label for="f-name">Trip Name <span style="color:var(--color-danger)">*</span></label>
        <input id="f-name" name="name" type="text" placeholder="e.g. Summer in Japan" required
               value="${escHtml(t.name || '')}" autocomplete="off" />
      </div>
      <div class="form-group">
        <label for="f-dest">Destination</label>
        <input id="f-dest" name="destination" type="text" placeholder="e.g. Tokyo, Japan"
               value="${escHtml(t.destination || '')}" autocomplete="off" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="f-start">Start Date</label>
          <input id="f-start" name="startDate" type="date" value="${escHtml(t.startDate || '')}" />
        </div>
        <div class="form-group">
          <label for="f-end">End Date</label>
          <input id="f-end" name="endDate" type="date" value="${escHtml(t.endDate || '')}" />
        </div>
      </div>
      <div class="form-group">
        <label for="f-notes">Notes</label>
        <textarea id="f-notes" name="notes" placeholder="Packing list, reminders, budget…">${escHtml(t.notes || '')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-action="cancel">Cancel</button>
        <button type="submit" class="btn btn-primary">${trip ? 'Save Changes' : 'Create Trip'}</button>
      </div>
    </form>`;
}

function createTrip(formData) {
  const name = formData.get('name').trim();
  if (!name) return;
  const trip = {
    id:          uid(),
    name,
    destination: formData.get('destination').trim(),
    startDate:   formData.get('startDate'),
    endDate:     formData.get('endDate'),
    notes:       formData.get('notes').trim(),
    days:        [],
  };
  state.trips.unshift(trip);
  saveState();
  closeModal();
  renderDashboard();
}

function updateTrip(tripId, formData) {
  const trip = getTripById(tripId);
  if (!trip) return;
  const name = formData.get('name').trim();
  if (!name) return;
  trip.name        = name;
  trip.destination = formData.get('destination').trim();
  trip.startDate   = formData.get('startDate');
  trip.endDate     = formData.get('endDate');
  trip.notes       = formData.get('notes').trim();
  saveState();
  closeModal();
  renderTripDetail(tripId);
}

function deleteTrip(tripId) {
  state.trips = state.trips.filter(t => t.id !== tripId);
  saveState();
  showView('view-dashboard');
  renderDashboard();
}

/* ---------- Dashboard rendering ---------- */
function renderDashboard() {
  showView('view-dashboard');
  tripsGrid.innerHTML = '';

  if (state.trips.length === 0) {
    tripsEmpty.classList.remove('hidden');
    tripsGrid.classList.add('hidden');
    return;
  }

  tripsEmpty.classList.add('hidden');
  tripsGrid.classList.remove('hidden');

  state.trips.forEach(trip => {
    const duration = tripDuration(trip.startDate, trip.endDate);
    const card = document.createElement('article');
    card.className = 'trip-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Open trip: ${trip.name}`);
    card.innerHTML = `
      <div class="trip-card-banner"></div>
      <div class="trip-card-body">
        <div class="trip-card-name">${escHtml(trip.name)}</div>
        ${trip.destination
          ? `<div class="trip-card-dest"><span class="icon">📍</span>${escHtml(trip.destination)}</div>`
          : ''}
        ${trip.startDate
          ? `<div class="trip-card-dates">
               ${formatDate(trip.startDate)}${trip.endDate ? ' → ' + formatDate(trip.endDate) : ''}
             </div>`
          : ''}
        ${duration
          ? `<div class="trip-card-days-badge">${duration} day${duration !== 1 ? 's' : ''}</div>`
          : ''}
      </div>
      <div class="trip-card-footer">
        <span class="badge badge-blue">${trip.days.length} day${trip.days.length !== 1 ? 's' : ''} planned</span>
      </div>`;

    const open = () => renderTripDetail(trip.id);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });

    tripsGrid.appendChild(card);
  });
}

/* ---------- Day CRUD ---------- */
function dayFormHTML(day) {
  const d = day || {};
  return `
    <form id="day-form" novalidate>
      <div class="form-group">
        <label for="f-day-label">Label <span style="color:var(--color-danger)">*</span></label>
        <input id="f-day-label" name="label" type="text" placeholder="e.g. Day 1 – Arrival"
               required value="${escHtml(d.label || '')}" autocomplete="off" />
      </div>
      <div class="form-group">
        <label for="f-day-date">Date</label>
        <input id="f-day-date" name="date" type="date" value="${escHtml(d.date || '')}" />
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-action="cancel">Cancel</button>
        <button type="submit" class="btn btn-primary">${day ? 'Save Changes' : 'Add Day'}</button>
      </div>
    </form>`;
}

function addDay(tripId, formData) {
  const trip = getTripById(tripId);
  if (!trip) return;
  const label = formData.get('label').trim();
  if (!label) return;
  trip.days.push({ id: uid(), label, date: formData.get('date'), activities: [] });
  saveState();
  closeModal();
  renderTripDetail(tripId);
}

function updateDay(tripId, dayId, formData) {
  const trip = getTripById(tripId);
  const day  = trip && trip.days.find(d => d.id === dayId);
  if (!day) return;
  const label = formData.get('label').trim();
  if (!label) return;
  day.label = label;
  day.date  = formData.get('date');
  saveState();
  closeModal();
  renderTripDetail(tripId);
}

function deleteDay(tripId, dayId) {
  const trip = getTripById(tripId);
  if (!trip) return;
  trip.days = trip.days.filter(d => d.id !== dayId);
  saveState();
  renderTripDetail(tripId);
}

/* ---------- Activity CRUD ---------- */
function activityFormHTML(activity) {
  const a = activity || {};
  return `
    <form id="activity-form" novalidate>
      <div class="form-group">
        <label for="f-act-title">Activity <span style="color:var(--color-danger)">*</span></label>
        <input id="f-act-title" name="title" type="text" placeholder="e.g. Visit Senso-ji Temple"
               required value="${escHtml(a.title || '')}" autocomplete="off" />
      </div>
      <div class="form-group">
        <label for="f-act-time">Time</label>
        <input id="f-act-time" name="time" type="time" value="${escHtml(a.time || '')}" />
      </div>
      <div class="form-group">
        <label for="f-act-note">Notes</label>
        <textarea id="f-act-note" name="note" placeholder="Address, booking reference, tips…">${escHtml(a.note || '')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-action="cancel">Cancel</button>
        <button type="submit" class="btn btn-primary">${activity ? 'Save Changes' : 'Add Activity'}</button>
      </div>
    </form>`;
}

function addActivity(tripId, dayId, formData) {
  const trip = getTripById(tripId);
  const day  = trip && trip.days.find(d => d.id === dayId);
  if (!day) return;
  const title = formData.get('title').trim();
  if (!title) return;
  day.activities.push({
    id:   uid(),
    title,
    time: formData.get('time'),
    note: formData.get('note').trim(),
    done: false,
  });
  // Sort by time
  sortActivitiesByTime(day.activities);
  saveState();
  closeModal();
  renderTripDetail(tripId);
}

function updateActivity(tripId, dayId, actId, formData) {
  const trip  = getTripById(tripId);
  const day   = trip && trip.days.find(d => d.id === dayId);
  const act   = day && day.activities.find(a => a.id === actId);
  if (!act) return;
  const title = formData.get('title').trim();
  if (!title) return;
  act.title = title;
  act.time  = formData.get('time');
  act.note  = formData.get('note').trim();
  sortActivitiesByTime(day.activities);
  saveState();
  closeModal();
  renderTripDetail(tripId);
}

function deleteActivity(tripId, dayId, actId) {
  const trip = getTripById(tripId);
  const day  = trip && trip.days.find(d => d.id === dayId);
  if (!day) return;
  day.activities = day.activities.filter(a => a.id !== actId);
  saveState();
  renderTripDetail(tripId);
}

function toggleActivity(tripId, dayId, actId) {
  const trip = getTripById(tripId);
  const day  = trip && trip.days.find(d => d.id === dayId);
  const act  = day && day.activities.find(a => a.id === actId);
  if (!act) return;
  act.done = !act.done;
  saveState();
  renderTripDetail(tripId);
}

/* ---------- Trip detail rendering ---------- */
function renderTripDetail(tripId) {
  state.currentTripId = tripId;
  const trip = getTripById(tripId);
  if (!trip) { renderDashboard(); return; }

  showView('view-trip');

  tripNameDisplay.textContent  = trip.name;
  tripDestDisplay.textContent  = trip.destination || '';
  tripDatesDisplay.textContent = trip.startDate
    ? formatDate(trip.startDate) + (trip.endDate ? ' → ' + formatDate(trip.endDate) : '')
    : '';
  tripNotesDisplay.textContent = trip.notes || '';

  // Days
  daysList.innerHTML = '';
  if (trip.days.length === 0) {
    daysEmpty.classList.remove('hidden');
    daysList.classList.add('hidden');
    return;
  }

  daysEmpty.classList.add('hidden');
  daysList.classList.remove('hidden');

  trip.days.forEach(day => {
    const card = document.createElement('div');
    card.className = 'day-card';
    card.dataset.dayId = day.id;

    const activitiesHTML = day.activities.length
      ? `<ul class="activities-list">${day.activities.map(a => activityItemHTML(trip.id, day.id, a)).join('')}</ul>`
      : `<ul class="activities-list"><li style="color:var(--color-text-muted);font-size:.88rem;padding:12px 0;">No activities yet.</li></ul>`;

    card.innerHTML = `
      <div class="day-card-header">
        <div>
          <div class="day-card-title">${escHtml(day.label)}</div>
          ${day.date ? `<div class="day-card-date">${formatDate(day.date)}</div>` : ''}
        </div>
        <div class="day-card-actions">
          <button class="btn btn-ghost btn-sm" data-action="edit-day" data-day-id="${day.id}" aria-label="Edit day">✏️ Edit</button>
          <button class="btn btn-ghost btn-sm" data-action="delete-day" data-day-id="${day.id}" aria-label="Delete day">🗑️ Delete</button>
        </div>
      </div>
      ${activitiesHTML}
      <div class="day-card-add-activity">
        <button class="btn btn-outline btn-sm" data-action="add-activity" data-day-id="${day.id}">+ Add Activity</button>
      </div>`;

    daysList.appendChild(card);
  });

  // Wire day/activity events
  daysList.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = btn.dataset.action;
      const dayId  = btn.dataset.dayId;
      const actId  = btn.dataset.actId;

      if (action === 'edit-day') {
        const day = trip.days.find(d => d.id === dayId);
        openModal('Edit Day', dayFormHTML(day), (form) => {
          updateDay(trip.id, dayId, new FormData(form));
        });
      } else if (action === 'delete-day') {
        if (confirm('Delete this day and all its activities?')) {
          deleteDay(trip.id, dayId);
        }
      } else if (action === 'add-activity') {
        openModal('Add Activity', activityFormHTML(), (form) => {
          addActivity(trip.id, dayId, new FormData(form));
        });
      } else if (action === 'edit-activity') {
        const day = trip.days.find(d => d.id === dayId);
        const act = day && day.activities.find(a => a.id === actId);
        openModal('Edit Activity', activityFormHTML(act), (form) => {
          updateActivity(trip.id, dayId, actId, new FormData(form));
        });
      } else if (action === 'delete-activity') {
        if (confirm('Delete this activity?')) {
          deleteActivity(trip.id, dayId, actId);
        }
      } else if (action === 'toggle-activity') {
        toggleActivity(trip.id, dayId, actId);
      }
    });
  });
}

function activityItemHTML(tripId, dayId, a) {
  const timeStr = a.time
    ? (() => {
        const [h, m] = a.time.split(':');
        const d = new Date();
        d.setHours(Number(h), Number(m));
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      })()
    : '';

  return `
    <li class="activity-item" data-act-id="${a.id}">
      <button class="activity-check${a.done ? ' done' : ''}"
              data-action="toggle-activity"
              data-day-id="${dayId}"
              data-act-id="${a.id}"
              aria-label="${a.done ? 'Mark incomplete' : 'Mark complete'}"></button>
      <div class="activity-content">
        ${timeStr ? `<div class="activity-time">${timeStr}</div>` : ''}
        <div class="activity-title${a.done ? ' done-text' : ''}">${escHtml(a.title)}</div>
        ${a.note ? `<div class="activity-note">${escHtml(a.note)}</div>` : ''}
      </div>
      <div class="activity-actions">
        <button data-action="edit-activity" data-day-id="${dayId}" data-act-id="${a.id}" aria-label="Edit activity">✏️</button>
        <button class="del" data-action="delete-activity" data-day-id="${dayId}" data-act-id="${a.id}" aria-label="Delete activity">🗑️</button>
      </div>
    </li>`;
}

/* ---------- HTML escaping ---------- */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- Event listeners ---------- */

// New trip
document.getElementById('new-trip-btn').addEventListener('click', () => {
  openModal('New Trip', tripFormHTML(), (form) => {
    createTrip(new FormData(form));
  });
});

// Logo → dashboard
document.getElementById('logo-btn').addEventListener('click', () => {
  renderDashboard();
});

// Back to dashboard
document.getElementById('back-to-dashboard').addEventListener('click', () => {
  renderDashboard();
});

// Edit trip
document.getElementById('edit-trip-btn').addEventListener('click', () => {
  const trip = getTripById(state.currentTripId);
  if (!trip) return;
  openModal('Edit Trip', tripFormHTML(trip), (form) => {
    updateTrip(trip.id, new FormData(form));
  });
});

// Delete trip
document.getElementById('delete-trip-btn').addEventListener('click', () => {
  if (confirm('Are you sure you want to delete this trip? This cannot be undone.')) {
    deleteTrip(state.currentTripId);
  }
});

// Add day
document.getElementById('add-day-btn').addEventListener('click', () => {
  openModal('Add Day', dayFormHTML(), (form) => {
    addDay(state.currentTripId, new FormData(form));
  });
});

// Close modal
modalCloseBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// Keyboard: close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

/* ---------- Boot ---------- */
loadState();
renderDashboard();
