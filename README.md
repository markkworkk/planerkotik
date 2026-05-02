# 📅 Планировщик — расписание и ДЗ

Веб-приложение для ведения расписания с поддержкой домашних заданий,
заметок, уведомлений и обмена расписаниями.

---

## 📁 Структура проекта

```
planner/
├── index.html          ← главная страница
├── css/
│   ├── main.css        ← темы, layout, шапка, навигация
│   ├── timeline.css    ← таймлайн и карточки событий
│   └── sidebar.css     ← боковая панель, форма, синхронизация
├── js/
│   ├── storage.js      ← localStorage: сохранение/загрузка данных
│   ├── notifications.js← браузерные уведомления
│   └── app.js          ← главная логика, рендер, обработчики
└── README.md
```

---

## 🚀 Как выложить на GitHub Pages

### 1. Создай репозиторий
- Зайди на [github.com](https://github.com) → New repository
- Имя: `planner` (или любое другое)
- Публичный (Public)
- Нажми **Create repository**

### 2. Загрузи файлы
```bash
# Инициализируй git в папке проекта
cd planner
git init
git add .
git commit -m "Initial commit"

# Подключи репозиторий (замени YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/planner.git
git branch -M main
git push -u origin main
```

### 3. Включи GitHub Pages
- В репозитории → **Settings** → **Pages**
- Source: **Deploy from a branch**
- Branch: `main` / `/ (root)`
- Нажми **Save**

Через 1–2 минуты сайт будет доступен по адресу:
```
https://YOUR_USERNAME.github.io/planner/
```

---

## 🔔 Уведомления

Сейчас уведомления работают через браузерный `setTimeout` — они приходят
только пока вкладка открыта.

### Как сделать уведомления в любое время (через сервер)

Нужны два компонента:

#### A) Service Worker (файл `sw.js` в корне проекта)
```javascript
self.addEventListener('push', event => {
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon.png'
  });
});
```

#### B) Регистрация в `js/notifications.js`
Найди функцию `scheduleAllNotifications()` и замени `setTimeout` на:
```javascript
// Регистрируем Service Worker
navigator.serviceWorker.register('/sw.js').then(reg => {
  // Подписываемся на Push
  reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: 'ВАШ_VAPID_PUBLIC_KEY'
  }).then(subscription => {
    // Отправляем подписку на сервер
    fetch('/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription, events: eventsData }),
      headers: { 'Content-Type': 'application/json' }
    });
  });
});
```

#### C) Бэкенд (Node.js пример)
```javascript
const webpush = require('web-push');

webpush.setVapidDetails(
  'mailto:you@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

app.post('/api/subscribe', async (req, res) => {
  const { subscription, events } = req.body;
  // Сохрани subscription в базу данных
  // Запланируй отправку уведомления через node-schedule или cron
  await scheduleNotifications(subscription, events);
  res.json({ ok: true });
});
```

Бесплатный хостинг для бэкенда: [Railway](https://railway.app), [Render](https://render.com)

---

## 🔗 Синхронизация расписаний

Сейчас работает через **код-строку** (base64 JSON):
1. Нажми "Скопировать мой код" → отправь другу в мессенджере
2. Друг вставляет код в поле "Вставь код друга" → видит твоё расписание

### Как сделать живую синхронизацию (автообновление)

Используй [Firebase Realtime Database](https://firebase.google.com) (бесплатно):

```javascript
// js/sync.js
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue } from 'firebase/database';

const app = initializeApp({ /* твой firebase config */ });
const db  = getDatabase(app);

// Сохранить расписание
export function syncSave(userId, eventsA, eventsB, mode) {
  set(ref(db, `schedules/${userId}`), { a: eventsA, b: eventsB, mode });
}

// Подписаться на чужое расписание по ID
export function syncWatch(userId, callback) {
  onValue(ref(db, `schedules/${userId}`), snap => callback(snap.val()));
}
```

Тогда вместо кода достаточно передать другу свой `userId` — и расписание
будет обновляться в реальном времени.

---

## ✨ Возможности

| Функция | Статус |
|---|---|
| 3 темы (голубая / тёмная / розовая) | ✅ |
| Сохранение в localStorage | ✅ |
| Режим одной недели (повтор каждую неделю) | ✅ |
| Режим двух недель A/B (чётная/нечётная) | ✅ |
| Раскрывающиеся заметки к событиям | ✅ |
| Браузерные уведомления (пока вкладка открыта) | ✅ |
| Обмен расписанием через код | ✅ |
| Просмотр чужого расписания | ✅ |
| Push-уведомления (нужен сервер) | 🔧 готово к подключению |
| Живая синхронизация через Firebase | 🔧 готово к подключению |
