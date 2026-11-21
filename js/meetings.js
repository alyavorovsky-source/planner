/* Мой планер — планерки: темы для обсуждения.
   Планерки проходят каждый вторник и среду. К каждой планерке можно добавить темы
   (название и описание), отметить их обсуждёнными, изменить, перенести или удалить.
   Чтобы поменять дни планёрок, измените WEEKDAYS (0 — воскресенье, 1 — понедельник, ... 6 — суббота). */
(function (global) {
  'use strict';

  const WEEKDAYS = [2, 3];                 // вторник, среда
  const DAY_NAMES = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const SHOW_UPCOMING = 4;                 // сколько ближайших планёрок показываем всегда
  const SELECT_COUNT = 8;                  // из скольких ближайших планёрок можно выбирать при добавлении темы

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  const Meetings = {
    WEEKDAYS: WEEKDAYS,
    draft: { date: '', title: '', desc: '' },   // недописанная новая тема (переживает перерисовку)
    editing: null,                               // { id, date, title, desc } — тема в режиме правки
    pastOpen: false,                             // раскрыт ли блок «Прошедшие планерки»

    /* ---------- даты планёрок ---------- */
    isMeetingDay(key) {
      const d = U.parseDateKey(key);
      return !!d && WEEKDAYS.indexOf(d.getDay()) >= 0;
    },

    /* count ближайших планёрок, начиная с from (включительно; по умолчанию — сегодня) */
    nextDates(count, from) {
      const out = [];
      let key = from || U.todayKey();
      for (let i = 0; i < 366 && out.length < count; i++) {
        if (this.isMeetingDay(key)) out.push(key);
        key = U.addDays(key, 1);
      }
      return out;
    },

    label(key) {
      const d = U.parseDateKey(key);
      return cap(DAY_NAMES[d.getDay()]) + ', ' + U.formatShort(key);
    },

    when(key) {
      const diff = U.diffDays(key, U.todayKey());
      if (diff === 0) return 'Сегодня';
      if (diff === 1) return 'Завтра';
      if (diff > 1) return 'через ' + diff + ' дн.';
      if (diff === -1) return 'Вчера';
      return '';
    },

    /* ---------- разметка ---------- */
    dateOptions(selected, extra) {
      const keys = this.nextDates(SELECT_COUNT);
      if (selected && keys.indexOf(selected) < 0) keys.push(selected);
      if (extra && keys.indexOf(extra) < 0) keys.push(extra);
      keys.sort();
      return keys.map(function (k) {
        const w = Meetings.when(k);
        return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + U.esc(Meetings.label(k) + (w ? ' (' + w.toLowerCase() + ')' : '')) + '</option>';
      }).join('');
    },

    topicHtml(x, past) {
      if (this.editing && this.editing.id === x.id) {
        const e = this.editing;
        return '<div class="mt-topic mt-topic--edit" data-mt-id="' + x.id + '">' +
          '<input type="text" class="mt-edit-title" maxlength="120" value="' + U.esc(e.title) + '" aria-label="Название темы">' +
          '<textarea class="mt-edit-desc" rows="3" maxlength="2000" placeholder="Описание (необязательно)" aria-label="Описание темы">' + U.esc(e.desc) + '</textarea>' +
          '<label class="mt-edit-date">Планерка<select class="mt-edit-date__sel">' + this.dateOptions(e.date, x.date) + '</select></label>' +
          '<div class="mt-row">' +
            '<button type="button" class="btn btn--sm btn--primary" data-mt="save">' + Icons.svg('check', 14) + 'Сохранить</button>' +
            '<button type="button" class="btn btn--sm btn--ghost" data-mt="cancel">Отмена</button>' +
          '</div></div>';
      }
      const overdue = past && !x.done;
      return '<div class="mt-topic' + (x.done ? ' mt-topic--done' : '') + (overdue ? ' mt-topic--open-past' : '') + '" data-mt-id="' + x.id + '">' +
        '<input type="checkbox" class="cb" data-mt="toggle"' + (x.done ? ' checked' : '') + ' title="Отметить обсуждённой" aria-label="Тема обсуждена">' +
        '<div class="mt-topic__body">' +
          '<div class="mt-topic__title">' + U.esc(x.title) + '</div>' +
          (x.desc ? '<div class="mt-topic__desc">' + U.esc(x.desc) + '</div>' : '') +
          (overdue ? '<button type="button" class="mt-link" data-mt="move">Перенести на ближайшую планерку</button>' : '') +
        '</div>' +
        '<span class="mt-topic__actions">' +
          '<button type="button" class="icon-btn" data-mt="edit" title="Редактировать" aria-label="Редактировать тему">' + Icons.svg('edit', 14) + '</button>' +
          '<button type="button" class="icon-btn danger" data-mt="delete" title="Удалить" aria-label="Удалить тему">' + Icons.svg('trash', 14) + '</button>' +
        '</span></div>';
    },

    meetingHtml(key, topics, past) {
      const items = topics.slice().sort(function (a, b) {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return a.createdAt - b.createdAt;
      });
      const open = items.filter(function (x) { return !x.done; }).length;
      const w = past ? '' : this.when(key);
      return '<section class="mt-meet' + (U.diffDays(key, U.todayKey()) === 0 ? ' mt-meet--today' : '') + '" data-mt-date="' + key + '">' +
        '<header class="mt-meet__head">' +
          '<span class="mt-meet__day">' + U.esc(this.label(key)) + '</span>' +
          (w ? '<span class="mt-meet__when">' + U.esc(w) + '</span>' : '') +
          '<span class="day-group__badge" title="Тем: ' + items.length + (open ? ', не обсуждено: ' + open : '') + '">' + items.length + '</span>' +
        '</header>' +
        (items.length
          ? '<div class="mt-list">' + items.map(function (x) { return Meetings.topicHtml(x, past); }).join('') + '</div>'
          : '<div class="mt-empty">Тем пока нет</div>') +
      '</section>';
    },

    html() {
      const today = U.todayKey();
      const byDate = {};
      Store.topics().forEach(function (x) { (byDate[x.date] = byDate[x.date] || []).push(x); });

      const upcoming = this.nextDates(SHOW_UPCOMING);
      Object.keys(byDate).forEach(function (k) { if (k >= today && upcoming.indexOf(k) < 0) upcoming.push(k); });
      upcoming.sort();
      const past = Object.keys(byDate).filter(function (k) { return k < today; }).sort().reverse();

      /* выбранная планерка в форме: по умолчанию — ближайшая */
      const opts = this.nextDates(SELECT_COUNT);
      if (!this.draft.date || this.draft.date < today) this.draft.date = opts[0];

      const next = this.nextDates(1)[0];
      let h = '<div class="section-head"><h1 class="section-title">Планерки</h1>' +
        '<div class="section-sub">Каждый вторник и среду · ближайшая: ' + U.esc(this.label(next)) +
        (this.when(next) ? ' (' + U.esc(this.when(next).toLowerCase()) + ')' : '') + '</div></div>';

      h += '<form class="panel mt-add" data-mt-form autocomplete="off">' +
        '<h2 class="panel__title">' + Icons.svg('plus', 17) + 'Новая тема для обсуждения</h2>' +
        '<label class="mt-field">Планерка<select class="mt-add__date" name="date">' + this.dateOptions(this.draft.date) + '</select></label>' +
        '<input type="text" class="mt-add__title" name="title" maxlength="120" value="' + U.esc(this.draft.title) + '" placeholder="Название темы" aria-label="Название темы">' +
        '<textarea class="mt-add__desc" name="desc" rows="2" maxlength="2000" placeholder="Описание (необязательно)" aria-label="Описание темы">' + U.esc(this.draft.desc) + '</textarea>' +
        '<div class="mt-row"><button type="submit" class="btn btn--primary">' + Icons.svg('plus', 15) + 'Добавить тему</button>' +
        '<span class="mt-hint">Enter в названии или Ctrl + Enter в описании — добавить</span></div>' +
      '</form>';

      h += upcoming.map(function (k) { return Meetings.meetingHtml(k, byDate[k] || [], false); }).join('');

      if (past.length) {
        const openPast = past.reduce(function (n, k) { return n + byDate[k].filter(function (x) { return !x.done; }).length; }, 0);
        h += '<details class="mt-past"' + (this.pastOpen ? ' open' : '') + '><summary>Прошедшие планерки (' + past.length + ')' +
          (openPast ? ' · не обсуждено тем: ' + openPast : '') + '</summary>' +
          past.map(function (k) { return Meetings.meetingHtml(k, byDate[k], true); }).join('') + '</details>';
      }
      return h;
    },

    paint(root) {
      root.innerHTML = this.html();
      if (global.App && App.buildNav) App.buildNav();   // обновить счётчик в меню
    },

    /* ---------- вставка раздела в страницу ---------- */
    render(container) {
      const root = document.createElement('div');
      root.className = 'mt-root';
      container.appendChild(root);
      this.paint(root);
      this.bind(root);
    },

    bind(root) {
      const self = this;

      root.addEventListener('submit', function (e) {
        if (!e.target.matches('[data-mt-form]')) return;
        e.preventDefault();
        self.add(root);
      });

      root.addEventListener('input', function (e) {
        const t = e.target;
        if (t.classList.contains('mt-add__title')) self.draft.title = t.value;
        else if (t.classList.contains('mt-add__desc')) self.draft.desc = t.value;
        else if (t.classList.contains('mt-edit-title') && self.editing) self.editing.title = t.value;
        else if (t.classList.contains('mt-edit-desc') && self.editing) self.editing.desc = t.value;
      });

      root.addEventListener('change', function (e) {
        const t = e.target;
        if (t.classList.contains('mt-add__date')) self.draft.date = t.value;
        else if (t.classList.contains('mt-edit-date__sel') && self.editing) self.editing.date = t.value;
      });

      root.addEventListener('toggle', function (e) {
        if (e.target.classList && e.target.classList.contains('mt-past')) self.pastOpen = e.target.open;
      }, true);

      root.addEventListener('keydown', function (e) {
        const t = e.target;
        const send = (e.ctrlKey || e.metaKey) && e.key === 'Enter';
        if (t.classList.contains('mt-add__desc') && send) { e.preventDefault(); self.add(root); }
        else if (t.classList.contains('mt-edit-title') && e.key === 'Enter') { e.preventDefault(); self.save(root); }
        else if (t.classList.contains('mt-edit-desc') && send) { e.preventDefault(); self.save(root); }
        else if ((t.classList.contains('mt-edit-title') || t.classList.contains('mt-edit-desc') || t.classList.contains('mt-edit-date__sel')) && e.key === 'Escape') {
          e.stopPropagation(); self.editing = null; self.paint(root);
        }
      });

      root.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-mt]');
        if (!btn) return;
        const act = btn.getAttribute('data-mt');
        const item = btn.closest('[data-mt-id]');
        const id = item ? item.getAttribute('data-mt-id') : null;

        if (act === 'toggle') {
          Store.setTopicDone(id, btn.checked);
          self.paint(root);
        } else if (act === 'edit') {
          const x = Store.topic(id);
          if (!x) return;
          self.editing = { id: x.id, date: x.date, title: x.title, desc: x.desc };
          self.paint(root);
          const ti = root.querySelector('.mt-edit-title');
          if (ti) { ti.focus(); ti.setSelectionRange(ti.value.length, ti.value.length); }
        } else if (act === 'cancel') {
          self.editing = null; self.paint(root);
        } else if (act === 'save') {
          self.save(root);
        } else if (act === 'move') {
          const x = Store.topic(id);
          if (!x) return;
          const prev = x.date;
          Store.updateTopic(id, { title: x.title, desc: x.desc, date: self.nextDates(1)[0] });
          self.paint(root);
          App.toast('Тема перенесена на ближайшую планерку', 'success', function () {
            Store.updateTopic(id, { title: x.title, desc: x.desc, date: prev });
            if (root.isConnected) self.paint(root);
          });
        } else if (act === 'delete') {
          const removed = Store.deleteTopic(id);
          if (!removed) return;
          if (self.editing && self.editing.id === id) self.editing = null;
          self.paint(root);
          App.toast('Тема удалена', 'success', function () {
            Store.restoreTopic(removed);
            if (root.isConnected) self.paint(root);
          });
        }
      });
    },

    /* ---------- действия ---------- */
    add(root) {
      const form = { date: this.draft.date, title: this.draft.title, desc: this.draft.desc };
      const err = Store.validateTopic(form);
      if (err) {
        App.toast(err, 'warn');
        const ti = root.querySelector('.mt-add__title');
        if (ti) ti.focus();
        return;
      }
      Store.createTopic(form);
      this.draft.title = '';
      this.draft.desc = '';
      this.paint(root);
      const ti = root.querySelector('.mt-add__title');
      if (ti) ti.focus();
    },

    save(root) {
      if (!this.editing) return;
      const err = Store.validateTopic(this.editing);
      if (err) { App.toast(err, 'warn'); return; }
      Store.updateTopic(this.editing.id, this.editing);
      this.editing = null;
      this.paint(root);
    }
  };

  global.Meetings = Meetings;
})(window);
