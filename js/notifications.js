/* ============================================================
   ПЛАНИРОВЩИК — notifications.js
   Браузерные уведомления, планировщик таймеров
   Для подключения к серверу — заменить scheduleAll() на
   вызов Service Worker (см. комментарий внизу файла)
   ============================================================ */

let _notifTimers = [];

/** Проверяет состояние разрешения и показывает баннер */
function checkNotifBanner() {
  if (!('Notification' in window)) return;
  const btn = document.getElementById('notif-btn');
  if (Notification.permission === 'default') {
    document.getElementById('notif-banner').classList.add('visible');
  }
  if (Notification.permission === 'granted') {
    _markGranted(btn);
  }
}

/** Запрашивает разрешение пользователя */
function requestNotifPermission() {
  if (!('Notification' in window)) {
    showToast('Браузер не поддерживает уведомления');
    return;
  }
  Notification.requestPermission().then(perm => {
    const btn = document.getElementById('notif-btn');
    if (perm === 'granted') {
      _markGranted(btn);
      document.getElementById('notif-banner').classList.remove('visible');
      showToast('Уведомления включены ✓');
      scheduleAllNotifications();
    } else {
      showToast('Уведомления не разрешены браузером');
    }
  });
}

function _markGranted(btn) {
  if (!btn) return;
  btn.classList.add('granted');
  btn.textContent = '🔔 Уведомления вкл';
}

/**
 * Планирует уведомления для всех событий на неделе.
 * Вызывается после каждого изменения расписания.
 *
 * TODO (подключение к серверу):
 *   Вместо setTimeout использовать Push API + Service Worker.
 *   Пример:
 *     navigator.serviceWorker.ready.then(reg => {
 *       reg.pushManager.subscribe({ ... });
 *     });
 *   Сервер отправляет Web Push в нужный момент — работает
 *   даже когда браузер закрыт.
 */
function scheduleAllNotifications(eventsA, eventsB, weekMode, weekOffset) {
  _notifTimers.forEach(t => clearTimeout(t));
  _notifTimers = [];

  if (Notification.permission !== 'granted') return;

  // Планируем для обеих недель (A и B)
  const slotsToCheck = weekMode === 'ab' ? ['a', 'b'] : ['a'];

  slotsToCheck.forEach(slot => {
    const eventsData = slot === 'a' ? eventsA : eventsB;
    _scheduleForSlot(eventsData, slot, weekMode, weekOffset);
  });
}

function _scheduleForSlot(eventsData, slot, weekMode, weekOffset) {
  // Ищем ближайшую неделю этого типа
  for (let wOff = -1; wOff <= 8; wOff++) {
    const ws = getWeekStart(wOff);
    const wType = currentWeekType(wOff);
    if (weekMode === 'ab' && wType !== slot) continue;

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(ws); dayDate.setDate(ws.getDate() + i);
      const dayEvents = eventsData[i] || [];

      dayEvents.forEach(ev => {
        if (!ev.remind) return;
        const [h, m] = ev.time.split(':').map(Number);
        const evTime = new Date(dayDate); evTime.setHours(h, m, 0, 0);
        const notifTime = new Date(evTime.getTime() - ev.remind * 60000);
        const ms = notifTime - Date.now();

        if (ms > 0 && ms < 14 * 86400000) {
          const tid = setTimeout(() => {
            const n = new Notification('📅 Планировщик', {
              body: `Через ${ev.remind} мин: ${ev.title} (${ev.time})`
            });
            setTimeout(() => n.close(), 12000);
          }, ms);
          _notifTimers.push(tid);
        }
      });
    }
  }
}
