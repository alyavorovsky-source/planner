/* DailyFlow — статусы задач (Новая, В работе, Отложена, Отменена).
   Отдельный модуль: расширяет поведение существующих файлов, не изменяя их. */
(function (global) {
  'use strict';

  const STATUSES = [
    { id: 'new', label: 'Новая' },
    { id: 'active', label: 'В работе' },
    { id: 'postponed', label: 'Отложена' },
    { id: 'cancelled', label: 'Отменена' }
  ];

  const norm = function (s) {
    return STATUSES.some(function (x) { return x.id === s; }) ? s : 'new';
  };

  const labelOf = function (s) {
    const x = STATUSES.find(function (v) { return v.id === s; });
    return x ? x.label : 'Новая';
  };

  /* ---------- Стили модуля (инжектятся, не трогая style.css) ---------- */
  const css =
    '.chip--status{background:var(--bg-elev-2);color:var(--text-dim)}' +
    '.chip--status.st-active{background:var(--amber-soft);color:var(--amber)}' +
    '.chip--status.st-postponed{background:var(--bg-elev-2);color:var(--text-faint)}' +
    '.chip--status.st-cancelled{background:var(--red-soft);color:var(--red)}' +
    '.chip--status.st-new{background:var(--accent-soft);color:var(--accent)}' +
    '.task--cancelled{opacity:.5}' +
    '.task--cancelled .task__title{text-decoration:line-through;color:var(--text-dim)}' +
    '.status-select{font-size:12px;font-weight:600;border:1px solid var(--border);border-radius:20px;padding:2px 8px;background:var(--bg-elev-2);color:var(--text-dim);cursor:pointer;font-family:inherit}' +
    '.status-select:focus{outline:none;border-color:var(--accent)}' +
    '.status-select.st-active{background:var(--amber-soft);color:var(--amber)}' +
    '.status-select.st-postponed{color:var(--text-faint)}' +
    '.status-select.st-cancelled{background:var(--red-soft);color:var(--red)}' +
    '.status-select.st-new{background:var(--accent-soft);color:var(--accent)}';

  const injectCss = function () {
    if (document.getElementById('dayflow-statuses-css')) return;
    const st = document.createElement('style');
    st.id = 'dayflow-statuses-css';
    st.textContent = css;
    document.head.appendChild(st);
  };

  /* ==================== Патч слоя данных ==================== */
  function patchStore() {
    /* Нормализация status в загруженных/импортированных данных */
    const origLoad = Store.load.bind(Store);
    Store.load = function () {
      const d = origLoad();
      d.tasks.forEach(function (t) { t.status = norm(t.status); });
      return d;
    };

    /* Отменённые задачи не считаются просроченными */
    const origOverdue = Store.isOverdue.bind(Store);
    Store.isOverdue = function (t) {
      if (t.status === 'cancelled') return false;
      return origOverdue(t);
    };

    const readFormStatus = function () {
      const sel = document.querySelector('#taskForm [name="status"]');
      return sel ? norm(sel.value) : null;
    };

    const origCreate = Store.createTask.bind(Store);
    Store.createTask = function (form) {
      const t = origCreate(form);
      if (t) { t.status = readFormStatus() || norm(form && form.status); Store.save(); }
      return t;
    };

    const origUpdate = Store.updateTask.bind(Store);
    Store.updateTask = function (id, form) {
      const t = origUpdate(id, form);
      if (t) {
        const s = readFormStatus() || (form && form.status ? norm(form.status) : null);
        if (s) { t.status = s; Store.save(); }
      }
      return t;
    };

    const origImport = Store.importJSON.bind(Store);
    Store.importJSON = function (text) {
      origImport(text);
      Store.data.tasks.forEach(function (t) { t.status = norm(t.status); });
      Store.save();
    };

    Store.setStatus = function (id, status) {
      const t = Store.task(id);
      if (!t) return false;
      t.status = norm(status);
      t.updatedAt = Date.now();
      Store.save();
      return true;
    };
  }

  /* ==================== Патч карточки задачи ==================== */
  function patchViews() {
    const origCard = Views.taskCard.bind(Views);
    Views.taskCard = function (t, opts) {
      let html = origCard(t, opts);
      const cls = norm(t.status);
      if (cls === 'cancelled') {
        html = html.replace(/class="task([^"]*)"/, 'class="task$1 task--cancelled"');
      }
      const options = STATUSES.map(function (s) {
        return '<option value="' + s.id + '"' + (cls === s.id ? ' selected' : '') + '>' + s.label + '</option>';
      }).join('');
      const sel = '<select class="status-select st-' + cls + '" data-act="status-set" data-id="' + t.id + '" title="Статус задачи" aria-label="Статус задачи">' + options + '</select>';
      /* вставляем селект статуса первым в строку мета */
      html = html.replace('<div class="task__meta">', '<div class="task__meta">' + sel);
      return html;
    };
  }

  /* ==================== Патч формы задачи ==================== */
  function patchForm() {
    if (typeof App.openTaskForm !== 'function') return;
    const origOpen = App.openTaskForm.bind(App);
    App.openTaskForm = function (taskId, presetDate) {
      origOpen(taskId, presetDate);
      const form = document.querySelector('#taskForm');
      if (!form) return;
      const err = form.querySelector('#formError');
      if (!err || form.querySelector('[name="status"]')) return;
      const cur = taskId && Store.task(taskId) ? norm(Store.task(taskId).status) : 'new';
      const options = STATUSES.map(function (s) {
        return '<option value="' + s.id + '"' + (cur === s.id ? ' selected' : '') + '>' + s.label + '</option>';
      }).join('');
      err.insertAdjacentHTML('beforebegin',
        '<label class="field">Статус<select name="status">' + options + '</select></label>');
    };
  }

  /* ==================== Быстрая смена статуса из карточки ==================== */
  function bindQuickSet() {
    document.addEventListener('change', function (e) {
      const el = e.target.closest('[data-act="status-set"]');
      if (!el) return;
      e.stopPropagation();
      const ok = Store.setStatus(el.getAttribute('data-id'), el.value);
      if (ok) {
        App.toast('Статус: «' + labelOf(el.value) + '»', 'success');
        App.render();
      }
    });
  }

  /* ==================== Инициализация ==================== */
  function init() {
    injectCss();
    if (global.Store) patchStore();
    if (global.Views) patchViews();
    if (global.App) {
      patchForm();
      bindQuickSet();
    }
  }

  if (global.Store && global.Views && global.App) init();
  else document.addEventListener('DOMContentLoaded', init);

  global.TaskStatuses = { STATUSES: STATUSES, norm: norm, labelOf: labelOf };
})(window);
