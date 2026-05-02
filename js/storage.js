/* ============================================================
   ПЛАНИРОВЩИК — storage.js
   Работа с localStorage: сохранение/загрузка расписания,
   темы, режима недели, настроек
   ============================================================ */

const STORAGE_KEYS = {
  EVENTS_A:   'planner_events_a',   // расписание недели A (нечётная)
  EVENTS_B:   'planner_events_b',   // расписание недели B (чётная)
  WEEK_MODE:  'planner_week_mode',  // 'single' | 'ab'
  THEME:      'planner_theme',
  GUEST_DATA: 'planner_guest',      // временно загруженное чужое расписание
};

/** Возвращает номер ISO-недели для даты */
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/** Определяет тип текущей недели: 'a' (нечётная) или 'b' (чётная) */
function currentWeekType(weekOffset = 0) {
  const now = new Date();
  now.setDate(now.getDate() + weekOffset * 7);
  return getISOWeek(now) % 2 === 1 ? 'a' : 'b';
}

/* ── Расписание ── */

function loadEvents(slot) {
  const key = slot === 'b' ? STORAGE_KEYS.EVENTS_B : STORAGE_KEYS.EVENTS_A;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : getDefaultEvents(slot);
  } catch { return getDefaultEvents(slot); }
}

function saveEvents(slot, data) {
  const key = slot === 'b' ? STORAGE_KEYS.EVENTS_B : STORAGE_KEYS.EVENTS_A;
  localStorage.setItem(key, JSON.stringify(data));
}

/** Пример данных при первом запуске */
function getDefaultEvents(slot) {
  return { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] };
}

/* ── Режим недели ── */

function loadWeekMode() {
  return localStorage.getItem(STORAGE_KEYS.WEEK_MODE) || 'single';
}

function saveWeekMode(mode) {
  localStorage.setItem(STORAGE_KEYS.WEEK_MODE, mode);
}

/* ── Тема ── */

function loadTheme() {
  return localStorage.getItem(STORAGE_KEYS.THEME) || '';
}

function saveTheme(theme) {
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
}

/* ── Синхронизация: экспорт / импорт ── */

/**
 * Сжимает расписание в строку-код для передачи другому пользователю.
 * Формат: base64(JSON({a, b, mode}))
 */
function exportCode(eventsA, eventsB, mode) {
  const payload = { a: eventsA, b: eventsB, mode };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

/**
 * Разбирает код, полученный от другого пользователя.
 * Возвращает { a, b, mode } или null при ошибке.
 */
function importCode(code) {
  try {
    const json = decodeURIComponent(escape(atob(code.trim())));
    const data = JSON.parse(json);
    if (!data.a) return null;
    return data;
  } catch { return null; }
}

/* ── Гостевые данные ── */

function saveGuestData(data) {
  localStorage.setItem(STORAGE_KEYS.GUEST_DATA, JSON.stringify(data));
}

function loadGuestData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.GUEST_DATA);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearGuestData() {
  localStorage.removeItem(STORAGE_KEYS.GUEST_DATA);
}


/* ── Заметки по датам (не повторяются с расписанием) ── */

/**
 * Ключ заметки: дата + название события
 * Например: "note_2026-01-28_Алгебра"
 */
function noteKey(date, eventTitle) {
  const d = new Date(date);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return `note_${dateStr}_${eventTitle}`;
}

function loadNote(date, eventTitle) {
  try {
    const raw = localStorage.getItem(noteKey(date, eventTitle));
    return raw ? JSON.parse(raw) : { text: '', files: [] };
  } catch { return { text: '', files: [] }; }
}

function saveNote(date, eventTitle, text, files) {
  const data = { text, files: files || [] };
  localStorage.setItem(noteKey(date, eventTitle), JSON.stringify(data));
}

function deleteNote(date, eventTitle) {
  localStorage.removeItem(noteKey(date, eventTitle));
}