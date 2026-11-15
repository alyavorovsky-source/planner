/* Мой планер — единый слой данных (localStorage).
   Ключи localStorage начинаются с «dailyflow.» — это внутренние имена, их менять нельзя: иначе пропадут сохранённые данные. */
(function (global) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const LS_KEY = 'dailyflow.data.v1';
  const LS_REMINDED = 'dailyflow.reminded.v1';

  const DEFAULT_CATEGORIES = [
    { id: 'work', name: 'Работа', color: '#4585f5' },
    { id: 'personal', name: 'Личное', color: '#e07ab8' },
    { id: 'home', name: 'Дом', color: '#4aa8c9' },
    { id: 'study', name: 'Учёба', color: '#e0a458' },
    { id: 'health', name: 'Здоровье', color: '#5cb98a' },
    { id: 'shopping', name: 'Покупки', color: '#d98c5f' },
    { id: 'other', name: 'Другое', color: '#8b949e' }
  ];

  /* Статусы задач. «Выполнена» связана с флагом t.done (галочка в карточке),
     остальные статусы хранятся в t.status. */
  const STATUSES = [
    { id: 'new', label: 'Новая' },
    { id: 'active', label: 'В работе' },
    { id: 'paused', label: 'Приостановлено' },
    { id: 'blocked', label: 'Заблокировано' },
    { id: 'postponed', label: 'Отложена' },
    { id: 'done', label: 'Выполнена' },
    { id: 'cancelled', label: 'Отменена' }
  ];
  const OPEN_STATUS = STATUSES.map(function (x) { return x.id; }).filter(function (id) { return id !== 'done'; });

  const DEFAULT_SETTINGS = {
    theme: 'dark',
    firstDay: 1,            // 1 = понедельник, 0 = воскресенье
    timeFormat: 24,         // 12 | 24
    workStart: '09:00',
    workEnd: '18:00',
    notifications: false,
    autoArchiveDays: 7,     // предлагать архивировать завершённые старше N дней (0 = выкл.)
    defaultSort: 'time'
  };

  const Store = {
    data: null,
    _warnedStorage: false,

    /* ==================== Загрузка / сохранение ==================== */
    load() {
      let raw = null;
      try {
        raw = localStorage.getItem(LS_KEY);
      } catch (e) {
        this._storageError('Не удалось прочитать данные из localStorage');
        raw = null;
      }
      let parsed = null;
      if (raw) {
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      }
      this.data = parsed && typeof parsed === 'object' ? this._migrate(parsed) : this._seed();
      this._sanitize(this.data);
      return this.data;
    },

    save() {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(this.data));
        return true;
      } catch (e) {
        this._storageError('Не удалось сохранить данные. Возможно, хранилище переполнено.');
        return false;
      }
    },

    _storageError(msg) {
      if (global.App && App.toast) App.toast(msg, 'error');
      else if (!this._warnedStorage) { console.error(msg); this._warnedStorage = true; }
    },

    _seed() {
      return {
        version: SCHEMA_VERSION,
        tasks: [],
        categories: DEFAULT_CATEGORIES.map(function (c) { return Object.assign({}, c); }),
        habits: [],
        settings: Object.assign({}, DEFAULT_SETTINGS),
        ui: { lastView: 'tasks', upcomingMode: 'list', calMode: 'month', allPage: 1, allPerPage: 25 }
      };
    },

    _migrate(d) {
      const v = typeof d.version === 'number' ? d.version : 0;
      if (v < 1) {
        d.version = 1;
      }
      // будущие миграции: if (v < 2) { ... d.version = 2; }
      if (!d.ui) d.ui = { lastView: 'tasks', upcomingMode: 'list', calMode: 'month', allPage: 1, allPerPage: 25 };
      return d;
    },

    /* Приводим данные к безопасному виду, отбрасывая мусор */
    /* Однократно заменяем прежние фиолетовые цвета по умолчанию (категории и привычки) на новую палитру.
       Цвета, выбранные вручную, не трогаем. */
    _migratePalette(d) {
      if (!d.ui || typeof d.ui !== 'object') d.ui = {};
      if (d.ui.paletteV2) return;
      const map = { '#7c6cf0': '#4585f5', '#c9a0dc': '#d98c5f', '#8b90a8': '#8b949e' };
      const fix = function (x) {
        if (!x || typeof x.color !== 'string') return;
        const to = map[x.color.toLowerCase()];
        if (to) x.color = to;
      };
      (Array.isArray(d.categories) ? d.categories : []).forEach(fix);
      (Array.isArray(d.habits) ? d.habits : []).forEach(fix);
      d.ui.paletteV2 = true;
    },

    _sanitize(d) {
      if (!Array.isArray(d.tasks)) d.tasks = [];
      if (!Array.isArray(d.categories) || !d.categories.length) d.categories = DEFAULT_CATEGORIES.map(function (c) { return Object.assign({}, c); });
      if (!Array.isArray(d.habits)) d.habits = [];
      d.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
      this._migratePalette(d);
      const catIds = {};
      d.categories.forEach(function (c) { catIds[c.id] = true; });
      d.tasks = d.tasks.filter(function (t) {
        return t && typeof t === 'object' && typeof t.id === 'string' && typeof t.title === 'string' && U.parseDateKey(t.date) !== null;
      });
      d.tasks.forEach(function (t) {
        /* статус «Выполнена», сохранённый в старых данных, превращаем в выполненную задачу */
        if (t.status === 'done' && !t.done) { t.done = true; t.doneAt = typeof t.updatedAt === 'number' ? t.updatedAt : Date.now(); }
        t.status = Store.normStatus(t.status);
        t.done = !!t.done;
        t.archived = !!t.archived;
        t.isMain = !!t.isMain;
        t.priority = ['low', 'medium', 'high'].indexOf(t.priority) >= 0 ? t.priority : 'medium';
        t.repeat = ['none', 'daily', 'weekdays', 'weekly', 'monthly'].indexOf(t.repeat) >= 0 ? t.repeat : 'none';
        if (!U.isValidTime(t.timeStart || '')) t.timeStart = '';
        if (!U.isValidTime(t.timeEnd || '')) t.timeEnd = '';
        if (!U.isValidTime(t.remindAt || '')) t.remindAt = '';
        if (!t.remind) t.remind = 'none';
        if (t.remind !== 'none' && !U.isValidTime(t.remindAt || '')) t.remind = 'none';
        if (!catIds[t.categoryId]) t.categoryId = 'other';
        if (typeof t.createdAt !== 'number') t.createdAt = Date.now();
      });
      d.habits = d.habits.filter(function (h) {
        return h && typeof h === 'object' && typeof h.id === 'string' && typeof h.name === 'string';
      });
      d.habits.forEach(function (h) {
        h.freq = ['daily', 'weekdays', 'weekends'].indexOf(h.freq) >= 0 ? h.freq : 'daily';
        if (!h.completions || typeof h.completions !== 'object') h.completions = {};
      });
    },

    storageSize() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? new Blob([raw]).size : 0;
      } catch (e) { return 0; }
    },

    /* ==================== Настройки ==================== */
    settings() { return this.data.settings; },

    setSetting(key, value) {
      this.data.settings[key] = value;
      this.save();
    },

    /* ==================== Категории ==================== */
    categories() { return this.data.categories; },
    category(id) {
      return this.data.categories.find(function (c) { return c.id === id; }) ||
             this.data.categories.find(function (c) { return c.id === 'other'; }) ||
             this.data.categories[0];
    },
    addCategory(name, color) {
      const id = U.uid();
      this.data.categories.push({ id: id, name: name, color: color || '#8b949e' });
      this.save();
      return this.data.categories[this.data.categories.length - 1];
    },
    updateCategory(id, name, color) {
      const c = this.category(id);
      if (c) { if (name != null) c.name = name; if (color) c.color = color; this.save(); }
    },
    deleteCategory(id) {
      this.data.categories = this.data.categories.filter(function (c) { return c.id !== id; });
      const fallback = this.data.categories[0] ? this.data.categories[0].id : 'other';
      this.data.tasks.forEach(function (t) { if (t.categoryId === id) t.categoryId = fallback; });
      this.save();
    },

    /* ==================== Статусы ==================== */
    STATUSES: STATUSES,

    /* Допустимый «открытый» статус (не «Выполнена»), иначе «Новая» */
    normStatus(s) { return OPEN_STATUS.indexOf(s) >= 0 ? s : 'new'; },

    statusLabel(id) {
      const x = STATUSES.find(function (v) { return v.id === id; });
      return x ? x.label : 'Новая';
    },

    /* Итоговый статус задачи: выполненная всегда «Выполнена» */
    statusOf(t) { return t.done ? 'done' : this.normStatus(t.status); },

    /* Смена статуса. «Выполнена» делает то же, что галочка (с логикой повторов). */
    setStatus(id, status) {
      const t = this.task(id);
      if (!t) return { task: null, next: null };
      let next = null;
      if (status === 'done') {
        if (!t.done) next = this.toggleDone(id).next;
      } else {
        if (t.done) this.toggleDone(id);
        t.status = this.normStatus(status);
        t.updatedAt = Date.now();
        this.save();
      }
      return { task: t, next: next };
    },

    /* ==================== Задачи ==================== */
    tasks(includeArchived) {
      if (includeArchived) return this.data.tasks;
      return this.data.tasks.filter(function (t) { return !t.archived; });
    },
    task(id) { return this.data.tasks.find(function (t) { return t.id === id; }) || null; },

    /* Валидация формы задачи. Возвращает строку ошибки или '' */
    validateTask(form) {
      if (!form.title || !form.title.trim()) return 'Название задачи не может быть пустым.';
      if (form.date && U.parseDateKey(form.date) === null) return 'Указана некорректная дата выполнения.';
      if (form.timeStart && !U.isValidTime(form.timeStart)) return 'Некорректное время начала.';
      if (form.timeEnd && !U.isValidTime(form.timeEnd)) return 'Некорректное время окончания.';
      if (form.timeStart && form.timeEnd && U.minutesOf(form.timeEnd) < U.minutesOf(form.timeStart))
        return 'Время окончания не может быть раньше времени начала.';
      if (form.remind && form.remind !== 'none' && !U.isValidTime(form.remindAt)) return 'Укажите корректное время напоминания.';
      return '';
    },

    createTask(form) {
      const now = Date.now();
      const t = {
        id: U.uid(),
        title: form.title.trim(),
        desc: (form.desc || '').trim(),
        date: form.date || U.todayKey(),
        timeStart: form.timeStart || '',
        timeEnd: form.timeEnd || '',
        priority: form.priority || 'medium',
        categoryId: form.categoryId || 'other',
        repeat: form.repeat || 'none',
        remind: form.remind || 'none',
        remindAt: form.remindAt || '',
        isMain: !!form.isMain,
        status: this.normStatus(form.status),
        done: false,
        doneAt: null,
        createdAt: now,
        updatedAt: now,
        archived: false,
        seriesId: null,
        seriesBase: null
      };
      if (form.status === 'done') { t.done = true; t.doneAt = now; t.isMain = false; }
      if (t.repeat !== 'none') { t.seriesId = t.id; t.seriesBase = t.date; }
      this._enforceMainLimit(t);
      this.data.tasks.push(t);
      this.save();
      return t;
    },

    updateTask(id, form) {
      const t = this.task(id);
      if (!t) return null;
      const wasSeries = t.repeat !== 'none';
      Object.assign(t, {
        title: form.title.trim(),
        desc: (form.desc || '').trim(),
        date: form.date || t.date,
        timeStart: form.timeStart || '',
        timeEnd: form.timeEnd || '',
        priority: form.priority || t.priority,
        categoryId: form.categoryId || t.categoryId,
        repeat: form.repeat || 'none',
        remind: form.remind || 'none',
        remindAt: form.remindAt || '',
        isMain: !!form.isMain,
        updatedAt: Date.now()
      });
      if (t.repeat !== 'none') {
        if (!wasSeries || !t.seriesId) t.seriesId = t.id;
        t.seriesBase = t.seriesBase || t.date;
      } else {
        t.seriesId = null; t.seriesBase = null;
      }
      this._enforceMainLimit(t);
      this.save();
      if (form.status) this.setStatus(id, form.status);
      return t;
    },

    _enforceMainLimit(candidate) {
      if (!candidate.isMain) return;
      const mains = this.data.tasks.filter(function (t) { return t.isMain && !t.done && !t.archived && t.id !== candidate.id; });
      while (mains.length >= 3) {
        mains.pop().isMain = false;
      }
    },

    deleteTask(id) {
      this.data.tasks = this.data.tasks.filter(function (t) { return t.id !== id; });
      this.save();
    },

    deleteTasks(ids) {
      const set = {};
      ids.forEach(function (id) { set[id] = true; });
      this.data.tasks = this.data.tasks.filter(function (t) { return !set[t.id]; });
      this.save();
    },

    restoreTask(id) {
      const t = this.task(id);
      if (t) { t.archived = false; this.save(); }
    },

    archiveTask(id) {
      const t = this.task(id);
      if (t) { t.archived = true; t.isMain = false; this.save(); }
    },

    archiveDone(beforeKey) {
      let n = 0;
      this.data.tasks.forEach(function (t) {
        if (t.done && !t.archived && U.diffDays(beforeKey, t.date) >= 0) { t.archived = true; t.isMain = false; n++; }
      });
      this.save();
      return n;
    },

    /* Переключение выполнения + корректная логика повторов */
    toggleDone(id) {
      const t = this.task(id);
      if (!t) return { task: null, next: null };
      if (!t.done) {
        t.done = true;
        t.doneAt = Date.now();
        t.isMain = false;
        let next = null;
        if (t.repeat !== 'none') {
          next = this._spawnNext(t);
        }
        this.save();
        return { task: t, next: next };
      }
      t.done = false;
      t.doneAt = null;
      /* Если следующий экземпляр серии ещё не наступил и не выполнен — убираем его,
         чтобы отмена выполнения возвращала исходную задачу */
      if (t.repeat !== 'none' && t.seriesId) {
        const now = U.todayKey();
        this.data.tasks = this.data.tasks.filter(function (x) {
          return !(x.id !== t.id && x.seriesId === t.seriesId && !x.done && U.diffDays(x.date, t.date) > 0 && U.diffDays(now, x.date) < 0);
        });
      }
      this.save();
      return { task: t, next: null };
    },

    _spawnNext(t) {
      const nextDate = this.nextRepeatDate(t.date, t.repeat);
      if (!nextDate) return null;
      const now = Date.now();
      const n = Object.assign({}, t, {
        id: U.uid(),
        done: false,
        doneAt: null,
        status: 'new',
        createdAt: now,
        updatedAt: now,
        date: nextDate,
        isMain: false,
        seriesId: t.seriesId || t.id,
        seriesBase: t.seriesBase || t.date
      });
      this.data.tasks.push(n);
      return n;
    },

    nextRepeatDate(dateKey, repeat) {
      if (repeat === 'daily') return U.addDays(dateKey, 1);
      if (repeat === 'weekdays') {
        let d = U.addDays(dateKey, 1);
        for (let i = 0; i < 7; i++) {
          const wd = U.weekdayOf(d);
          if (wd >= 1 && wd <= 5) return d;
          d = U.addDays(d, 1);
        }
        return null;
      }
      if (repeat === 'weekly') return U.addDays(dateKey, 7);
      if (repeat === 'monthly') {
        const d = U.parseDateKey(dateKey);
        const day = d.getDate();
        const target = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
        target.setDate(Math.min(day, lastDay));
        return U.toDateKey(target);
      }
      return null;
    },

    setDate(id, dateKey) {
      const t = this.task(id);
      if (!t || U.parseDateKey(dateKey) === null) return false;
      t.date = dateKey;
      t.updatedAt = Date.now();
      this.save();
      return true;
    },

    setPriority(id, prio) {
      const t = this.task(id);
      if (t && ['low', 'medium', 'high'].indexOf(prio) >= 0) { t.priority = prio; this.save(); }
    },

    setCategory(id, catId) {
      const t = this.task(id);
      if (t && this.category(catId) && this.data.categories.some(function (c) { return c.id === catId; })) { t.categoryId = catId; this.save(); }
    },

    toggleMain(id) {
      const t = this.task(id);
      if (!t) return false;
      if (!t.isMain) {
        const activeMains = this.data.tasks.filter(function (x) { return x.isMain && !x.done && !x.archived; });
        if (activeMains.length >= 3) return false;
        t.isMain = true;
      } else {
        t.isMain = false;
      }
      this.save();
      return true;
    },

    bulkUpdate(ids, patch) {
      const set = {};
      ids.forEach(function (id) { set[id] = true; });
      this.data.tasks.forEach(function (t) {
        if (!set[t.id]) return;
        if (patch.done === true && !t.done) { t.done = true; t.doneAt = Date.now(); t.isMain = false; }
        if (patch.done === false) { t.done = false; t.doneAt = null; }
        if (patch.priority) t.priority = patch.priority;
        if (patch.categoryId) t.categoryId = patch.categoryId;
        t.updatedAt = Date.now();
      });
      this.save();
    },

    /* Задачи "на сегодня": срок сегодня или просроченные активные + сегодняшние выполненные */
    todayTasks() {
      const today = U.todayKey();
      return this.data.tasks.filter(function (t) {
        if (t.archived) return false;
        if (t.date === today) return true;
        if (!t.done && U.diffDays(today, t.date) > 0) return true;
        return false;
      });
    },

    isOverdue(t) {
      if (t.done || t.status === 'cancelled') return false; /* отменённые не просрочены */
      const diff = U.diffDays(U.todayKey(), t.date);
      if (diff > 0) return true;
      if (diff === 0 && t.timeEnd && U.isValidTime(t.timeEnd)) {
        const now = new Date();
        return U.minutesOf(t.timeEnd) < now.getHours() * 60 + now.getMinutes();
      }
      return false;
    },

    /* ==================== Привычки ==================== */
    habits() { return this.data.habits; },
    habit(id) { return this.data.habits.find(function (h) { return h.id === id; }) || null; },

    createHabit(form) {
      const h = {
        id: U.uid(),
        name: form.name.trim(),
        color: form.color || '#4585f5',
        freq: form.freq || 'daily',
        createdAt: Date.now(),
        completions: {}
      };
      this.data.habits.push(h);
      this.save();
      return h;
    },

    updateHabit(id, form) {
      const h = this.habit(id);
      if (!h) return;
      if (form.name != null) h.name = form.name.trim();
      if (form.color) h.color = form.color;
      if (form.freq) h.freq = form.freq;
      this.save();
    },

    deleteHabit(id) {
      this.data.habits = this.data.habits.filter(function (h) { return h.id !== id; });
      this.save();
    },

    habitScheduled(h, dateKey) {
      const wd = U.weekdayOf(dateKey);
      if (h.freq === 'weekdays') return wd >= 1 && wd <= 5;
      if (h.freq === 'weekends') return wd === 0 || wd === 6;
      return true;
    },

    toggleHabit(id, dateKey) {
      const h = this.habit(id);
      if (!h) return;
      if (h.completions[dateKey]) delete h.completions[dateKey];
      else h.completions[dateKey] = true;
      this.save();
    },

    /* Серия с учётом расписания: пропущенный не-плановый день не прерывает серию */
    habitStreak(h, endKey) {
      let d = endKey || U.todayKey();
      let streak = 0;
      for (let i = 0; i < 3660; i++) {
        const scheduled = this.habitScheduled(h, d);
        const done = !!h.completions[d];
        if (done) { streak++; }
        else if (scheduled) {
          if (i === 0 && d === U.todayKey()) { /* сегодня ещё можно отметить */ }
          else break;
        }
        d = U.addDays(d, -1);
      }
      return streak;
    },

    habitBestStreak(h) {
      const keys = Object.keys(h.completions).sort();
      if (!keys.length) return 0;
      let best = 0, run = 0;
      let prev = null;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (!this.habitScheduled(h, k)) continue;
        if (prev !== null) {
          /* идём от prev к k через плановые дни */
          let d = U.addDays(prev, 1);
          let gapOk = true;
          while (d !== k) {
            if (this.habitScheduled(h, d)) { gapOk = false; break; }
            d = U.addDays(d, 1);
          }
          run = gapOk ? run + 1 : 1;
        } else {
          run = 1;
        }
        best = Math.max(best, run);
        prev = k;
      }
      return best;
    },

    /* ==================== Экспорт / импорт ==================== */
    exportJSON() {
      return JSON.stringify(this.data, null, 2);
    },

    csv() {
      const prio = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
      const rep = { none: 'Нет', daily: 'Ежедневно', weekdays: 'По будням', weekly: 'Еженедельно', monthly: 'Ежемесячно' };
      const head = ['Название', 'Описание', 'Дата', 'Начало', 'Окончание', 'Приоритет', 'Категория', 'Повтор', 'Статус', 'Создано', 'Выполнено'];
      const rows = this.data.tasks.map(function (t) {
        return [
          t.title, t.desc || '', t.date, t.timeStart || '', t.timeEnd || '',
          prio[t.priority] || t.priority,
          (Store.category(t.categoryId) || {}).name || '',
          rep[t.repeat] || t.repeat,
          t.archived ? 'В архиве' : Store.statusLabel(Store.statusOf(t)),
          new Date(t.createdAt).toISOString().slice(0, 10),
          t.doneAt ? new Date(t.doneAt).toISOString().slice(0, 10) : ''
        ].map(U.csvEscape).join(';');
      });
      return '\uFEFF' + head.join(';') + '\n' + rows.join('\n');
    },

    /** Проверяет структуру и полностью заменяет данные. Бросает Error с текстом. */
    importJSON(text) {
      let obj;
      try { obj = JSON.parse(text); } catch (e) { throw new Error('Файл не является корректным JSON.'); }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Некорректная структура файла: ожидался объект данных «Мой планер».');
      if (!Array.isArray(obj.tasks)) throw new Error('В файле отсутствует список задач (tasks).');
      const test = {
        version: typeof obj.version === 'number' ? obj.version : 0,
        tasks: obj.tasks, categories: obj.categories, habits: obj.habits,
        settings: obj.settings, ui: obj.ui
      };
      const self = this;
      const saved = this.data;
      try {
        this._migrate(test);
        this._sanitize(test);
        /* Проверка: после санитайза задачи должны остаться (структура распознана) */
        if (obj.tasks.length && !test.tasks.length) throw new Error('Ни одна задача не прошла проверку структуры.');
        const badDates = obj.tasks.filter(function (t) { return t && typeof t === 'object' && U.parseDateKey(t.date) === null; });
        if (badDates.length) throw new Error('Часть задач содержит некорректные даты — импорт отменён.');
        this.data = test;
        if (!this.save()) {
          this.data = saved;
          throw new Error('Не удалось сохранить импортированные данные.');
        }
      } catch (e) {
        this.data = saved;
        throw e;
      }
    },

    resetAll() {
      this.data = this._seed();
      this.save();
    },

    /* ==================== Статистика ==================== */
    /* Все задачи, включая архив — удалённые не учитываются (их просто нет) */
    statsFor(range) {
      const all = this.data.tasks;
      let from = null, to = null;
      const today = U.todayKey();
      if (range === '7d') { from = U.addDays(today, -6); to = today; }
      else if (range === '30d') { from = U.addDays(today, -29); to = today; }
      else if (range === 'month') {
        const d = new Date();
        from = U.toDateKey(new Date(d.getFullYear(), d.getMonth(), 1));
        to = U.toDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      }
      const inRange = function (key) {
        if (!from) return true;
        const diff = U.diffDays(key, from);
        return diff >= 0 && U.diffDays(to, key) >= 0;
      };
      const scoped = all.filter(function (t) { return inRange(t.date); });
      const done = scoped.filter(function (t) { return t.done; });
      const overdue = scoped.filter(function (t) { return Store.isOverdue(t); });

      const byDay = {}; const byCat = {}; const byPrio = { low: 0, medium: 0, high: 0 };
      const byWeekday = [0, 0, 0, 0, 0, 0, 0]; const byWeekdayTotal = [0, 0, 0, 0, 0, 0, 0];

      scoped.forEach(function (t) {
        byDay[t.date] = byDay[t.date] || { total: 0, done: 0 };
        byDay[t.date].total++;
        if (t.done) {
          byDay[t.date].done++;
          byWeekday[U.weekdayOf(t.date)]++;
        }
        byWeekdayTotal[U.weekdayOf(t.date)]++;
        byCat[t.categoryId] = (byCat[t.categoryId] || 0) + 1;
        byPrio[t.priority] = (byPrio[t.priority] || 0) + 1;
      });

      /* Динамика по дням диапазона (если диапазон конечный) */
      const series = [];
      if (from) {
        let d = from;
        while (U.diffDays(to, d) >= 0) {
          series.push({ key: d, total: (byDay[d] || {}).total || 0, done: (byDay[d] || {}).done || 0 });
          d = U.addDays(d, 1);
        }
      } else {
        const keys = Object.keys(byDay).sort().slice(-30);
        keys.forEach(function (k) { series.push({ key: k, total: byDay[k].total, done: byDay[k].done }); });
      }

      const wdRates = [];
      for (let i = 0; i < 7; i++) {
        wdRates.push({ wd: i, done: byWeekday[i], total: byWeekdayTotal[i], rate: byWeekdayTotal[i] ? byWeekday[i] / byWeekdayTotal[i] : 0 });
      }

      return {
        total: scoped.length,
        doneCount: done.length,
        overdueCount: overdue.length,
        pct: scoped.length ? Math.round(done.length / scoped.length * 100) : 0,
        series: series,
        byCat: byCat,
        byPrio: byPrio,
        weekdayRates: wdRates
      };
    }
  };

  global.Store = Store;
})(window);
