/* Мой планер — рендеринг разделов */
(function (global) {
  'use strict';

  const PRIO_LABEL = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
  const REPEAT_LABEL = { none: 'Не повторять', daily: 'Ежедневно', weekdays: 'По будням', weekly: 'Еженедельно', monthly: 'Ежемесячно' };

  const Views = {
    state: {
      tasksFilter: 'all',       // all | active | done | overdue
      tasksSort: 'time',        // time | priority | created
      tasksCat: '',
      tasksPrio: '',
      quickDraft: '',           // недописанное название в строке быстрого ввода
      calMode: 'month',
      calAnchor: null,          // 'YYYY-MM-01' или дата-якорь
      statsRange: '30d',
      weekAnchor: null
    },

    prioChip(p) {
      return '<span class="chip chip--prio-' + p + '">' + PRIO_LABEL[p] + '</span>';
    },

    catChip(catId) {
      const c = Store.category(catId);
      if (!c) return '';
      return '<span class="chip chip--cat" style="color:' + U.esc(c.color) + '"><span class="chip__dot"></span>' + U.esc(c.name) + '</span>';
    },

    timeLabel(t) {
      const s = Store.settings();
      const parts = [];
      if (t.timeStart) parts.push(U.formatTime(t.timeStart, s.timeFormat === 12));
      if (t.timeEnd) parts.push('– ' + U.formatTime(t.timeEnd, s.timeFormat === 12));
      return parts.join(' ');
    },

    /* ---------- Карточка задачи ---------- */
    taskCard(t, opts) {
      opts = opts || {};
      const overdue = Store.isOverdue(t);
      const time = this.timeLabel(t);
      const cls = ['task'];
      if (t.done) cls.push('task--done');
      if (t.isMain && !t.done) cls.push('task--main');
      if (overdue) cls.push('task--overdue');
      const status = Store.statusOf(t);
      if (status === 'cancelled') cls.push('task--cancelled');

      let meta = '';
      if (!opts.archive) {
        /* выпадающий список статуса — первым в строке мета */
        meta += '<select class="status-select st-' + status + '" data-act="status-set" data-id="' + t.id + '" title="Статус задачи" aria-label="Статус задачи">' +
          Store.STATUSES.map(function (st) { return '<option value="' + st.id + '"' + (status === st.id ? ' selected' : '') + '>' + st.label + '</option>'; }).join('') +
        '</select>';
      }
      if (time) meta += '<span class="task__time">' + Icons.svg('clock', 13) + U.esc(time) + '</span>';
      meta += this.catChip(t.categoryId);
      meta += this.prioChip(t.priority);
      if (!opts.hideDate) {
        meta += '<span class="chip chip--cat">' + Icons.svg('calendar', 12) + U.esc(opts.dateLabel || U.relativeDayLabel(t.date)) + '</span>';
      }
      if (overdue) meta += '<span class="chip chip--overdue">' + Icons.svg('alert', 12) + 'Просрочена</span>';
      if (t.done) meta += '<span class="chip chip--done">' + Icons.svg('check', 12) + 'Выполнена</span>';
      if (t.repeat !== 'none') meta += '<span class="chip chip--cat">' + Icons.svg('repeat', 12) + REPEAT_LABEL[t.repeat] + '</span>';
      if (t.remind !== 'none' && t.remindAt) meta += '<span class="chip chip--cat">' + Icons.svg('bell', 12) + U.formatTime(t.remindAt, Store.settings().timeFormat === 12) + '</span>';

      const actions = [];
      if (opts.archive) {
        actions.push('<button class="icon-btn" data-act="restore" data-id="' + t.id + '" title="Восстановить">' + Icons.svg('restore', 15) + '</button>');
        actions.push('<button class="icon-btn danger" data-act="purge" data-id="' + t.id + '" title="Удалить навсегда">' + Icons.svg('trash', 15) + '</button>');
      } else {
        if (!t.done) actions.push('<button class="icon-btn star-btn' + (t.isMain ? ' active' : '') + '" data-act="main" data-id="' + t.id + '" title="' + (t.isMain ? 'Убрать из главных' : 'Сделать главной (до 3)') + '">' + Icons.svg('star', 15) + '</button>');
        actions.push('<button class="icon-btn" data-act="edit" data-id="' + t.id + '" title="Редактировать">' + Icons.svg('edit', 15) + '</button>');
        if (t.done && !opts.noArchive) actions.push('<button class="icon-btn" data-act="archive" data-id="' + t.id + '" title="В архив">' + Icons.svg('archive', 15) + '</button>');
        actions.push('<button class="icon-btn danger" data-act="delete" data-id="' + t.id + '" title="Удалить">' + Icons.svg('trash', 15) + '</button>');
      }

      return '<div class="' + cls.join(' ') + '" data-task="' + t.id + '"' + (opts.draggable ? ' draggable="true"' : '') + '>' +
        '<input type="checkbox" class="task__check" data-act="toggle" data-id="' + t.id + '"' + (t.done ? ' checked' : '') + ' aria-label="Выполнено">' +
        '<div class="task__body">' +
          '<div class="task__title" data-act="open" data-id="' + t.id + '">' + U.esc(t.title) + '</div>' +
          (t.desc ? '<div class="task__desc">' + U.esc(t.desc) + '</div>' : '') +
          '<div class="task__meta">' + meta + '</div>' +
        '</div>' +
        '<div class="task__actions">' + actions.join('') + '</div>' +
      '</div>';
    },

    emptyState(title, text, withBtn) {
      return '<div class="empty">' + Icons.svg('inbox', 66) +
        '<div class="empty__title">' + U.esc(title) + '</div>' +
        '<div class="empty__text">' + U.esc(text) + '</div>' +
        (withBtn ? '<button class="btn btn--primary" data-act="new-task">' + Icons.svg('plus') + 'Добавить задачу</button>' : '') +
      '</div>';
    },

    sortTasks(list, mode) {
      const arr = list.slice();
      const big = 1e9;
      if (mode === 'time') {
        arr.sort(function (a, b) {
          const ta = U.minutesOf(a.timeStart); const tb = U.minutesOf(b.timeStart);
          if (ta !== null && tb !== null && ta !== tb) return ta - tb;
          if (ta !== null && tb === null) return -1;
          if (ta === null && tb !== null) return 1;
          return a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt;
        });
      } else if (mode === 'priority') {
        const w = { high: 0, medium: 1, low: 2 };
        arr.sort(function (a, b) { return w[a.priority] - w[b.priority] || (a.date < b.date ? -1 : 1); });
      } else if (mode === 'date') {
        arr.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt; });
      } else if (mode === 'created') {
        arr.sort(function (a, b) { return b.createdAt - a.createdAt; });
      }
      /* выполненные — в конец */
      arr.sort(function (a, b) { return (a.done ? 1 : 0) - (b.done ? 1 : 0); });
      return arr;
    },

    /* ==================== КАНБАН ==================== */
    kanbanHtml(list) {
      const s = this.state;
      const cols = Store.STATUSES.map(function (st) {
        let items = list.filter(function (t) { return Store.statusOf(t) === st.id; });
        if (st.id === 'done') {
          items.sort(function (a, b) { return (b.doneAt || 0) - (a.doneAt || 0); });
        } else {
          items = Views.sortTasks(items, s.tasksSort);
        }
        const cards = items.length
          ? items.map(function (t) { return Views.taskCard(t, { draggable: true, dateLabel: U.relativeDayLabel(t.date) }); }).join('')
          : '<div class="kcol__empty">Перетащите задачу сюда</div>';
        return '<section class="kcol" data-drop-status="' + st.id + '" aria-label="' + st.label + '">' +
          '<header class="kcol__head"><span class="kcol__dot st-' + st.id + '"></span>' +
            '<span class="kcol__title">' + st.label + '</span><span class="day-group__badge">' + items.length + '</span></header>' +
          '<div class="kcol__body">' + cards + '</div></section>';
      }).join('');
      return '<div class="kanban">' + cols + '</div>';
    },

    /* ==================== ЗАДАЧИ (Сегодня + Предстоящие + Все задачи) ==================== */
    renderTasks(el) {
      const s = this.state;
      const today = U.todayKey();
      const tomorrow = U.addDays(today, 1);
      const mode = Store.data.ui.tasksMode === 'kanban' ? 'kanban' : 'list';

      /* --- шапка дня: считается по задачам на сегодня --- */
      const todayAll = Store.todayTasks().filter(function (t) { return t.status !== 'cancelled'; });
      const done = todayAll.filter(function (t) { return t.done; });
      const active = todayAll.filter(function (t) { return !t.done; });
      const total = todayAll.length;
      const pct = total ? Math.round(done.length / total * 100) : 0;
      const overdueCount = todayAll.filter(function (t) { return Store.isOverdue(t); }).length;

      const R = 46, C = 2 * Math.PI * R;
      const ring =
        '<div class="progress-ring">' +
          '<svg width="110" height="110" viewBox="0 0 110 110">' +
            '<circle cx="55" cy="55" r="' + R + '" fill="none" stroke="var(--bg-elev-2)" stroke-width="9"/>' +
            '<circle cx="55" cy="55" r="' + R + '" fill="none" stroke="var(--accent)" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - pct / 100)) + '" style="transition:stroke-dashoffset .5s ease"/>' +
          '</svg>' +
          '<div class="progress-ring__text"><span class="progress-ring__pct">' + pct + '%</span><span class="progress-ring__lbl">план дня</span></div>' +
        '</div>';

      let html =
        '<div class="hero panel">' +
          '<div>' +
            '<h1 class="section-title" style="margin-bottom:4px">' + U.esc(U.formatLong(today)) + '</h1>' +
            '<div class="section-sub" style="margin-bottom:14px">' + (total ? 'Запланировано на сегодня: ' + total : 'На сегодня задач пока нет') + '</div>' +
            '<div class="hero__stats">' +
              '<div class="stat-chip stat-chip--green"><div class="stat-chip__value">' + done.length + '</div><div class="stat-chip__label">выполнено</div></div>' +
              '<div class="stat-chip stat-chip--accent"><div class="stat-chip__value">' + active.length + '</div><div class="stat-chip__label">осталось</div></div>' +
              '<div class="stat-chip"><div class="stat-chip__value" style="color:' + (overdueCount ? 'var(--red)' : 'inherit') + '">' + overdueCount + '</div><div class="stat-chip__label">просрочено</div></div>' +
            '</div>' +
          '</div>' + ring +
        '</div>';

      /* --- главные задачи --- */
      const mains = Store.tasks().filter(function (t) { return t.isMain && !t.done; })
        .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (mains.length) {
        html += '<section class="panel" style="margin-bottom:20px">' +
          '<h2 class="panel__title">' + Icons.svg('star', 17) + 'Главные задачи</h2>' +
          '<div class="task-list">' + mains.map(function (t) { return Views.taskCard(t, {}); }).join('') + '</div>' +
        '</section>';
      }

      /* --- строка быстрого ввода: Enter создаёт задачу на сегодня со средним приоритетом --- */
      html += '<form class="quick-add" data-quick-add autocomplete="off">' +
          '<span class="quick-add__icon">' + Icons.svg('plus', 18) + '</span>' +
          '<input type="text" class="quick-add__input" maxlength="160" value="' + U.esc(s.quickDraft) + '" ' +
            'placeholder="Новая задача — название и Enter" aria-label="Название новой задачи">' +
          '<button type="submit" class="quick-add__btn" title="Добавить задачу" aria-label="Добавить задачу"><span class="quick-add__kbd">Enter&nbsp;</span>↵</button>' +
        '</form>' +
        '<div class="quick-add__hint">Задача создаётся на сегодня со средним приоритетом. Остальное можно поменять позже — откройте задачу и нажмите «Редактировать».</div>';

      /* --- отбор задач --- */
      let list = Store.tasks();
      if (s.tasksCat) list = list.filter(function (t) { return t.categoryId === s.tasksCat; });
      if (s.tasksPrio) list = list.filter(function (t) { return t.priority === s.tasksPrio; });

      const f = s.tasksFilter;
      if (f === 'active') list = list.filter(function (t) { return !t.done && t.status !== 'cancelled'; });
      else if (f === 'overdue') list = list.filter(function (t) { return Store.isOverdue(t); });
      else if (f === 'done') list = list.filter(function (t) { return t.done; });
      else list = list.filter(function (t) { return !t.done || t.date === today; }); /* «Все»: активные + выполненные сегодня */

      /* --- панель фильтров --- */
      const filters = [['all', 'Все'], ['active', 'Активные'], ['done', 'Выполненные'], ['overdue', 'Просроченные']]
        .map(function (fr) { return '<button data-act="tasks-filter" data-v="' + fr[0] + '" class="' + (f === fr[0] ? 'active' : '') + '">' + fr[1] + '</button>'; }).join('');
      const sorts = [['time', 'По времени'], ['priority', 'По приоритету'], ['created', 'По дате создания']]
        .map(function (fr) { return '<option value="' + fr[0] + '"' + (s.tasksSort === fr[0] ? ' selected' : '') + '>' + fr[1] + '</option>'; }).join('');
      const catOpts = '<option value="">Все категории</option>' + Store.categories().map(function (c) {
        return '<option value="' + c.id + '"' + (s.tasksCat === c.id ? ' selected' : '') + '>' + U.esc(c.name) + '</option>';
      }).join('');
      const prioOpts = '<option value="">Любой приоритет</option>' + ['high', 'medium', 'low'].map(function (p) {
        return '<option value="' + p + '"' + (s.tasksPrio === p ? ' selected' : '') + '>' + PRIO_LABEL[p] + '</option>';
      }).join('');

      const modeSwitch = '<div class="segment">' +
        '<button data-act="tasks-mode" data-v="list" class="' + (mode === 'list' ? 'active' : '') + '">' + Icons.svg('list', 15) + ' Список</button>' +
        '<button data-act="tasks-mode" data-v="kanban" class="' + (mode === 'kanban' ? 'active' : '') + '">' + Icons.svg('tasks', 15) + ' Канбан</button>' +
      '</div>';

      if (mode === 'kanban') {
        /* канбан: все неархивные задачи, колонки — статусы; статусные фильтры не нужны */
        let kl = Store.tasks();
        if (s.tasksCat) kl = kl.filter(function (t) { return t.categoryId === s.tasksCat; });
        if (s.tasksPrio) kl = kl.filter(function (t) { return t.priority === s.tasksPrio; });
        html += '<div class="section-head" style="margin-top:6px"><h2 class="section-title">Задачи</h2>' +
          '<div class="section-sub">' + kl.length + ' шт.</div></div>';
        html += '<div class="toolbar">' + modeSwitch +
          '<select class="inline" data-act="tasks-cat" title="Категория">' + catOpts + '</select>' +
          '<select class="inline" data-act="tasks-prio" title="Приоритет">' + prioOpts + '</select>' +
          '<select class="inline" data-act="tasks-sort" title="Сортировка">' + sorts + '</select>' +
          '<span class="kanban-tip">Перетаскивайте карточки между колонками, удерживая левую кнопку мыши</span></div>';
        html += this.kanbanHtml(kl);

        /* перерисовка не должна сбрасывать прокрутку ленты и колонок */
        const prevBoard = el.querySelector('.kanban');
        const boardLeft = prevBoard ? prevBoard.scrollLeft : 0;
        const colTops = {};
        el.querySelectorAll('.kcol').forEach(function (c) { colTops[c.getAttribute('data-drop-status')] = c.querySelector('.kcol__body').scrollTop; });
        const viewTop = el.scrollTop;

        el.innerHTML = html;

        const board = el.querySelector('.kanban');
        if (board) board.scrollLeft = boardLeft;
        el.querySelectorAll('.kcol').forEach(function (c) {
          const top = colTops[c.getAttribute('data-drop-status')];
          if (top) c.querySelector('.kcol__body').scrollTop = top;
        });
        if (prevBoard) el.scrollTop = viewTop;
        if (global.Comments) Comments.mount(el);
        return;
      }

      html += '<div class="section-head" style="margin-top:6px"><h2 class="section-title">Задачи</h2>' +
        '<div class="section-sub">' + list.length + ' шт.</div></div>';
      html += '<div class="toolbar">' + modeSwitch + '<div class="segment">' + filters + '</div>' +
        '<select class="inline" data-act="tasks-cat" title="Категория">' + catOpts + '</select>' +
        '<select class="inline" data-act="tasks-prio" title="Приоритет">' + prioOpts + '</select>' +
        '<select class="inline" data-act="tasks-sort" title="Сортировка">' + sorts + '</select></div>';

      /* --- группировка по срокам --- */
      let groups;
      if (f === 'done') {
        const doneList = list.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt; });
        groups = [{ label: 'Выполненные', items: doneList, dateFmt: function (t) { return U.formatShort(t.date); } }];
      } else if (f === 'overdue') {
        groups = [{ label: 'Просроченные', danger: true, items: this.sortTasks(list, s.tasksSort), dateFmt: function (t) { return U.relativeDayLabel(t.date); } }];
      } else {
        const past = function (t) { return U.diffDays(today, t.date) > 0; };
        const ahead = function (t) { return U.diffDays(t.date, today); };
        groups = [
          { label: 'Просроченные', danger: true, items: list.filter(function (t) { return !t.done && t.status !== 'cancelled' && past(t); }), dateFmt: function (t) { return U.relativeDayLabel(t.date); } },
          { label: 'Сегодня', items: list.filter(function (t) { return t.date === today; }), hideDate: true },
          { label: 'Завтра', items: list.filter(function (t) { return t.date === tomorrow; }), hideDate: true },
          { label: 'Следующие 7 дней', items: list.filter(function (t) { const d = ahead(t); return d >= 2 && d <= 7; }), dateFmt: function (t) { return U.formatShort(t.date); } },
          { label: 'Позже', items: list.filter(function (t) { return ahead(t) > 7; }), dateFmt: function (t) { return U.formatShort(t.date); } },
          { label: 'Раньше (отменённые)', items: list.filter(function (t) { return !t.done && t.status === 'cancelled' && past(t); }), dateFmt: function (t) { return U.formatShort(t.date); } }
        ];
      }

      let shown = 0;
      groups.forEach(function (g) {
        if (!g.items.length) return;
        shown += g.items.length;
        const items = f === 'done' ? g.items : Views.sortTasks(g.items, s.tasksSort);
        html += '<div class="day-group"><div class="day-group__head">' +
          '<span class="day-group__title"' + (g.danger ? ' style="color:var(--red)"' : '') + '>' + g.label + '</span>' +
          '<span class="day-group__badge">' + items.length + '</span><span class="day-group__line"></span></div>' +
          '<div class="task-list">' + items.map(function (t) {
            return Views.taskCard(t, g.hideDate ? { hideDate: true } : { dateLabel: g.dateFmt(t) });
          }).join('') + '</div></div>';
      });

      if (!shown) {
        html += Store.tasks().length
          ? this.emptyState('Ничего не найдено', 'Попробуйте выбрать другой фильтр.')
          : this.emptyState('Задач пока нет', 'Введите название в строке выше и нажмите Enter — задача появится в списке на сегодня.');
      }

      el.innerHTML = html;

      /* --- свободные комментарии --- */
      if (global.Comments) Comments.mount(el);
    },

    /* ==================== КАЛЕНДАРЬ ==================== */
    renderCalendar(el) {
      const s = this.state;
      const today = U.todayKey();
      if (!s.calAnchor) s.calAnchor = today;
      const anchor = U.parseDateKey(s.calAnchor) || new Date();
      const firstDay = Store.settings().firstDay;

      const titleBtns =
        '<div class="segment" style="margin-right:6px">' +
          ['month', 'week', 'day'].map(function (m) {
            const lbl = { month: 'Месяц', week: 'Неделя', day: 'День' }[m];
            return '<button data-act="cal-mode" data-v="' + m + '" class="' + (s.calMode === m ? 'active' : '') + '">' + lbl + '</button>';
          }).join('') +
        '</div>' +
        '<button class="icon-btn" data-act="cal-prev" title="Назад">' + Icons.svg('left') + '</button>' +
        '<button class="btn btn--ghost btn--sm" data-act="cal-today">Сегодня</button>' +
        '<button class="icon-btn" data-act="cal-next" title="Вперёд">' + Icons.svg('right') + '</button>';

      let label = '', body = '';
      const tasks = Store.tasks();
      const byDate = {};
      tasks.forEach(function (t) { (byDate[t.date] = byDate[t.date] || []).push(t); });

      const evPill = function (t) {
        const c = Store.category(t.categoryId);
        return '<button class="cal-ev-pill' + (t.done ? ' done' : '') + '" data-act="open" data-id="' + t.id + '" style="border-left-color:' + (c ? c.color : 'var(--accent)') + '">' +
          (t.timeStart ? '<b>' + U.esc(U.formatTime(t.timeStart, Store.settings().timeFormat === 12)) + '</b>' : '') +
          '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U.esc(t.title) + '</span></button>';
      };

      if (s.calMode === 'month') {
        const y = anchor.getFullYear(), m = anchor.getMonth();
        label = U.monthLabel(y, m);
        const first = new Date(y, m, 1);
        const start = U.startOfWeek(U.toDateKey(first), firstDay);
        const weekdays = [];
        for (let i = 0; i < 7; i++) weekdays.push(U.WEEKDAYS_SHORT[(i + firstDay) % 7]);
        let cells = weekdays.map(function (w) { return '<div class="cal-weekday">' + w + '</div>'; }).join('');
        const startD = U.parseDateKey(start);
        for (let i = 0; i < 42; i++) {
          const d = new Date(startD); d.setDate(startD.getDate() + i);
          const dk = U.toDateKey(d);
          const out = d.getMonth() !== m;
          const dayTasks = (byDate[dk] || []).sort(function (a, b) { return (a.timeStart || '99') < (b.timeStart || '99') ? -1 : 1; });
          let evs = dayTasks.slice(0, 3).map(function (t) {
            const c = Store.category(t.categoryId);
            return '<button class="cal-cell__ev' + (t.done ? ' done' : '') + '" data-act="open" data-id="' + t.id + '" style="background:' + (c ? c.color : 'var(--accent)') + '" title="' + U.esc(t.title) + '">' +
              (t.timeStart ? U.esc(U.formatTime(t.timeStart, Store.settings().timeFormat === 12)) + ' ' : '') + U.esc(t.title) + '</button>';
          }).join('');
          if (dayTasks.length > 3) evs += '<button class="cal-cell__more" data-act="cal-open-day" data-date="' + dk + '">ещё ' + (dayTasks.length - 3) + '</button>';
          cells += '<div class="cal-cell' + (out ? ' cal-cell--out' : '') + (dk === today ? ' cal-cell--today' : '') + '" data-act="cal-new" data-date="' + dk + '" role="button" tabindex="0" aria-label="' + U.formatLong(dk) + '">' +
            '<span class="cal-cell__num">' + d.getDate() + '</span>' + evs + '</div>';
        }
        body = '<div class="cal-grid">' + cells + '</div>' + this.catLegend();
      } else if (s.calMode === 'week') {
        const ws = U.startOfWeek(U.toDateKey(anchor), firstDay);
        const we = U.addDays(ws, 6);
        label = U.formatShort(ws) + ' – ' + U.formatShort(we);
        if (window.matchMedia('(max-width:900px)').matches) {
          /* мобильный адаптированный список */
          let rows = '';
          for (let i = 0; i < 7; i++) {
            const dk = U.addDays(ws, i);
            const dayTasks = (byDate[dk] || []);
            rows += '<div class="cal-week__row"><div class="cal-week__day' + (dk === today ? ' today' : '') + '" data-act="cal-new" data-date="' + dk + '" style="background:none;border:none">' +
              U.relativeDayLabel(dk) + '<small>' + U.WEEKDAYS_FULL[U.weekdayOf(dk)] + '</small></div>' +
              '<div class="cal-week__evs">' + (dayTasks.length ? dayTasks.map(evPill).join('') : '<span class="section-sub">—</span>') +
              '<button class="btn btn--ghost btn--sm" data-act="cal-new" data-date="' + dk + '" style="align-self:flex-start">' + Icons.svg('plus', 14) + '</button></div></div>';
          }
          body = '<div class="cal-week">' + rows + '</div>';
        } else {
          let head = '', cols = '';
          for (let i = 0; i < 7; i++) {
            const dk = U.addDays(ws, i);
            head += '<div class="cal-weekday">' + U.WEEKDAYS_SHORT[(i + firstDay) % 7] + ' ' + U.parseDateKey(dk).getDate() + '</div>';
            const dayTasks = (byDate[dk] || []);
            cols += '<div style="min-width:0">' + (dayTasks.length ? dayTasks.map(evPill).join('') : '') +
              '<button class="cal-cell__more" data-act="cal-new" data-date="' + dk + '">+ добавить</button></div>';
          }
          body = '<div class="cal-grid" style="grid-template-columns:repeat(7,1fr);align-items:start">' + head + cols + '</div>';
        }
      } else {
        const dk = U.toDateKey(anchor);
        label = U.formatLong(dk);
        const dayTasks = (byDate[dk] || []);
        body = dayTasks.length
          ? '<div class="task-list">' + dayTasks.map(function (t) { return Views.taskCard(t, { hideDate: true }); }).join('') + '</div>'
          : this.emptyState('На эту дату задач нет', 'Добавьте задачу на выбранный день.', false);
        body += '<div style="margin-top:14px"><button class="btn btn--primary" data-act="cal-new" data-date="' + dk + '">' + Icons.svg('plus') + 'Добавить задачу на этот день</button></div>';
      }

      el.innerHTML = '<div class="section-head"><h1 class="section-title" style="min-width:220px">' + U.esc(label) + '</h1><div class="spacer"></div>' + titleBtns + '</div>' +
        '<div class="panel">' + body + '</div>';
    },

    catLegend() {
      return '<div class="legend">' + Store.categories().map(function (c) {
        return '<span><i style="background:' + c.color + '"></i>' + U.esc(c.name) + '</span>';
      }).join('') + '</div>';
    },

    /* ==================== ПРИВЫЧКИ ==================== */
    renderHabits(el) {
      const habits = Store.habits();
      const firstDay = Store.settings().firstDay;
      const today = U.todayKey();
      const ws = U.startOfWeek(today, firstDay);

      let html = '<div class="section-head"><h1 class="section-title">Привычки</h1><div class="spacer"></div>' +
        '<button class="btn btn--primary" data-act="new-habit">' + Icons.svg('plus') + 'Новая привычка</button></div>';

      if (!habits.length) {
        html += '<div class="empty">' + Icons.svg('habits', 66) +
          '<div class="empty__title">Привычек пока нет</div>' +
          '<div class="empty__text">Создайте привычку — например, «Читать 20 минут» или «Делать зарядку», — и отмечайте выполнение по дням.</div>' +
          '<button class="btn btn--primary" data-act="new-habit">' + Icons.svg('plus') + 'Создать привычку</button></div>' +
          '<div class="panel" style="margin-top:6px"><h2 class="panel__title">' + Icons.svg('info', 17) + 'Идеи для старта</h2><div class="legend">' +
          ['Читать 20 минут', 'Делать зарядку', 'Изучать язык', 'Пить достаточно воды', 'Делать перерывы в работе']
            .map(function (x) { return '<span style="background:var(--bg-elev-2);border-radius:20px;padding:5px 12px">' + x + '</span>'; }).join('') + '</div></div>';
        el.innerHTML = html; return;
      }

      const freqLbl = { daily: 'Ежедневно', weekdays: 'По будням', weekends: 'По выходным' };

      habits.forEach(function (h) {
        const week = [];
        for (let i = 0; i < 7; i++) {
          const dk = U.addDays(ws, i);
          const sched = Store.habitScheduled(h, dk);
          const checked = !!h.completions[dk];
          const future = U.diffDays(dk, today) > 0;
          const missed = !checked && sched && U.diffDays(today, dk) > 0;
          const d = U.parseDateKey(dk);
          week.push('<button class="habit-day' + (checked ? ' checked' : '') + (missed ? ' past-missed' : '') + '"' +
            ' data-act="habit-toggle" data-id="' + h.id + '" data-date="' + dk + '"' + (future && !checked ? ' disabled' : '') +
            (checked ? ' style="background:' + h.color + '"' : '') + ' title="' + U.formatShort(dk) + '">' +
            '<small>' + U.WEEKDAYS_SHORT[d.getDay()] + '</small>' + d.getDate() + (checked ? ' ✓' : '') + '</button>');
        }
        const totalDone = Object.keys(h.completions).length;
        const streak = Store.habitStreak(h, today);
        const best = Store.habitBestStreak(h);

        /* история за 28 дней */
        let hist = '';
        for (let i = 27; i >= 0; i--) {
          const dk = U.addDays(today, -i);
          const on = !!h.completions[dk];
          const sched = Store.habitScheduled(h, dk);
          hist += '<i class="' + (on ? 'on' : (sched ? 'sched' : '')) + '" title="' + U.formatShort(dk) + '" style="' + (on ? 'background:' + h.color : '') + '"></i>';
        }

        html += '<div class="panel habit-card" data-habit="' + h.id + '">' +
          '<div class="habit-card__top">' +
            '<span class="habit-card__name"><span class="dot" style="background:' + h.color + '"></span>' + U.esc(h.name) + '</span>' +
            '<span class="chip chip--cat">' + freqLbl[h.freq] + '</span>' +
            '<div class="spacer"></div>' +
            '<button class="icon-btn" data-act="edit-habit" data-id="' + h.id + '" title="Редактировать">' + Icons.svg('edit', 15) + '</button>' +
            '<button class="icon-btn danger" data-act="delete-habit" data-id="' + h.id + '" title="Удалить">' + Icons.svg('trash', 15) + '</button>' +
          '</div>' +
          '<div class="habit-week">' + week.join('') + '</div>' +
          '<div class="habit-stats">' +
            '<div class="habit-stat"><b>' + streak + '</b>серия дней</div>' +
            '<div class="habit-stat"><b>' + best + '</b>лучшая серия</div>' +
            '<div class="habit-stat"><b>' + totalDone + '</b>всего отметок</div>' +
          '</div>' +
          '<div><div class="section-sub" style="margin-bottom:6px">История за 28 дней</div><div class="habit-history">' + hist + '</div></div>' +
        '</div>';
      });

      el.innerHTML = html;
    },

    /* ==================== СТАТИСТИКА ==================== */
    renderStats(el) {
      const range = this.state.statsRange;
      const st = Store.statsFor(range);

      const ranges = [['7d', '7 дней'], ['30d', '30 дней'], ['month', 'Текущий месяц'], ['all', 'Всё время']]
        .map(function (r) { return '<button data-act="stats-range" data-v="' + r[0] + '" class="' + (range === r[0] ? 'active' : '') + '">' + r[1] + '</button>'; }).join('');

      let html = '<div class="section-head"><h1 class="section-title">Статистика</h1><div class="spacer"></div><div class="segment">' + ranges + '</div></div>';

      html += '<div class="stats-grid">' +
        '<div class="stat-chip"><div class="stat-chip__value">' + st.total + '</div><div class="stat-chip__label">всего задач</div></div>' +
        '<div class="stat-chip stat-chip--green"><div class="stat-chip__value">' + st.doneCount + '</div><div class="stat-chip__label">выполнено</div></div>' +
        '<div class="stat-chip stat-chip--accent"><div class="stat-chip__value">' + st.pct + '%</div><div class="stat-chip__label">выполнение</div></div>' +
        '<div class="stat-chip"><div class="stat-chip__value" style="color:var(--red)">' + st.overdueCount + '</div><div class="stat-chip__label">просрочено</div></div>' +
      '</div>';

      /* динамика по дням */
      html += '<div class="panel chart-panel"><h3>Динамика выполнения по дням</h3>' + this.barChart(st.series) +
        '<div class="legend"><span><i style="background:var(--accent)"></i>Всего задач</span><span><i style="background:var(--green)"></i>Выполнено</span></div></div>';

      /* категории */
      const catData = Object.keys(st.byCat).map(function (cid) {
        const c = Store.category(cid);
        return { label: c ? c.name : '—', value: st.byCat[cid], color: c ? c.color : '#8b949e' };
      }).sort(function (a, b) { return b.value - a.value; });
      html += '<div class="panel chart-panel"><h3>Распределение по категориям</h3>' + (catData.length ? this.hBarChart(catData) : '<div class="section-sub">Нет данных за период</div>') + '</div>';

      /* приоритеты + дни недели */
      const prioData = [
        { label: 'Высокий', value: st.byPrio.high || 0, color: 'var(--red)' },
        { label: 'Средний', value: st.byPrio.medium || 0, color: 'var(--amber)' },
        { label: 'Низкий', value: st.byPrio.low || 0, color: 'var(--gray-pill)' }
      ];
      const wdSorted = st.weekdayRates.slice().sort(function (a, b) { return b.rate - a.rate; });
      const wdNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      const bestDay = wdSorted.length && wdSorted[0].total ? 'Самый продуктивный день: <b>' + U.WEEKDAYS_FULL[wdSorted[0].wd] + '</b> (' + Math.round(wdSorted[0].rate * 100) + '% выполнено)' : 'Недостаточно данных';
      const wdData = st.weekdayRates.map(function (w) {
        return { label: wdNames[w.wd], value: Math.round(w.rate * 100), color: 'var(--accent)' };
      });

      html += '<div class="settings-grid">' +
        '<div class="panel chart-panel" style="margin:0"><h3>По приоритетам</h3>' + this.hBarChart(prioData) + '</div>' +
        '<div class="panel chart-panel" style="margin:0"><h3>Выполнение по дням недели, %</h3>' + this.hBarChart(wdData, true) + '<div class="section-sub" style="margin-top:10px">' + bestDay + '</div></div>' +
      '</div>';

      el.innerHTML = html;
    },

    barChart(series) {
      if (!series.length) return '<div class="section-sub">Нет данных за период</div>';
      const W = 720, H = 180, pad = 26;
      const max = Math.max(1, Math.max.apply(null, series.map(function (s) { return s.total; })));
      const n = series.length;
      const gap = Math.max(2, Math.min(10, (W - pad * 2) / n * 0.25));
      const bw = Math.max(3, (W - pad * 2) / n - gap);
      let bars = '', labels = '';
      series.forEach(function (s, i) {
        const x = pad + i * ((W - pad * 2) / n);
        const hT = (s.total / max) * (H - pad);
        const hD = (s.done / max) * (H - pad);
        bars += '<rect x="' + x + '" y="' + (H - pad - hT) + '" width="' + bw + '" height="' + hT + '" rx="3" fill="var(--accent)" opacity=".38"><title>' + U.formatShort(s.key) + ': ' + s.total + '</title></rect>';
        bars += '<rect x="' + x + '" y="' + (H - pad - hD) + '" width="' + bw + '" height="' + hD + '" rx="3" fill="var(--green)"><title>' + U.formatShort(s.key) + ': выполнено ' + s.done + '</title></rect>';
        const d = U.parseDateKey(s.key);
        if (n <= 10 || i % Math.ceil(n / 10) === 0) {
          labels += '<text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" font-size="10" fill="var(--text-faint)" text-anchor="middle">' + d.getDate() + '.' + U.pad2(d.getMonth() + 1) + '</text>';
        }
      });
      return '<svg class="bar-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
        '<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="var(--border)"/>' +
        bars + labels + '</svg>';
    },

    hBarChart(data, isPct) {
      const max = Math.max(1, Math.max.apply(null, data.map(function (d) { return d.value; })));
      return '<div style="display:flex;flex-direction:column;gap:9px">' + data.map(function (d) {
        const w = Math.round(d.value / max * 100);
        return '<div style="display:flex;align-items:center;gap:10px;font-size:13px">' +
          '<span style="width:86px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U.esc(d.label) + '</span>' +
          '<span style="flex:1;height:16px;background:var(--bg-elev-2);border-radius:8px;overflow:hidden">' +
          '<span style="display:block;height:100%;width:' + w + '%;background:' + d.color + ';border-radius:8px;transition:width .4s ease"></span></span>' +
          '<b style="width:42px;text-align:right">' + d.value + (isPct ? '%' : '') + '</b></div>';
      }).join('') + '</div>';
    },

    /* ==================== АРХИВ ==================== */
    renderArchive(el) {
      const archived = Store.data.tasks.filter(function (t) { return t.archived; })
        .sort(function (a, b) { return (b.doneAt || 0) - (a.doneAt || 0); });

      const days = Store.settings().autoArchiveDays;
      let html = '<div class="section-head"><h1 class="section-title">Архив</h1><div class="section-sub">' + archived.length + ' задач</div><div class="spacer"></div></div>';

      if (days > 0 && !App._archiveDismissed) {
        const candidates = Store.tasks().filter(function (t) { return t.done && U.diffDays(U.todayKey(), t.date) >= days; });
        if (candidates.length) {
          html += '<div class="bulk-bar">' + Icons.svg('archive', 16) +
            '<span>Выполнено задач старше ' + days + ' дн.: <b>' + candidates.length + '</b>. Предложить архивировать?</span><div class="spacer"></div>' +
            '<button class="btn btn--sm btn--primary" data-act="archive-suggest-yes">Архивировать</button>' +
            '<button class="btn btn--sm btn--ghost" data-act="archive-suggest-no">Не сейчас</button></div>';
        }
      }

      if (!archived.length) {
        html += this.emptyState('Архив пуст', 'Выполненные задачи можно убирать в архив кнопкой «В архив» на карточке — история и статистика сохранятся.', false);
      } else {
        html += '<div class="task-list">' + archived.map(function (t) { return Views.taskCard(t, { archive: true }); }).join('') + '</div>';
      }
      el.innerHTML = html;
    },

    /* ==================== НАСТРОЙКИ ==================== */
    renderSettings(el) {
      const s = Store.settings();
      const sw = function (key, checked) {
        return '<label class="switch"><input type="checkbox" data-act="set-toggle" data-key="' + key + '"' + (checked ? ' checked' : '') + '><i></i></label>';
      };

      const catRows = Store.categories().map(function (c) {
        return '<div class="cat-row" data-cat="' + c.id + '">' +
          '<input type="color" data-act="cat-color" data-id="' + c.id + '" value="' + c.color + '" title="Цвет категории">' +
          '<input type="text" data-act="cat-name" data-id="' + c.id + '" value="' + U.esc(c.name) + '" maxlength="40">' +
          '<button class="icon-btn danger" data-act="cat-delete" data-id="' + c.id + '" title="Удалить категорию">' + Icons.svg('trash', 15) + '</button>' +
        '</div>';
      }).join('');

      el.innerHTML =
        '<div class="section-head"><button type="button" class="btn btn--sm btn--ghost" data-act="settings-back" aria-label="Назад">' + Icons.svg('left', 16) + 'Назад</button>' +
          '<h1 class="section-title">Настройки</h1></div>' +
        '<div class="settings-grid">' +

        '<div class="panel"><h2 class="panel__title">' + Icons.svg('sun', 17) + 'Внешний вид и время</h2>' +
          '<div class="set-row"><div><div class="set-row__label">Тёмная тема</div><div class="set-row__hint">Светлая или тёмная, выбор сохраняется</div></div>' + sw('darkTheme', s.theme === 'dark') + '</div>' +
          '<div class="set-row"><div><div class="set-row__label">Первый день недели</div></div>' +
            '<select class="inline" data-act="set-select" data-key="firstDay"><option value="1"' + (s.firstDay === 1 ? ' selected' : '') + '>Понедельник</option><option value="0"' + (s.firstDay === 0 ? ' selected' : '') + '>Воскресенье</option></select></div>' +
          '<div class="set-row"><div><div class="set-row__label">Формат времени</div></div>' +
            '<select class="inline" data-act="set-select" data-key="timeFormat"><option value="24"' + (s.timeFormat === 24 ? ' selected' : '') + '>24-часовой</option><option value="12"' + (s.timeFormat === 12 ? ' selected' : '') + '>12-часовой</option></select></div>' +
          '<div class="set-row"><div><div class="set-row__label">Рабочий день</div><div class="set-row__hint">Используется как ориентир планирования</div></div>' +
            '<div style="display:flex;gap:6px;align-items:center"><input type="time" class="date-input" data-act="set-time" data-key="workStart" value="' + s.workStart + '"><span>—</span><input type="time" class="date-input" data-act="set-time" data-key="workEnd" value="' + s.workEnd + '"></div></div>' +
        '</div>' +

        '<div class="panel"><h2 class="panel__title">' + Icons.svg('bell', 17) + 'Уведомления</h2>' +
          '<div class="set-row"><div><div class="set-row__label">Показывать напоминания</div><div class="set-row__hint">Работает только при открытой странице «Мой планер». Разрешение запрашивается при включении.</div></div>' + sw('notifications', s.notifications) + '</div>' +
          '<div class="set-row"><div><div class="set-row__label">Статус разрешения браузера</div><div class="set-row__hint" id="notifPermStatus">' + U.esc(App.notifPermText()) + '</div></div>' +
            '<button class="btn btn--sm btn--ghost" data-act="notif-request">Запросить</button></div>' +
          '<div class="set-row"><div><div class="set-row__label">Предлагать архивировать завершённые старше</div><div class="set-row__hint">0 — не предлагать</div></div>' +
            '<select class="inline" data-act="set-select" data-key="autoArchiveDays">' + [0, 3, 7, 14, 30].map(function (n) { return '<option value="' + n + '"' + (s.autoArchiveDays === n ? ' selected' : '') + '>' + (n === 0 ? 'Выкл.' : n + ' дн.') + '</option>'; }).join('') + '</select></div>' +
        '</div>' +

        '<div class="panel"><h2 class="panel__title">' + Icons.svg('folder', 17) + 'Категории</h2>' +
          catRows +
          '<div style="display:flex;gap:8px;margin-top:12px">' +
            '<input type="color" id="newCatColor" value="#4585f5" style="width:40px;height:36px;border:1px solid var(--border);border-radius:8px;background:transparent;padding:2px;cursor:pointer">' +
            '<input type="text" id="newCatName" placeholder="Название новой категории" maxlength="40" style="flex:1;background:var(--bg-elev-2);border:1px solid var(--border);border-radius:8px;padding:8px 12px">' +
            '<button class="btn btn--sm btn--primary" data-act="cat-add">Добавить</button>' +
          '</div>' +
        '</div>' +

        '<div class="panel"><h2 class="panel__title">' + Icons.svg('db', 17) + 'Данные</h2>' +
          '<div class="set-row"><div><div class="set-row__label">Локальное хранилище</div><div class="set-row__hint" id="setStorageInfo">—</div></div></div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
            '<button class="btn btn--sm" data-act="export-json">' + Icons.svg('download', 15) + 'Экспорт JSON</button>' +
            '<button class="btn btn--sm" data-act="export-csv">' + Icons.svg('download', 15) + 'Экспорт CSV</button>' +
            '<button class="btn btn--sm" data-act="backup">' + Icons.svg('copy', 15) + 'Резервная копия</button>' +
            '<button class="btn btn--sm" data-act="import-json">' + Icons.svg('upload', 15) + 'Импорт JSON</button>' +
            '<button class="btn btn--sm btn--danger" data-act="reset-data">' + Icons.svg('trash', 15) + 'Сбросить всё</button>' +
          '</div>' +
          '<div class="set-row__hint" style="margin-top:10px">Версия схемы данных: ' + Store.data.version + '. Данные не отправляются на внешние серверы.</div>' +
        '</div>' +

        '<div class="panel"><h2 class="panel__title">' + Icons.svg('info', 17) + 'О приложении</h2>' +
          '<div class="set-row"><div><div class="set-row__label">Мой планер</div>' +
            '<div class="set-row__hint">Версия ' + U.esc(AppInfo.version) + ' · ' + U.esc(AppInfo.date) + '</div></div>' +
            '<button class="btn btn--sm btn--ghost" data-act="whats-new">Что нового</button></div>' +
        '</div>' +

        '</div>';

      const info = document.getElementById('setStorageInfo');
      if (info) info.textContent = U.bytes(Store.storageSize()) + ' · задач: ' + Store.data.tasks.length + ' · привычек: ' + Store.habits().length;
    }
  };

  global.Views = Views;
  global.PRIO_LABEL = PRIO_LABEL;
  global.REPEAT_LABEL = REPEAT_LABEL;
})(window);
