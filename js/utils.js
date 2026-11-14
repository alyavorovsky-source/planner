/* DailyFlow — утилиты */
(function (global) {
  'use strict';

  const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const MONTHS_NOM = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const WEEKDAYS_FULL = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
  const WEEKDAYS_SHORT = ['вс','пн','вт','ср','чт','пт','сб'];

  const U = {
    MONTHS_GEN, MONTHS_NOM, WEEKDAYS_FULL, WEEKDAYS_SHORT,

    uid() {
      return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    },

    esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    /* ---- Даты: все задачи хранят дату как 'YYYY-MM-DD' ---- */
    pad2(n) { return n < 10 ? '0' + n : '' + n; },

    toDateKey(d) {
      return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
    },

    todayKey() { return U.toDateKey(new Date()); },

    parseDateKey(key) {
      if (typeof key !== 'string') return null;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
      if (!m) return null;
      const y = +m[1], mo = +m[2], da = +m[3];
      if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
      const d = new Date(y, mo - 1, da);
      if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;
      return d;
    },

    addDays(dateOrKey, days) {
      const d = typeof dateOrKey === 'string' ? U.parseDateKey(dateOrKey) : new Date(dateOrKey);
      d.setDate(d.getDate() + days);
      return U.toDateKey(d);
    },

    diffDays(keyA, keyB) {
      const a = U.parseDateKey(keyA), b = U.parseDateKey(keyB);
      return Math.round((a - b) / 86400000);
    },

    weekdayOf(key) { return U.parseDateKey(key).getDay(); },

    /* Индекс дня недели с учётом настройки firstDay (0=вс, 1=пн) */
    weekdayIndex(key, firstDay) {
      return (U.weekdayOf(key) - firstDay + 7) % 7;
    },

    startOfWeek(key, firstDay) {
      return U.addDays(key, -U.weekdayIndex(key, firstDay));
    },

    formatLong(key) {
      const d = U.parseDateKey(key);
      if (!d) return '';
      return WEEKDAYS_FULL[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + ' ' + d.getFullYear();
    },

    formatShort(key) {
      const d = U.parseDateKey(key);
      if (!d) return '';
      return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()];
    },

    monthLabel(year, month) {
      return MONTHS_NOM[month] + ' ' + year;
    },

    relativeDayLabel(key) {
      const diff = U.diffDays(key, U.todayKey());
      if (diff === 0) return 'Сегодня';
      if (diff === 1) return 'Завтра';
      if (diff === -1) return 'Вчера';
      if (diff === 2) return 'Послезавтра';
      return U.formatShort(key);
    },

    /* ---- Время 'HH:MM' и формат 12/24 ---- */
    isValidTime(v) { return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v); },

    formatTime(v, h12) {
      if (!U.isValidTime(v)) return v || '';
      const parts = v.split(':');
      let h = +parts[0];
      const m = parts[1];
      if (!h12) return h + ':' + m;
      const suf = h >= 12 ? ' PM' : ' AM';
      h = h % 12; if (h === 0) h = 12;
      return h + ':' + m + suf;
    },

    minutesOf(v) {
      if (!U.isValidTime(v)) return null;
      const p = v.split(':');
      return (+p[0]) * 60 + (+p[1]);
    },

    /* ---- Разное ---- */
    debounce(fn, ms) {
      let t;
      return function () {
        const args = arguments, self = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(self, args); }, ms);
      };
    },

    clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },

    greeting() {
      const h = new Date().getHours();
      if (h < 5) return 'Доброй ночи';
      if (h < 12) return 'Доброе утро';
      if (h < 18) return 'Добрый день';
      return 'Добрый вечер';
    },

    download(filename, content, mime) {
      const blob = new Blob([content], { type: mime || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    },

    csvEscape(v) {
      v = String(v == null ? '' : v);
      if (/[",;\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
      return v;
    },

    isTypingTarget(el) {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    },

    bytes(n) {
      if (n < 1024) return n + ' Б';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' КБ';
      return (n / 1024 / 1024).toFixed(2) + ' МБ';
    }
  };

  global.U = U;
})(window);
