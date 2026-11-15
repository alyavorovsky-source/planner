/* Мой планер — напоминания о задачах.
   Первое напоминание приходит в назначенное время. Если у задачи включён повтор,
   напоминания продолжаются через выбранный интервал, пока статус задачи не изменится
   (или задача не будет выполнена, либо не закончится день).
   Напоминания работают, пока приложение открыто (вкладка или установленное приложение). */
(function (global) {
  'use strict';

  const LS_KEY = 'dailyflow.reminders.v1';   // внутреннее имя ключа, не менять
  const GRACE_MIN = 15;                      // без повтора: через сколько минут после назначенного времени напоминание уже не показываем

  const Reminders = {
    state: null,    // { [id задачи]: { date, at, status, last, n, stopped } }

    load() {
      if (this.state) return this.state;
      let obj = null;
      try { obj = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { obj = null; }
      this.state = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
      return this.state;
    },

    save() {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.state || {})); } catch (e) { /* хранилище недоступно */ }
    },

    /* Время срабатывания задачи в миллисекундах (локальное) */
    scheduledMs(t) {
      const d = U.parseDateKey(t.date);
      if (!d) return null;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, U.minutesOf(t.remindAt), 0, 0).getTime();
    },

    /* Проверка напоминаний. now — для тестов, обычно не передаётся. Возвращает список показанных. */
    check(now) {
      const settings = Store.settings();
      if (!settings.notifications) return [];
      if (!App.notifSupported() || Notification.permission !== 'granted') return [];

      const nowDate = now instanceof Date ? now : new Date();
      const nowMs = nowDate.getTime();
      const todayKey = U.toDateKey(nowDate);
      const st = this.load();
      const fired = [];
      let changed = false;

      Store.tasks().forEach(function (t) {
        if (t.done || t.remind !== 'at' || !U.isValidTime(t.remindAt) || t.date !== todayKey) return;
        const sched = Reminders.scheduledMs(t);
        if (sched === null) return;
        const cur = Store.statusOf(t);
        const repeat = t.remindRepeat || 0;

        let r = st[t.id];
        /* задачу перенесли или поменяли время напоминания — начинаем заново */
        if (r && (r.date !== t.date || r.at !== t.remindAt)) { delete st[t.id]; r = null; changed = true; }

        if (!r) {
          if (cur === 'cancelled' || nowMs < sched) return;
          /* без повтора пропускаем «просроченное» напоминание; с повтором — напоминаем сразу, как только открыли приложение */
          if (!repeat && nowMs - sched > GRACE_MIN * 60000) return;
          st[t.id] = { date: t.date, at: t.remindAt, status: cur, last: nowMs, n: 1 };
          changed = true;
          Reminders.show(t, 1, cur, repeat);
          fired.push(t.id);
          return;
        }

        if (!repeat || r.stopped) return;
        if (cur !== r.status) { r.stopped = true; changed = true; return; }   // статус изменили — повторы прекращаются
        const step = repeat * 60000;
        if (nowMs - r.last >= step) {
          /* держимся сетки интервалов; если приложение долго «спало» — отсчитываем от текущего момента */
          r.last = nowMs - r.last < step * 2 ? r.last + step : nowMs;
          r.n += 1;
          changed = true;
          Reminders.show(t, r.n, cur, repeat);
          fired.push(t.id);
        }
      });

      /* убираем записи прошлых дней и удалённых задач */
      Object.keys(st).forEach(function (id) {
        if (!Store.task(id) || st[id].date < todayKey) { delete st[id]; changed = true; }
      });
      if (changed) this.save();
      return fired;
    },

    show(t, n, status, repeat) {
      const s = Store.settings();
      let body;
      if (n === 1) {
        body = t.desc || ('Запланировано на ' + U.formatTime(t.remindAt, s.timeFormat === 12));
        if (repeat) body += '\nПовторим через ' + repeat + ' мин., пока статус не изменится.';
      } else {
        body = 'Статус «' + Store.statusLabel(status) + '» не менялся (напоминание № ' + n + '). Повторим через ' + repeat + ' мин.';
      }
      App.notify('Напоминание: ' + t.title, body, 'reminder-' + t.id);
    }
  };

  global.Reminders = Reminders;
})(window);
