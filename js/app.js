/* ============================================================
   ПЛАНИРОВЩИК — app.js
   Главный модуль: состояние, рендер, обработчики событий,
   логика недель A/B, синхронизация через код
   ============================================================ */

/* ── Константы ── */
const DAYS_RU   = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const MONTHS_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const HOURS = [
  '07:00','08:00','09:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'
];
const REMIND_OPTS = [
  {v:0,  l:'Без напоминания'},
  {v:5,  l:'5 минут'},
  {v:10, l:'10 минут'},
  {v:15, l:'15 минут'},
  {v:30, l:'30 минут'},
  {v:60, l:'1 час'},
];

/* ── Состояние приложения ── */
let state = {
  weekOffset: 0,
  selectedDay: new Date(),

  // 'single' — одна неделя повторяется каждую неделю
  // 'ab'     — чередуются недели A (нечётные) и B (чётные)
  weekMode: 'single',

  // Какую неделю сейчас редактируем вручную (только в режиме AB)
  // null — определяется автоматически по текущей дате
  editingSlot: null,

  eventsA: {},   // расписание недели A / единственной недели
  eventsB: {},   // расписание недели B (используется в режиме AB)

  // Гостевое расписание (чужое, только просмотр)
  guestData: null,
  viewingGuest: false,
};

/* ── Инициализация ── */
function init() {
  state.weekMode = loadWeekMode();
  state.eventsA  = loadEvents('a');
  state.eventsB  = loadEvents('b');
  state.guestData = loadGuestData();
  if (state.guestData) state.viewingGuest = false;

  // Восстанавливаем тему
  const savedTheme = loadTheme();
  if (savedTheme) {
    document.getElementById('app').dataset.theme = savedTheme;
    document.body.dataset.theme = savedTheme;
    const map = {'':'t-blue', dark:'t-dark', pink:'t-pink'};
    document.querySelectorAll('.theme-btn').forEach(b => {
      if (b.classList.contains(map[savedTheme] || 't-blue')) b.classList.add('active');
      else b.classList.remove('active');
    });
    renderTimeLine();
    setInterval(() => {
      renderTimeLine();
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        state.selectedDay = now;
        renderAll();
      }
    }, 60000);
  }

  updateWeekModeUI();
  renderAll();
  checkNotifBanner();
  _scheduleNotifs();
}

/* ── Вспомогательные ── */

function getWeekStart(offset = 0) {
  const d   = new Date();
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

/** Возвращает ISO-номер недели */
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/** Тип недели для данного смещения */
function currentWeekType(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset * 7);
  return getISOWeek(d) % 2 === 1 ? 'a' : 'b';
}

/** Какой слот показывать для текущего weekOffset */
function activeSlot() {
  if (state.weekMode === 'single') return 'a';
  if (state.editingSlot) return state.editingSlot; // ручное переключение
  return currentWeekType(state.weekOffset);
}

/** Активные события (с учётом гостевого режима и слота) */
function activeEvents() {
  if (state.viewingGuest && state.guestData) {
    const slot = state.weekMode === 'ab' ? currentWeekType(state.weekOffset) : 'a';
    return state.guestData[slot] || state.guestData.a || {};
  }
  return activeSlot() === 'b' ? state.eventsB : state.eventsA;
}

function getDayKey(date) {
  const ws = getWeekStart(state.weekOffset);
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws); d.setDate(ws.getDate() + i);
    if (d.toDateString() === date.toDateString()) return i;
  }
  return -1;
}

function saveCurrentSlot() {
  const slot = activeSlot();
  if (slot === 'b') saveEvents('b', state.eventsB);
  else              saveEvents('a', state.eventsA);
}

function _scheduleNotifs() {
  scheduleAllNotifications(state.eventsA, state.eventsB, state.weekMode, state.weekOffset);
}

/* ── Тема ── */
function setTheme(t, btn) {
  document.getElementById('app').dataset.theme = t;
  document.body.dataset.theme = t;
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  saveTheme(t);
}

/* ── Навигация ── */
function shiftWeek(dir) {
  state.weekOffset += dir;
  state.editingSlot = null; // сбрасываем ручной выбор слота при смене недели
  renderAll();
}

/* ── Режим недели ── */
function setWeekMode(mode) {
  state.weekMode = mode;
  state.editingSlot = null;
  saveWeekMode(mode);
  updateWeekModeUI();
  renderAll();
}

function setEditingSlot(slot) {
  state.editingSlot = slot;
  updateWeekModeUI();
  renderAll();
}

function updateWeekModeUI() {
  // Таббы режима
  document.querySelectorAll('.wm-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === state.weekMode);
  });

  // Кнопки "Редактировать A / B"
  const editBtns = document.getElementById('edit-week-btns');
  if (editBtns) {
    editBtns.style.display = state.weekMode === 'ab' ? 'flex' : 'none';
  }

  // Описание
  const info = document.getElementById('week-mode-info');
  if (info) {
    if (state.weekMode === 'single') {
      info.innerHTML = '📋 <strong>Одна неделя</strong> — расписание повторяется каждую неделю автоматически.';
    } else {
      const curType = currentWeekType(state.weekOffset);
      const editing = state.editingSlot || curType;
      info.innerHTML = `📋 <strong>Чередование A/B</strong> — сейчас показана неделя <strong>${editing.toUpperCase()}</strong>.
        Нечётные недели → A, чётные → B.`;
    }
  }

  // Кнопки подсветки
  document.querySelectorAll('.edit-week-btn').forEach(b => {
    b.classList.toggle('active-ab', b.dataset.slot === (state.editingSlot || ''));
  });
}

/* ── Рендер ── */

function renderDays() {
  const ws  = getWeekStart(state.weekOffset);
  const row = document.getElementById('days-row');
  row.innerHTML = '';

  const from = new Date(ws), to = new Date(ws); to.setDate(ws.getDate() + 6);
  document.getElementById('week-label').textContent =
    `${from.getDate()} ${MONTHS_RU[from.getMonth()]} — ${to.getDate()} ${MONTHS_RU[to.getMonth()]}`;

  // Бейдж типа недели
  const badge = document.getElementById('week-type-badge');
  if (badge) {
    if (state.weekMode === 'ab') {
      const wt = state.editingSlot || currentWeekType(state.weekOffset);
      badge.textContent = `Неделя ${wt.toUpperCase()}`;
      badge.className   = `week-type-badge${wt === 'b' ? ' b' : ''}`;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  const evData = activeEvents();
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws); d.setDate(ws.getDate() + i);
    const has      = (evData[i] || []).length > 0;
    const isActive = d.toDateString() === state.selectedDay.toDateString();
    const div = document.createElement('div');
    const isToday = d.toDateString() === new Date().toDateString();
    div.className = 'day-tab' + (isActive ? ' active' : '') + (isToday && !isActive ? ' today' : '');
    div.innerHTML = `
      <div class="day-name">${DAYS_RU[d.getDay()]}</div>
      <div class="day-num">${d.getDate()}</div>
      <div class="day-dot${has ? '' : ' hidden'}"></div>`;
    div.onclick = () => { state.selectedDay = d; renderAll(); };
    row.appendChild(div);
  }
}

function renderTimeline() {
  const key       = getDayKey(state.selectedDay);
  const evData    = activeEvents();
  const dayEvents = key >= 0 ? (evData[key] || []) : [];
  const d         = state.selectedDay;
  const isGuest   = state.viewingGuest;

  document.getElementById('tl-title').textContent =
    `${DAYS_RU[d.getDay()]}, ${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;

  const rdBadge = document.getElementById('readonly-badge');
  if (rdBadge) rdBadge.style.display = isGuest ? '' : 'none';

  const body = document.getElementById('timeline-body');
  body.innerHTML = '';
  let hasAny = false;

  HOURS.forEach(h => {
    const matched = dayEvents.filter(e => e.time === h);
    if (matched.length) hasAny = true;

    const row   = document.createElement('div'); row.className   = 'hour-row';
    const lbl   = document.createElement('div'); lbl.className   = 'hour-label'; lbl.textContent = h;
    const evDiv = document.createElement('div'); evDiv.className = 'hour-events';

    matched.forEach(ev => {
      const idx     = dayEvents.indexOf(ev);
      const hasNote = ev.note && ev.note.trim();
      const wrap    = document.createElement('div'); wrap.className = 'event-wrap';

      /* ── Пилюля ── */
      const pill = document.createElement('div'); pill.className = 'event-pill ' + ev.type;
      pill.onclick = () => { wrap.classList.toggle('open'); if (wrap.classList.contains('open')) ta.focus(); };

      const dot    = document.createElement('span'); dot.className = 'edot';
      const tspan  = document.createElement('span'); tspan.className = 'pill-title'; tspan.textContent = ev.title;
      const badge  = document.createElement('span'); badge.className = 'pill-note-badge';
      badge.textContent = hasNote ? '📝' : '';
      const rbadge = document.createElement('span'); rbadge.className = 'pill-remind-badge';
      rbadge.textContent = ev.remind ? '🔔' : '';

      const acts = document.createElement('span'); acts.className = 'pill-actions';
      const arr  = document.createElement('span'); arr.className  = 'pill-arrow'; arr.textContent = '▶';

      pill.appendChild(dot); pill.appendChild(tspan);
      pill.appendChild(badge); pill.appendChild(rbadge);
      pill.appendChild(acts);

      if (!isGuest) {
        const del = document.createElement('span'); del.className = 'pill-del'; del.textContent = '×';
        del.title = 'Удалить';
        del.onclick = e => { e.stopPropagation(); delEvent(key, idx); };
        acts.appendChild(arr); acts.appendChild(del);
      } else {
        acts.appendChild(arr);
      }

      /* ── Панель заметок ── */
      const panel = document.createElement('div'); panel.className = 'notes-panel';
      const inner = document.createElement('div'); inner.className = 'notes-inner ' + ev.type;

      const nlabel = document.createElement('div'); nlabel.className = 'notes-label';
      nlabel.textContent = '📝 Заметка';

      const ta = document.createElement('textarea'); ta.className = 'notes-ta';
      ta.placeholder = 'Добавь детали, страницы, ссылки...';
      ta.rows = 3;
      ta.onclick = e => e.stopPropagation();

// Загружаем заметку по дате
      const ws = getWeekStart(state.weekOffset);
      const dayDate = new Date(ws); dayDate.setDate(ws.getDate() + key);
      const savedNote = loadNote(dayDate, ev.title);
      ta.value = savedNote.text || '';

// Список прикреплённых файлов
      const fileList = document.createElement('div'); fileList.className = 'notes-files';
      function renderFileList(files) {
        fileList.innerHTML = '';
        (files || []).forEach((f, fi) => {
          const item = document.createElement('div'); item.className = 'notes-file-item';
          const isImage = f.type && f.type.startsWith('image/');
          if (isImage) {
            const img = document.createElement('img');
            img.src = f.data;
            img.className = 'notes-file-preview';
            img.onclick = e => { e.stopPropagation(); openLightbox(f.data); };
            item.appendChild(img);
          }
          else {
            const icon = document.createElement('span'); icon.textContent = '📄 ';
            item.appendChild(icon);
          }
          const name = document.createElement('span'); name.className = 'notes-file-name';
          name.textContent = f.name;
          const dl = document.createElement('a'); dl.href = f.data; dl.download = f.name;
          dl.textContent = '⬇'; dl.className = 'notes-file-dl';
          dl.onclick = e => e.stopPropagation();
          const rm = document.createElement('span'); rm.textContent = '×'; rm.className = 'notes-file-rm';
          rm.onclick = e => {
            e.stopPropagation();
            const cur = loadNote(dayDate, ev.title);
            cur.files.splice(fi, 1);
            saveNote(dayDate, ev.title, ta.value, cur.files);
            renderFileList(cur.files);
          };
          item.appendChild(name); item.appendChild(dl); item.appendChild(rm);
          fileList.appendChild(item);
        });
      }
      renderFileList(savedNote.files);

      if (!isGuest) {
        const nrow = document.createElement('div'); nrow.className = 'notes-row';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'notes-save ' + ev.type;
        saveBtn.textContent = '💾 Сохранить';
        saveBtn.onclick = e => {
          e.stopPropagation();
          const cur = loadNote(dayDate, ev.title);
          saveNote(dayDate, ev.title, ta.value.trim(), cur.files);
          showToast('Заметка сохранена ✓');
          renderTimeline();
        };

        // Кнопка прикрепить файл
        const fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = 'image/*,.pdf,.doc,.docx,.txt';
        fileInput.style.display = 'none';
        fileInput.onchange = e => {
          const file = e.target.files[0]; if (!file) return;
          if (file.size > 10 * 1024 * 1024) { showToast('Файл больше 10MB ❌'); return; }
          const reader = new FileReader();
          reader.onload = re => {
            const cur = loadNote(dayDate, ev.title);
            cur.files.push({ name: file.name, type: file.type, data: re.target.result });
            saveNote(dayDate, ev.title, ta.value, cur.files);
            renderFileList(cur.files);
            showToast('Файл прикреплён ✓');
          };
          reader.readAsDataURL(file);
        };

        const attachBtn = document.createElement('button');
        attachBtn.className = 'notes-save ' + ev.type;
        attachBtn.textContent = '📎 Файл';
        attachBtn.style.marginLeft = '6px';
        attachBtn.onclick = e => { e.stopPropagation(); fileInput.click(); };

        const notifSpan = document.createElement('span'); notifSpan.className = 'notif-inline';
        notifSpan.textContent = '🔔';
        const rsel = document.createElement('select');
        REMIND_OPTS.forEach(o => {
          const opt = document.createElement('option');
          opt.value = o.v; opt.textContent = o.l;
          if (o.v === (ev.remind || 0)) opt.selected = true;
          rsel.appendChild(opt);
        });
        rsel.onchange = e => {
          e.stopPropagation();
          const val = parseInt(rsel.value);
          evData[key][idx].remind = val;
          saveCurrentSlot();
          if (val > 0 && Notification.permission !== 'granted') {
            showToast('Разреши уведомления 🔔'); requestNotifPermission();
          } else {
            showToast(val > 0 ? `Напомним за ${val} мин 🔔` : 'Напоминание снято');
            _scheduleNotifs();
          }
        };
        notifSpan.appendChild(rsel);

        nrow.appendChild(saveBtn);
        nrow.appendChild(attachBtn);
        nrow.appendChild(fileInput);
        nrow.appendChild(notifSpan);
        inner.appendChild(nlabel);
        inner.appendChild(ta);
        inner.appendChild(fileList);
        inner.appendChild(nrow);
      } else {
        inner.appendChild(nlabel);
        inner.appendChild(ta);
        inner.appendChild(fileList);
      }

      inner.appendChild(nlabel);
      inner.appendChild(ta);

      if (!isGuest) {
        const nrow   = document.createElement('div'); nrow.className = 'notes-row';
        const saveBtn = document.createElement('button');
        saveBtn.className   = 'notes-save ' + ev.type;
        saveBtn.textContent = '💾 Сохранить';
        saveBtn.onclick = e => {
          e.stopPropagation();
          evData[key][idx].note = ta.value.trim();
          saveCurrentSlot();
          showToast('Заметка сохранена ✓');
          renderTimeline();
        };

        const notifSpan = document.createElement('span'); notifSpan.className = 'notif-inline';
        notifSpan.textContent = '🔔 Напомнить:';
        const rsel = document.createElement('select');
        REMIND_OPTS.forEach(o => {
          const opt = document.createElement('option');
          opt.value = o.v; opt.textContent = o.l;
          if (o.v === (ev.remind || 0)) opt.selected = true;
          rsel.appendChild(opt);
        });
        rsel.onchange = e => {
          e.stopPropagation();
          const val = parseInt(rsel.value);
          evData[key][idx].remind = val;
          saveCurrentSlot();
          if (val > 0 && Notification.permission !== 'granted') {
            showToast('Разреши уведомления 🔔'); requestNotifPermission();
          } else {
            showToast(val > 0 ? `Напомним за ${val} мин 🔔` : 'Напоминание снято');
            _scheduleNotifs();
          }
        };
        notifSpan.appendChild(rsel);
        nrow.appendChild(saveBtn); nrow.appendChild(notifSpan);
        inner.appendChild(nrow);
      }

      panel.appendChild(inner);
      wrap.appendChild(pill); wrap.appendChild(panel);
      evDiv.appendChild(wrap);
    });

    row.appendChild(lbl); row.appendChild(evDiv);
    body.appendChild(row);
  });

  if (!hasAny) {
    const es = document.createElement('div'); es.className = 'empty-state';
    es.innerHTML = '<div class="empty-icon">🗓️</div><div>На этот день нет записей</div>';
    body.appendChild(es);
  }
}

function renderStats() {
  let hw = 0, ev = 0, ot = 0;
  const src = state.viewingGuest ? (state.guestData || {}) : { a: state.eventsA, b: state.eventsB };
  const toCount = state.viewingGuest
    ? Object.values(state.guestData?.a || {}).concat(Object.values(state.guestData?.b || {}))
    : Object.values(state.eventsA).concat(Object.values(state.eventsB));
  toCount.flat().forEach(e => {
    if (e.type === 'hw') hw++; else if (e.type === 'ev') ev++; else ot++;
  });
  document.getElementById('s-hw').textContent    = hw;
  document.getElementById('s-ev').textContent    = ev;
  document.getElementById('s-ot').textContent    = ot;
  document.getElementById('s-total').textContent = hw + ev + ot;
}

function renderUpcoming() {
  const ul   = document.getElementById('upcoming'); ul.innerHTML = '';
  const ws   = getWeekStart(state.weekOffset);
  const evDa = activeEvents();
  let items  = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(ws); d.setDate(ws.getDate() + i);
    (evDa[i] || []).forEach(e => items.push({...e, date: d}));
  }
  items.sort((a, b) => a.time.localeCompare(b.time));
  items.slice(0, 5).forEach(item => {
    const div  = document.createElement('div'); div.className = 'upcoming-item';
    const dot  = document.createElement('div'); dot.className = 'legend-dot ' + item.type;
    const name = document.createElement('span'); name.className = 'ev-name'; name.textContent = item.title;
    const t    = document.createElement('span'); t.className = 'ev-time';
    t.textContent = `${DAYS_RU[item.date.getDay()]} ${item.time}`;
    div.appendChild(dot); div.appendChild(name); div.appendChild(t);
    ul.appendChild(div);
  });
  if (!items.length) {
    ul.innerHTML = '<div style="font-size:13px;color:var(--muted);text-align:center;padding:8px 0">Нет записей</div>';
  }
}

function renderGuestBanner() {
  const banner = document.getElementById('view-banner');
  if (!banner) return;
  if (state.guestData && state.viewingGuest) {
    banner.classList.add('visible');
    banner.querySelector('.guest-name').textContent =
      state.guestData.ownerName || 'чужое расписание';
  } else {
    banner.classList.remove('visible');
  }
}

function renderSyncPanel() {
  const codeEl = document.getElementById('my-export-code');
  if (!codeEl) return;
  const code = exportCode(state.eventsA, state.eventsB, state.weekMode);
  codeEl.textContent = code;
}

function renderAll() {
  renderDays();
  renderTimeline();
  renderStats();
  renderUpcoming();
  renderGuestBanner();
  renderSyncPanel();
}

function openLightbox(src) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.onclick = () => overlay.remove();
  const img = document.createElement('img');
  img.src = src; img.className = 'lightbox-img';
  img.onclick = e => e.stopPropagation();
  const close = document.createElement('div');
  close.className = 'lightbox-close'; close.textContent = '×';
  close.onclick = () => overlay.remove();
  overlay.appendChild(img);
  overlay.appendChild(close);
  document.body.appendChild(overlay);
}
function renderTimeLine() {
  document.querySelectorAll('.time-line').forEach(el => el.remove());
  const todayKey = getDayKey(new Date());
  const key = getDayKey(state.selectedDay);
  if (key !== todayKey) return;
  const now = new Date();
  const hours = now.getHours(), mins = now.getMinutes();
  if (hours < 7 || hours >= 21) return;
  const body = document.getElementById('timeline-body');
  const rows = body.querySelectorAll('.hour-row');
  if (!rows.length) return;
  const rowH = rows[0].offsetHeight;
  const top = ((hours - 7) * 60 + mins) / 60 * rowH + 8;
  const line = document.createElement('div');
  line.className = 'time-line';
  line.style.top = top + 'px';
  body.appendChild(line);
}
/* ── CRUD событий ── */

function addEvent() {
  if (state.viewingGuest) { showToast('Вы в режиме просмотра'); return; }
  const title  = document.getElementById('f-title').value.trim();
  const time   = document.getElementById('f-time').value;
  const type   = document.getElementById('f-type').value;
  const note   = document.getElementById('f-note').value.trim();
  const remind = parseInt(document.getElementById('f-remind').value) || 0;
  if (!title) { showToast('Введите название!'); return; }
  const key = getDayKey(state.selectedDay);
  if (key < 0) { showToast('Выберите день на текущей неделе'); return; }

  const evData = activeSlot() === 'b' ? state.eventsB : state.eventsA;
  if (!evData[key]) evData[key] = [];
  evData[key].push({title, time, type, note, remind});
  evData[key].sort((a, b) => a.time.localeCompare(b.time));

  document.getElementById('f-title').value  = '';
  document.getElementById('f-note').value   = '';
  document.getElementById('f-remind').value = '0';

  saveCurrentSlot();
  if (remind > 0 && Notification.permission !== 'granted') {
    showToast('Добавлено! Разреши уведомления.'); requestNotifPermission();
  } else {
    showToast('Запись добавлена ✓');
  }
  _scheduleNotifs(); renderAll();
}

function delEvent(key, idx) {
  if (state.viewingGuest) return;
  const evData = activeSlot() === 'b' ? state.eventsB : state.eventsA;
  if (key >= 0 && evData[key]) {
    evData[key].splice(idx, 1);
    saveCurrentSlot(); _scheduleNotifs();
    showToast('Запись удалена'); renderAll();
  }
}

/* ── Синхронизация ── */

function copyMyCode() {
  const code = exportCode(state.eventsA, state.eventsB, state.weekMode);
  navigator.clipboard.writeText(code)
    .then(() => showToast('Код скопирован! Отправь другу 📋'))
    .catch(() => showToast('Не удалось скопировать — выдели код вручную'));
}

function loadGuestCode() {
  const input = document.getElementById('guest-code-input');
  const code  = input ? input.value.trim() : '';
  if (!code) { showToast('Вставь код расписания'); return; }
  const data = importCode(code);
  if (!data) { showToast('Неверный код ❌'); return; }
  state.guestData = data;
  saveGuestData(data);
  switchToGuest();
  showToast('Расписание загружено ✓');
  if (input) input.value = '';
}

function switchToGuest() {
  state.viewingGuest = true;
  renderAll();
}

function switchToMine() {
  state.viewingGuest = false;
  renderAll();
}

function clearGuest() {
  state.guestData    = null;
  state.viewingGuest = false;
  clearGuestData();
  renderAll();
  showToast('Чужое расписание удалено');
}

/* ── Toast ── */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
function clearSchedule() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.5);
    z-index:9999;display:flex;align-items:center;justify-content:center;
  `;
  modal.innerHTML = `
    <div style="background:var(--card);border-radius:16px;padding:28px;max-width:340px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <div style="font-size:36px;margin-bottom:12px">🗑</div>
      <div style="font-size:17px;font-weight:700;margin-bottom:8px;color:var(--text)">Удалить расписание?</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:24px">
        Все события, заметки и прикреплённые файлы будут удалены. Это действие нельзя отменить.
      </div>
      <div style="display:flex;gap:10px">
        <button id="modal-cancel" style="flex:1;padding:10px;border-radius:9px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">
          Отмена
        </button>
        <button id="modal-confirm" style="flex:1;padding:10px;border-radius:9px;border:none;background:#ef4444;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">
          Удалить
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('modal-cancel').onclick  = () => modal.remove();
  document.getElementById('modal-confirm').onclick = () => {
    localStorage.clear();
    state.eventsA = { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] };
    state.eventsB = { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] };
    state.guestData    = null;
    state.viewingGuest = false;
    modal.remove();
    showToast('Расписание удалено');
    renderAll();
  };
}
/* ── Слушатели ── */
document.addEventListener('DOMContentLoaded', () => {
  init();
  document.getElementById('f-title')
    .addEventListener('keydown', e => { if (e.key === 'Enter') addEvent(); });
});
