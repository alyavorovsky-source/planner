/* Мой планер — приложение: роутинг, модалки, поиск, хоткеи, уведомления */
(function (global) {
  'use strict';

  const NAV = [
    { id: 'tasks', label: 'Задачи', icon: 'tasks' },
    { id: 'calendar', label: 'Календарь', icon: 'calendar' },
    { id: 'meetings', label: 'Планерки', icon: 'users' },
    { id: 'stats', label: 'Статистика', icon: 'stats' },
    { id: 'archive', label: 'Архив', icon: 'archive' }
  ];

  const App = {
    view: 'tasks',

    /* ==================== Инициализация ==================== */
    init() {
      Store.load();
      this.applyTheme(Store.settings().theme);
      this.buildNav();
      this.bindStatic();
      Icons.hydrate(document);
      /* прежние разделы «Сегодня», «Предстоящие» и «Все задачи» теперь одна страница «Задачи» */
      const legacy = { today: 'tasks', upcoming: 'tasks', all: 'tasks', habits: 'tasks' };
      this.view = Store.data.ui.lastView || 'tasks';
      if (legacy[this.view]) this.view = legacy[this.view];
      if (!NAV.some(function (n) { return n.id === App.view; }) && this.view !== 'settings') this.view = 'tasks';
      this.render();
      this.updateHeader();
      this.updateStorageInfo();
      this.updateVersion();
      this.startReminders();
      this.checkOverdueOnStart();
      if (global.WhatsNew) WhatsNew.maybeShow();
    },

    /* ==================== Тема ==================== */
    applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      /* цвет системной панели браузера и установленного приложения следует теме */
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', theme === 'dark' ? '#15161c' : '#f4f5fa');
      const icon = document.getElementById('themeIcon');
      const label = document.getElementById('themeLabel');
      if (icon) icon.innerHTML = Icons.svg(theme === 'dark' ? 'sun' : 'moon');
      if (label) label.textContent = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
    },

    toggleTheme() {
      const next = Store.settings().theme === 'dark' ? 'light' : 'dark';
      Store.setSetting('theme', next);
      this.applyTheme(next);
    },

    /* ==================== Навигация ==================== */
    buildNav() {
      const nav = document.getElementById('nav');
      const counts = {
        tasks: function () { return Store.tasks().filter(function (t) { return !t.done && t.status !== 'cancelled'; }).length; },
        meetings: function () {
          const today = U.todayKey();
          return Store.topics().filter(function (x) { return !x.done && x.date >= today; }).length;
        },
        archive: function () { return Store.data.tasks.filter(function (t) { return t.archived; }).length; }
      };
      nav.innerHTML = NAV.map(function (n) {
        let c = '';
        if (counts[n.id]) {
          const v = counts[n.id]();
          if (v) c = '<span class="nav-item__count">' + v + '</span>';
        }
        return '<button class="nav-item" data-nav="' + n.id + '" type="button">' +
          '<span class="nav-item__icon">' + Icons.svg(n.icon) + '</span>' +
          '<span class="nav-item__text">' + n.label + '</span>' + c + '</button>';
      }).join('');
      this.markActive();
    },

    markActive() {
      document.querySelectorAll('[data-nav]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-nav') === App.view);
      });
    },

    go(view) {
      /* запоминаем, откуда пришли в настройки, чтобы кнопка «Назад» вернула на то же место */
      if (view === 'settings' && this.view !== 'settings') this.prevView = this.view;
      this.view = view;
      Store.data.ui.lastView = view;
      Store.save();
      this.closeSidebar();
      this.render();
      this.markActive();
      document.getElementById('view').scrollTop = 0;
    },

    render() {
      this.buildNav();
      this.updateHeader();
      const el = document.getElementById('view');
      const map = {
        tasks: 'renderTasks', calendar: 'renderCalendar',
        meetings: 'renderMeetings', stats: 'renderStats',
        archive: 'renderArchive', settings: 'renderSettings'
      };
      const fn = Views[map[this.view] || 'renderTasks'];
      fn.call(Views, el);
      if (this.view === 'settings') this.updateStorageInfo();
    },

    updateHeader() {
      document.getElementById('greeting').textContent = U.greeting() + '!';
      document.getElementById('topDate').textContent = U.formatLong(U.todayKey());
    },

    updateVersion() {
      const el = document.getElementById('appVersion');
      if (el) el.textContent = 'Версия ' + AppInfo.version + ' · ' + AppInfo.date;
    },

    updateStorageInfo() {
      const el = document.getElementById('storageInfo');
      if (el) el.textContent = 'Локальное хранилище: ' + U.bytes(Store.storageSize()) + '. Данные не покидают ваш браузер.';
      const si = document.getElementById('setStorageInfo');
      if (si) si.textContent = U.bytes(Store.storageSize()) + ' · задач: ' + Store.data.tasks.length;
    },

    /* ==================== Мобильное меню ==================== */
    openSidebar() {
      document.getElementById('sidebar').classList.add('open');
      document.getElementById('sidebarBackdrop').classList.add('show');
    },
    closeSidebar() {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarBackdrop').classList.remove('show');
    },

    /* ==================== Тосты ==================== */
    toast(msg, type, undoFn) {
      const box = document.getElementById('toasts');
      const el = document.createElement('div');
      el.className = 'toast toast--' + (type || 'info');
      const icon = { success: 'checkCircle', error: 'alert', warn: 'alert', info: 'info' }[type || 'info'];
      el.innerHTML = Icons.svg(icon, 17) + '<span class="toast__msg">' + U.esc(msg) + '</span>' +
        (undoFn ? '<button class="toast__undo">Отменить</button>' : '');
      box.appendChild(el);
      let removed = false;
      const kill = function () {
        if (removed) return;
        removed = true;
        el.classList.add('out');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
      };
      const timer = setTimeout(kill, undoFn ? 6000 : 3200);
      if (undoFn) {
        el.querySelector('.toast__undo').addEventListener('click', function () {
          clearTimeout(timer);
          undoFn();
          kill();
        });
      }
    },

    /* ==================== Модальные окна ==================== */
    _modalCleanup: null,
    openModal(title, bodyHtml, footerHtml, opts) {
      opts = opts || {};
      const root = document.getElementById('modalRoot');
      document.getElementById('modalTitle').textContent = title;
      document.getElementById('modalBody').innerHTML = bodyHtml;
      document.getElementById('modalFooter').innerHTML = footerHtml || '';
      const box = document.getElementById('modalBox');
      box.classList.toggle('modal--wide', !!opts.wide);
      root.hidden = false;
      document.body.style.overflow = 'hidden';
      const first = root.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,select,button');
      if (first) setTimeout(function () { first.focus(); }, 60);
    },

    closeModal() {
      const root = document.getElementById('modalRoot');
      if (root.hidden) return;
      root.hidden = true;
      document.body.style.overflow = '';
      if (this._modalCleanup) { this._modalCleanup(); this._modalCleanup = null; }
    },

    confirm(title, text, okLabel, danger) {
      return new Promise(function (resolve) {
        App.openModal(title,
          '<div class="confirm-text">' + text + '</div>',
          '<button class="btn btn--ghost" data-modal="cancel">Отмена</button>' +
          '<button class="btn ' + (danger ? 'btn--danger' : 'btn--primary') + '" data-modal="ok">' + U.esc(okLabel || 'Подтвердить') + '</button>');
        const root = document.getElementById('modalRoot');
        const handler = function (e) {
          const b = e.target.closest('[data-modal]');
          if (!b) return;
          root.removeEventListener('click', handler);
          App._modalCleanup = null; /* иначе cleanup резолвнул бы false вместо результата */
          App.closeModal();
          resolve(b.getAttribute('data-modal') === 'ok');
        };
        root.addEventListener('click', handler);
        App._modalCleanup = function () { root.removeEventListener('click', handler); resolve(false); };
      });
    },

    /* ---------- Форма задачи ---------- */
    openTaskForm(taskId, presetDate) {
      const t = taskId ? Store.task(taskId) : null;
      const cats = Store.categories();
      const s = Store.settings();
      const v = t || {
        title: '', desc: '', date: presetDate || U.todayKey(),
        priority: 'medium', categoryId: cats[0] ? cats[0].id : 'other',
        repeat: 'none', remind: 'none', remindAt: '', remindRepeat: 0, isMain: false, status: 'new'
      };
      const curStatus = t ? Store.statusOf(t) : 'new';

      const catOpts = cats.map(function (c) {
        return '<option value="' + c.id + '"' + (v.categoryId === c.id ? ' selected' : '') + '>' + U.esc(c.name) + '</option>';
      }).join('');

      const body =
        '<form id="taskForm" novalidate>' +
        '<div class="form-grid">' +
          '<label class="field full">Название задачи *<input type="text" name="title" maxlength="160" value="' + U.esc(v.title) + '" placeholder="Например: подготовить отчёт" required></label>' +
          '<label class="field full">Описание<textarea name="desc" maxlength="2000" placeholder="Детали, ссылки, заметки…">' + U.esc(v.desc) + '</textarea></label>' +
          '<label class="field">Дата выполнения<input type="date" name="date" value="' + U.esc(v.date) + '"></label>' +
          '<label class="field">Категория<select name="categoryId">' + catOpts + '</select></label>' +
          '<label class="field full">Приоритет<div class="prio-picker" id="prioPicker">' +
            ['low', 'medium', 'high'].map(function (p) {
              return '<button type="button" data-v="' + p + '" class="' + (v.priority === p ? 'active' : '') + '"><span class="dot"></span>' + PRIO_LABEL[p] + '</button>';
            }).join('') +
          '</div></label>' +
          '<label class="field">Статус<select name="status">' +
            Store.STATUSES.map(function (st) { return '<option value="' + st.id + '"' + (curStatus === st.id ? ' selected' : '') + '>' + st.label + '</option>'; }).join('') +
          '</select></label>' +
          '<label class="field">Повторение<select name="repeat">' +
            Object.keys(REPEAT_LABEL).map(function (r) { return '<option value="' + r + '"' + (v.repeat === r ? ' selected' : '') + '>' + REPEAT_LABEL[r] + '</option>'; }).join('') +
          '</select></label>' +
          '<label class="field">Напоминание<select name="remind">' +
            [['none', 'Нет'], ['at', 'В указанное время']].map(function (o) { return '<option value="' + o[0] + '"' + (v.remind === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
          '</select></label>' +
          '<label class="field" id="remindAtWrap" style="' + (v.remind === 'at' ? '' : 'display:none') + '">Время напоминания<input type="time" name="remindAt" value="' + U.esc(v.remindAt) + '"></label>' +
          '<label class="field full" id="remindRepeatWrap" style="' + (v.remind === 'at' ? '' : 'display:none') + '">Повторять, пока не изменится статус задачи<select name="remindRepeat">' +
            [[0, 'Не повторять'], [10, 'Каждые 10 минут'], [20, 'Каждые 20 минут'], [30, 'Каждые 30 минут'], [60, 'Каждый час']].map(function (o) { return '<option value="' + o[0] + '"' + (Number(v.remindRepeat) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
          '</select></label>' +
          '<label class="field full" style="flex-direction:row;align-items:center;gap:10px;font-size:14px;color:var(--text);cursor:pointer">' +
            '<input type="checkbox" class="cb" name="isMain"' + (v.isMain ? ' checked' : '') + '> Сделать главной задачей дня</label>' +
          '<div class="form-error full" id="formError"></div>' +
        '</div></form>';

      const footer =
        (t ? '<button class="btn btn--danger left" data-modal="del">' + Icons.svg('trash', 15) + ' Удалить</button>' : '') +
        '<button class="btn btn--ghost" data-modal="cancel">Отмена</button>' +
        '<button class="btn btn--primary" data-modal="save">' + Icons.svg('check', 15) + ' ' + (t ? 'Сохранить' : 'Создать задачу') + '</button>';

      this.openModal(t ? 'Редактирование задачи' : 'Новая задача', body, footer, { wide: true });

      let priority = v.priority;
      const root = document.getElementById('modalRoot');
      root.querySelector('#prioPicker').addEventListener('click', function (e) {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        priority = b.getAttribute('data-v');
        root.querySelectorAll('#prioPicker button').forEach(function (x) { x.classList.toggle('active', x === b); });
      });
      root.querySelector('[name=remind]').addEventListener('change', function (e) {
        root.querySelector('#remindAtWrap').style.display = e.target.value === 'at' ? '' : 'none';
        root.querySelector('#remindRepeatWrap').style.display = e.target.value === 'at' ? '' : 'none';
      });

      const save = function () {
        const fd = new FormData(root.querySelector('#taskForm'));
        const form = {
          title: fd.get('title'), desc: fd.get('desc'), date: fd.get('date'),
          priority: priority, categoryId: fd.get('categoryId'),
          repeat: fd.get('repeat'), remind: fd.get('remind'), remindAt: fd.get('remindAt') || '', remindRepeat: fd.get('remindRepeat') || 0,
          isMain: fd.get('isMain') === 'on',
          status: fd.get('status') || 'new'
        };
        const err = Store.validateTask(form);
        if (err) {
          root.querySelector('#formError').textContent = err;
          return;
        }
        if (form.remind === 'at' && s.notifications && Notification.permission !== 'granted') {
          /* напоминание останется в данных, но доставка невозможна без разрешения */
          App.toast('Разрешение на уведомления не выдано — напоминание не покажется.', 'warn');
        }
        let saved;
        if (t) { saved = Store.updateTask(t.id, form); App.toast('Задача обновлена', 'success'); }
        else { saved = Store.createTask(form); App.toast('Задача создана', 'success'); }
        if (form.isMain && !saved.isMain) App.toast('Можно отметить максимум 3 главные задачи', 'warn');
        App.closeModal();
        App.render();
      };

      const handler = function (e) {
        const b = e.target.closest('[data-modal]');
        if (!b) return;
        const act = b.getAttribute('data-modal');
        if (act === 'save') { save(); return; }
        if (act === 'cancel') { App.closeModal(); return; }
        if (act === 'del') {
          root.removeEventListener('click', handler);
          App.confirm('Удалить задачу?', 'Задача «' + U.esc(t.title) + '» будет удалена безвозвратно.', 'Удалить', true).then(function (ok) {
            if (ok) {
              const snapshot = JSON.parse(JSON.stringify(t));
              Store.deleteTask(t.id);
              App.toast('Задача удалена', 'success', function () {
                Store.data.tasks.push(snapshot); Store.save(); App.render();
              });
              App.render();
            } else {
              /* вернулись к форме */
              App.openTaskForm(t.id);
            }
          });
          return;
        }
      };
      root.addEventListener('click', handler);
      App._modalCleanup = function () { root.removeEventListener('click', handler); };

      root.querySelector('#taskForm').addEventListener('submit', function (e) { e.preventDefault(); save(); });
    },

    /* ==================== Поиск ==================== */
    runSearch(q) {
      const box = document.getElementById('searchResults');
      q = q.trim().toLowerCase();
      if (!q) { box.hidden = true; box.innerHTML = ''; return; }
      const res = Store.tasks().filter(function (t) {
        const cn = (Store.category(t.categoryId) || {}).name || '';
        return t.title.toLowerCase().indexOf(q) >= 0 || (t.desc || '').toLowerCase().indexOf(q) >= 0 || cn.toLowerCase().indexOf(q) >= 0;
      }).slice(0, 8);
      if (!res.length) {
        box.innerHTML = '<div class="search-results__empty">Ничего не найдено по запросу «' + U.esc(q) + '»</div>';
      } else {
        box.innerHTML = res.map(function (t) {
          const c = Store.category(t.categoryId);
          return '<button class="search-results__item" data-act="open" data-id="' + t.id + '">' +
            '<span class="chip__dot" style="background:' + (c ? c.color : 'var(--accent)') + '"></span>' +
            '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U.esc(t.title) + (t.done ? ' ✓' : '') + '</span>' +
            '<span class="search-results__meta">' + U.esc(U.relativeDayLabel(t.date)) + '</span></button>';
        }).join('');
      }
      box.hidden = false;
    },

    hideSearch() {
      const box = document.getElementById('searchResults');
      box.hidden = true;
    },

    /* ==================== Действия с задачами из делегирования ==================== */
    handleAction(act, el) {
      const id = el.getAttribute('data-id');
      const v = el.getAttribute('data-v');
      const self = this;

      switch (act) {
        case 'new-task': this.openTaskForm(null, el.getAttribute('data-date')); break;

        case 'toggle': {
          const r = Store.toggleDone(id);
          if (!r.task) break;
          if (r.task.done) {
            this.toast('Задача выполнена', 'success', function () { Store.toggleDone(id); self.render(); });
            if (r.next) this.toast('Создано повторение на ' + U.formatShort(r.next.date), 'info');
          } else {
            this.toast('Задача возвращена в активные', 'info');
          }
          this.render();
          break;
        }

        case 'open': case 'edit':
          this.openTaskForm(id);
          break;

        case 'main': {
          const ok = Store.toggleMain(id);
          if (!ok) this.toast('Можно отметить максимум 3 главные задачи', 'warn');
          this.render();
          break;
        }

        case 'archive': {
          Store.archiveTask(id);
          this.toast('Задача перемещена в архив', 'success', function () { Store.restoreTask(id); self.render(); });
          this.render();
          break;
        }

        case 'restore':
          Store.restoreTask(id);
          this.toast('Задача восстановлена из архива', 'success');
          this.render();
          break;

        case 'purge': {
          const t = Store.task(id);
          if (!t) break;
          this.confirm('Удалить навсегда?', 'Задача «' + U.esc(t.title) + '» будет удалена безвозвратно вместе с историей.', 'Удалить навсегда', true)
            .then(function (ok) { if (ok) { Store.deleteTask(id); self.toast('Удалено', 'success'); self.render(); } });
          break;
        }

        case 'delete': {
          const t = Store.task(id);
          if (!t) break;
          this.confirm('Удалить задачу?', 'Задача «' + U.esc(t.title) + '» будет удалена безвозвратно.', 'Удалить', true)
            .then(function (ok) {
              if (!ok) return;
              const snapshot = JSON.parse(JSON.stringify(t));
              Store.deleteTask(id);
              self.toast('Задача удалена', 'success', function () {
                Store.data.tasks.push(snapshot); Store.save(); self.render();
              });
              self.render();
            });
          break;
        }

        /* --- Задачи --- */
        case 'settings-back': {
          const back = this.prevView && this.prevView !== 'settings' && NAV.some(function (n) { return n.id === self.prevView; }) ? this.prevView : 'tasks';
          this.go(back);
          break;
        }
        case 'whats-new': this.closeSidebar(); if (global.WhatsNew) WhatsNew.open(); break;

        case 'tasks-filter': Views.state.tasksFilter = v; this.render(); break;
        case 'tasks-mode': Store.data.ui.tasksMode = v; Store.save(); this.render(); break;

        /* --- Календарь --- */
        case 'cal-mode': Views.state.calMode = v; Store.data.ui.calMode = v; Store.save(); this.render(); break;
        case 'cal-prev': this.calStep(-1); break;
        case 'cal-next': this.calStep(1); break;
        case 'cal-today': Views.state.calAnchor = U.todayKey(); this.render(); break;
        case 'cal-new': this.openTaskForm(null, el.getAttribute('data-date')); break;
        case 'cal-open-day': Views.state.calMode = 'day'; Views.state.calAnchor = el.getAttribute('data-date'); this.render(); break;


        /* --- Статистика --- */
        case 'stats-range': Views.state.statsRange = v; this.render(); break;

        /* --- Архив --- */
        case 'archive-suggest-yes': {
          const days = Store.settings().autoArchiveDays;
          const n = Store.archiveDone(U.addDays(U.todayKey(), -days));
          this.toast('В архив перемещено задач: ' + n, 'success');
          this.render();
          break;
        }
        case 'archive-suggest-no':
          App._archiveDismissed = true;
          self.render();
          break;

        /* --- Настройки --- */
        case 'cat-add': {
          const name = (document.getElementById('newCatName').value || '').trim();
          const color = document.getElementById('newCatColor').value;
          if (!name) { this.toast('Укажите название категории', 'error'); break; }
          if (Store.categories().some(function (c) { return c.name.toLowerCase() === name.toLowerCase(); })) {
            this.toast('Категория с таким названием уже есть', 'warn'); break;
          }
          Store.addCategory(name, color);
          this.toast('Категория добавлена', 'success');
          this.render();
          break;
        }
        case 'cat-delete': {
          const c = Store.category(id);
          const used = Store.tasks().filter(function (t) { return t.categoryId === id; }).length;
          this.confirm('Удалить категорию?', 'Категория «' + U.esc(c ? c.name : '') + '» будет удалена. ' + (used ? used + ' задач(и) переместятся в другую категорию.' : ''), 'Удалить', true)
            .then(function (ok) { if (ok) { Store.deleteCategory(id); self.toast('Категория удалена', 'success'); self.render(); } });
          break;
        }
        case 'export-json': {
          U.download('moy-planer-backup-' + U.todayKey() + '.json', Store.exportJSON(), 'application/json');
          this.toast('Экспорт JSON выполнен', 'success');
          break;
        }
        case 'export-csv': {
          U.download('moy-planer-tasks-' + U.todayKey() + '.csv', Store.csv(), 'text/csv;charset=utf-8');
          this.toast('Экспорт CSV выполнен', 'success');
          break;
        }
        case 'backup': {
          try {
            localStorage.setItem('dailyflow.backup.' + Date.now(), Store.exportJSON());
            const keys = Object.keys(localStorage).filter(function (k) { return k.indexOf('dailyflow.backup.') === 0; })
              .sort().slice(-5);
            Object.keys(localStorage).forEach(function (k) {
              if (k.indexOf('dailyflow.backup.') === 0 && keys.indexOf(k) < 0) localStorage.removeItem(k);
            });
            this.toast('Резервная копия создана в localStorage (хранится 5 последних)', 'success');
          } catch (e) {
            this.toast('Не удалось создать резервную копию: хранилище переполнено', 'error');
          }
          break;
        }
        case 'import-json':
          document.getElementById('importFile').click();
          break;
        case 'reset-data': {
          this.confirm('Сбросить все данные?', 'Будут удалены <b>все задачи, темы планёрок, категории и настройки</b> без возможности восстановления. Рекомендуем сначала сделать экспорт JSON.', 'Сбросить всё', true)
            .then(function (ok) {
              if (!ok) return;
              Store.resetAll();
              self.applyTheme(Store.settings().theme);
              self.toast('Все данные сброшены', 'success');
              self.go('tasks');
            });
          break;
        }
        case 'notif-request': {
          this.requestNotifPermission(function (p) {
            if (p === 'granted') self.toast('Разрешение на уведомления выдано', 'success');
            else if (p === 'denied') self.toast('Браузер запретил уведомления для этой страницы', 'error');
            else self.toast('Разрешение не выдано', 'warn');
            const el2 = document.getElementById('notifPermStatus');
            if (el2) el2.textContent = App.notifPermText();
          });
          break;
        }
      }
    },

    calStep(dir) {
      const s = Views.state;
      const a = U.parseDateKey(s.calAnchor || U.todayKey());
      if (s.calMode === 'month') {
        const d = new Date(a.getFullYear(), a.getMonth() + dir, 1);
        s.calAnchor = U.toDateKey(d);
      } else if (s.calMode === 'week') {
        s.calAnchor = U.addDays(U.toDateKey(a), 7 * dir);
      } else {
        s.calAnchor = U.addDays(U.toDateKey(a), dir);
      }
      this.render();
    },

    /* ==================== Статусы и канбан ==================== */
    /* Единая точка смены статуса: выпадающий список в карточке и перетаскивание в канбане. */
    setTaskStatus(id, status) {
      const t = Store.task(id);
      if (!t) return;
      const prev = Store.statusOf(t);
      if (prev === status) { this.render(); return; }
      const self = this;
      const r = Store.setStatus(id, status);
      this.toast('Статус: «' + Store.statusLabel(status) + '»', 'success', function () {
        Store.setStatus(id, prev);
        self.render();
      });
      if (r.next) this.toast('Создано повторение на ' + U.formatShort(r.next.date), 'info');
      this.render();
    },

    /* Перетаскивание карточек между колонками канбана (зажатая левая кнопка мыши) */
    bindKanban() {
      const self = this;
      let dragId = null;
      const colOf = function (e) { return e.target && e.target.closest ? e.target.closest('[data-drop-status]') : null; };
      const clear = function () {
        dragId = null;
        document.body.classList.remove('is-dragging');
        document.querySelectorAll('.task--dragging').forEach(function (n) { n.classList.remove('task--dragging'); });
        document.querySelectorAll('.kcol--over').forEach(function (n) { n.classList.remove('kcol--over'); });
      };

      document.addEventListener('dragstart', function (e) {
        const card = e.target && e.target.closest ? e.target.closest('.task[draggable="true"]') : null;
        if (!card) return;
        dragId = card.getAttribute('data-task');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', dragId); } catch (err) { /* ignore */ }
        card.classList.add('task--dragging');
        document.body.classList.add('is-dragging');
      });

      document.addEventListener('dragover', function (e) {
        if (!dragId) return;
        /* автопрокрутка ленты колонок, когда карточка у левого или правого края */
        const kb = e.target && e.target.closest ? e.target.closest('.kanban') : null;
        if (kb) {
          const r = kb.getBoundingClientRect();
          if (e.clientX > r.right - 80) kb.scrollLeft += 22;
          else if (e.clientX < r.left + 80) kb.scrollLeft -= 22;
        }
        const col = colOf(e);
        if (!col) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.kcol--over').forEach(function (n) { if (n !== col) n.classList.remove('kcol--over'); });
        col.classList.add('kcol--over');
      });

      document.addEventListener('dragleave', function (e) {
        const col = colOf(e);
        if (col && !col.contains(e.relatedTarget)) col.classList.remove('kcol--over');
      });

      document.addEventListener('drop', function (e) {
        const col = colOf(e);
        if (!col || !dragId) return;
        e.preventDefault();
        const id = dragId;
        const status = col.getAttribute('data-drop-status');
        clear();
        self.setTaskStatus(id, status);
      });

      document.addEventListener('dragend', clear);
    },

    /* ==================== Быстрое создание задачи ==================== */
    /* Название + Enter: дата — сегодня, приоритет — средний. */
    quickAdd(input) {
      if (!input) return;
      const title = input.value.trim();
      if (!title) { input.focus(); return; }
      const st = Views.state;
      Store.createTask({ title: title, date: U.todayKey(), priority: 'medium' });
      st.quickDraft = '';
      /* если активный фильтр скрыл бы новую задачу — сбрасываем его, чтобы задача была видна */
      if (st.tasksFilter === 'done' || st.tasksFilter === 'overdue') st.tasksFilter = 'all';
      if (st.tasksCat && st.tasksCat !== 'other') st.tasksCat = '';
      if (st.tasksPrio && st.tasksPrio !== 'medium') st.tasksPrio = '';
      this.render();
      const next = document.querySelector('.quick-add__input');
      if (next) next.focus();
    },

    /* ==================== Уведомления ==================== */
    notifSupported() { return 'Notification' in window; },

    notifPermText() {
      if (!this.notifSupported()) return 'Браузер не поддерживает Notification API';
      const map = { granted: 'разрешено', denied: 'запрещено', default: 'не запрошено' };
      return map[Notification.permission] || Notification.permission;
    },

    requestNotifPermission(cb) {
      if (!this.notifSupported()) { cb('unsupported'); return; }
      if (Notification.permission !== 'default') { cb(Notification.permission); return; }
      try {
        Notification.requestPermission().then(function (p) { cb(p); });
      } catch (e) {
        try { Notification.requestPermission(cb); } catch (e2) { cb('unsupported'); }
      }
    },

    /* Показ уведомления. Android Chrome разрешает его только через service worker,
       поэтому сначала пробуем его, а обычный способ оставляем про запас (десктоп без service worker). */
    notify(title, body, tag) {
      if (!this.notifSupported() || Notification.permission !== 'granted') return;
      const opts = { body: body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
      if (tag) { opts.tag = tag; opts.renotify = true; }   // повтор заменяет прежнее уведомление и снова подаёт сигнал
      const fallback = function () { try { new Notification(title, opts); } catch (e) { /* не поддерживается */ } };
      if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then(function (reg) {
          if (reg && reg.active) reg.showNotification(title, opts).catch(fallback);
          else fallback();
        }).catch(fallback);
      } else {
        fallback();
      }
    },

    checkReminders(now) {
      return global.Reminders ? Reminders.check(now) : [];
    },

    startReminders() {
      this.checkReminders();
      setInterval(function () { App.checkReminders(); }, 30 * 1000);
      /* на телефоне страница может «засыпать» — при возврате в приложение сразу проверяем пропущенное */
      document.addEventListener('visibilitychange', function () { if (!document.hidden) App.checkReminders(); });
      window.addEventListener('focus', function () { App.checkReminders(); });
    },

    checkOverdueOnStart() {
      const overdue = Store.tasks().filter(function (t) { return Store.isOverdue(t); });
      if (!overdue.length) return;
      this.toast('Просроченных задач: ' + overdue.length + '. Загляните в раздел «Предстоящие».', 'warn');
      this.notify('Мой планер', 'У вас просроченных задач: ' + overdue.length);
    },

    /* ==================== Импорт ==================== */
    handleImportFile(file) {
      const self = this;
      if (!file) return;
      const reader = new FileReader();
      reader.onerror = function () { self.toast('Не удалось прочитать файл', 'error'); };
      reader.onload = function () {
        let preview;
        try { preview = JSON.parse(reader.result); }
        catch (e) { self.toast('Файл не является корректным JSON', 'error'); return; }
        if (!preview || typeof preview !== 'object' || !Array.isArray(preview.tasks)) {
          self.toast('Структура файла не распознана: отсутствует список задач', 'error');
          return;
        }
        self.confirm('Заменить данные импортом?',
          'Файл содержит задач: <b>' + preview.tasks.length + '</b>' +
          (Array.isArray(preview.topics) ? ', тем планёрок: <b>' + preview.topics.length + '</b>' : '') +
          '.<br><b>Все текущие данные будут заменены.</b> Рекомендуем сначала создать резервную копию.',
          'Импортировать', true).then(function (ok) {
            if (!ok) return;
            try {
              Store.importJSON(reader.result);
              self.applyTheme(Store.settings().theme);
              self.toast('Данные успешно импортированы', 'success');
              self.go('tasks');
            } catch (err) {
              self.toast('Импорт отменён: ' + err.message, 'error');
            }
          });
      };
      reader.readAsText(file, 'utf-8');
    },

    /* ==================== Статические обработчики ==================== */
    bindStatic() {
      const self = this;
      this.bindKanban();

      document.addEventListener('click', function (e) {
        const nav = e.target.closest('[data-nav]');
        if (nav) { self.go(nav.getAttribute('data-nav')); return; }

        const actEl = e.target.closest('[data-act]');
        if (actEl) {
          const act = actEl.getAttribute('data-act');
          if (act === 'tasks-sort' || act === 'tasks-cat' || act === 'tasks-prio' || act === 'status-set' ||
              act === 'set-toggle' || act === 'set-select' || act === 'set-time' ||
              act === 'cat-name' || act === 'cat-color') return; /* живут на change/input */
          self.handleAction(act, actEl);
          return;
        }
      });

      /* строка быстрого ввода: запоминаем недописанный текст, чтобы перерисовка его не стирала */
      document.addEventListener('input', function (e) {
        if (e.target.classList && e.target.classList.contains('quick-add__input')) {
          Views.state.quickDraft = e.target.value;
        }
      });

      /* Enter в строке быстрого ввода (отправка формы) создаёт задачу */
      document.addEventListener('submit', function (e) {
        if (e.target.matches && e.target.matches('[data-quick-add]')) {
          e.preventDefault();
          self.quickAdd(e.target.querySelector('.quick-add__input'));
        }
      });

      document.addEventListener('change', function (e) {
        const el = e.target.closest('[data-act]');
        if (!el) return;
        const act = el.getAttribute('data-act');
        const id = el.getAttribute('data-id');
        if (act === 'status-set') { self.setTaskStatus(id, el.value); }
        else if (act === 'tasks-sort') { Views.state.tasksSort = el.value; self.render(); }
        else if (act === 'tasks-cat') { Views.state.tasksCat = el.value; self.render(); }
        else if (act === 'tasks-prio') { Views.state.tasksPrio = el.value; self.render(); }
        else if (act === 'set-toggle') {
          const key = el.getAttribute('data-key');
          if (key === 'darkTheme') {
            Store.setSetting('theme', el.checked ? 'dark' : 'light');
            self.applyTheme(Store.settings().theme);
          } else if (key === 'notifications') {
            if (el.checked) {
              self.requestNotifPermission(function (p) {
                if (p === 'granted') {
                  Store.setSetting('notifications', true);
                  self.toast('Напоминания включены', 'success');
                } else {
                  el.checked = false;
                  Store.setSetting('notifications', false);
                  self.toast(p === 'denied' ? 'Браузер запретил уведомления' : 'Разрешение не выдано — уведомления недоступны', 'error');
                }
                const st = document.getElementById('notifPermStatus');
                if (st) st.textContent = App.notifPermText();
              });
            } else {
              Store.setSetting('notifications', false);
              self.toast('Напоминания выключены', 'info');
            }
          }
        }
        else if (act === 'set-select') {
          const key = el.getAttribute('data-key');
          Store.setSetting(key, parseInt(el.value, 10));
          self.render();
        }
        else if (act === 'set-time') {
          const key = el.getAttribute('data-key');
          if (U.isValidTime(el.value)) { Store.setSetting(key, el.value); self.toast('Сохранено', 'success'); }
        }
        else if (act === 'cat-name' || act === 'cat-color') {
          const row = el.closest('.cat-row');
          const nameInput = row.querySelector('[data-act="cat-name"]');
          const colorInput = row.querySelector('[data-act="cat-color"]');
          Store.updateCategory(id, nameInput.value.trim() || null, colorInput.value);
        }
      });

      /* верхняя панель */
      document.getElementById('addTaskBtn').addEventListener('click', function () { self.openTaskForm(null); });
      document.getElementById('topSettings').addEventListener('click', function () { self.go('settings'); });
      document.getElementById('themeToggle').addEventListener('click', function () { self.toggleTheme(); });
      document.getElementById('burger').addEventListener('click', function () { self.openSidebar(); });
      document.getElementById('sidebarClose').addEventListener('click', function () { self.closeSidebar(); });
      document.getElementById('sidebarBackdrop').addEventListener('click', function () { self.closeSidebar(); });

      /* поиск */
      const searchInput = document.getElementById('searchInput');
      searchInput.addEventListener('input', function () { self.runSearch(searchInput.value); });
      searchInput.addEventListener('focus', function () { if (searchInput.value.trim()) self.runSearch(searchInput.value); });
      document.getElementById('searchResults').addEventListener('click', function (e) {
        const item = e.target.closest('[data-act="open"]');
        if (!item) return;
        e.stopPropagation();
        self.hideSearch();
        searchInput.value = '';
        self.openTaskForm(item.getAttribute('data-id'));
      });
      document.addEventListener('click', function (e) {
        if (!e.target.closest('.topbar__search')) self.hideSearch();
      });

      /* модалка: закрытие */
      document.getElementById('modalClose').addEventListener('click', function () { self.closeModal(); });
      document.getElementById('modalBackdrop').addEventListener('click', function () { self.closeModal(); });

      /* импорт */
      const fileInput = document.getElementById('importFile');
      fileInput.addEventListener('change', function () {
        self.handleImportFile(fileInput.files[0]);
        fileInput.value = '';
      });

      /* клавиатура */
      document.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && document.activeElement &&
            document.activeElement.getAttribute && document.activeElement.getAttribute('role') === 'button') {
          e.preventDefault();
          document.activeElement.click();
          return;
        }
        if (e.key === 'Escape') {
          if (!document.getElementById('modalRoot').hidden) { self.closeModal(); return; }
          if (!document.getElementById('searchResults').hidden) { self.hideSearch(); searchInput.blur(); return; }
          self.closeSidebar();
          return;
        }
        const typing = U.isTypingTarget(document.activeElement);
        const meta = e.ctrlKey || e.metaKey;
        if (meta && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) {
          /* в полях ввода текстового типа Ctrl+K не мешает набору, но перехват безопасен для input/textarea */
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
          return;
        }
        if (meta && (e.key === 'n' || e.key === 'N' || e.code === 'KeyN')) {
          if (typing) return; /* не мешаем вводу и не перекрываем встроенные действия браузера в полях */
          e.preventDefault();
          self.openTaskForm(null);
        }
      });
    }
  };

  document.addEventListener('DOMContentLoaded', function () { App.init(); });
  global.App = App;
})(window);
