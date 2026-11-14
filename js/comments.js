/* DailyFlow — свободные комментарии.
   Лента заметок без привязки к дню: пишете текст, добавляете, при необходимости правите или удаляете.
   Хранятся отдельно от задач (ключ localStorage dailyflow.comments.v1). */
(function (global) {
  'use strict';

  const LS_KEY = 'dailyflow.comments.v1';
  const LS_OLD_NOTES = 'dailyflow.daynotes.v1';   // прежние «Заметки на день»
  const MAX_LEN = 5000;
  const PAGE = 30;

  const Comments = {
    items: null,
    draft: '',          // недописанный новый комментарий (переживает перерисовку страницы)
    editing: null,      // { id, text } — комментарий в режиме правки
    limit: PAGE,

    /* ---------- хранилище ---------- */
    load() {
      let raw = null;
      try { raw = localStorage.getItem(LS_KEY); } catch (e) { raw = null; }
      let list = null;
      if (raw !== null) { try { list = JSON.parse(raw); } catch (e) { list = null; } }
      if (Array.isArray(list)) {
        this.items = list.filter(function (c) {
          return c && typeof c.id === 'string' && typeof c.text === 'string' && typeof c.createdAt === 'number';
        });
      } else {
        this.items = this._migrateOldNotes();
        if (this.items.length) this.save();
      }
      return this.items;
    },

    /* Однократный перенос прежних заметок на день: каждая становится комментарием с датой своего дня. */
    _migrateOldNotes() {
      let raw = null;
      try { raw = localStorage.getItem(LS_OLD_NOTES); } catch (e) { raw = null; }
      if (!raw) return [];
      let old = null;
      try { old = JSON.parse(raw); } catch (e) { old = null; }
      if (!old || typeof old !== 'object' || Array.isArray(old)) return [];
      const out = [];
      Object.keys(old).sort().forEach(function (key) {
        const d = U.parseDateKey(key);
        const text = typeof old[key] === 'string' ? old[key].trim() : '';
        if (!d || !text) return;
        const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).getTime();
        out.push({ id: U.uid(), text: text.slice(0, MAX_LEN), createdAt: ts, updatedAt: ts });
      });
      return out;
    },

    save() {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(this.items));
        return true;
      } catch (e) {
        if (global.App && App.toast) App.toast('Не удалось сохранить комментарий: хранилище недоступно', 'error');
        return false;
      }
    },

    list() {
      if (!this.items) this.load();
      return this.items.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    },

    add(text) {
      const t = (text || '').trim().slice(0, MAX_LEN);
      if (!t) return null;
      if (!this.items) this.load();
      const now = Date.now();
      const c = { id: U.uid(), text: t, createdAt: now, updatedAt: now };
      this.items.push(c);
      this.save();
      return c;
    },

    update(id, text) {
      const t = (text || '').trim().slice(0, MAX_LEN);
      const c = (this.items || []).find(function (x) { return x.id === id; });
      if (!c || !t) return false;
      if (t !== c.text) { c.text = t; c.updatedAt = Date.now(); this.save(); }
      return true;
    },

    remove(id) {
      const i = (this.items || []).findIndex(function (x) { return x.id === id; });
      if (i < 0) return null;
      const removed = this.items.splice(i, 1)[0];
      this.save();
      return removed;
    },

    /* ---------- отображение ---------- */
    stamp(ts) {
      const d = new Date(ts);
      const hm = U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
      return U.relativeDayLabel(U.toDateKey(d)) + ', ' + U.formatTime(hm, Store.settings().timeFormat === 12);
    },

    itemHtml(c) {
      if (this.editing && this.editing.id === c.id) {
        return '<div class="cmt cmt--editing" data-cmt-id="' + c.id + '">' +
          '<textarea class="cmt__edit" rows="3" maxlength="' + MAX_LEN + '" aria-label="Текст комментария">' + U.esc(this.editing.text) + '</textarea>' +
          '<div class="cmt__row">' +
            '<button type="button" class="btn btn--sm btn--primary" data-cmt="save">' + Icons.svg('check', 14) + 'Сохранить</button>' +
            '<button type="button" class="btn btn--sm btn--ghost" data-cmt="cancel">Отмена</button>' +
          '</div></div>';
      }
      const edited = c.updatedAt && c.updatedAt - c.createdAt > 1000;
      return '<div class="cmt" data-cmt-id="' + c.id + '">' +
        '<div class="cmt__text">' + U.esc(c.text) + '</div>' +
        '<div class="cmt__foot">' +
          '<span class="cmt__time">' + U.esc(this.stamp(c.createdAt)) + (edited ? ' · изменён' : '') + '</span>' +
          '<span class="cmt__actions">' +
            '<button type="button" class="icon-btn" data-cmt="edit" title="Редактировать" aria-label="Редактировать комментарий">' + Icons.svg('edit', 14) + '</button>' +
            '<button type="button" class="icon-btn danger" data-cmt="delete" title="Удалить" aria-label="Удалить комментарий">' + Icons.svg('trash', 14) + '</button>' +
          '</span>' +
        '</div></div>';
    },

    paint(sec) {
      const all = this.list();
      const shown = all.slice(0, this.limit);
      sec.innerHTML =
        '<h2 class="panel__title">' + Icons.svg('edit', 17) + 'Комментарии' +
          (all.length ? '<span class="day-group__badge" style="margin-left:8px">' + all.length + '</span>' : '') + '</h2>' +
        '<textarea class="cmt-new" rows="3" maxlength="' + MAX_LEN + '" placeholder="Напишите комментарий — мысль, идею, итог дня…" aria-label="Новый комментарий">' + U.esc(this.draft) + '</textarea>' +
        '<div class="cmt__row">' +
          '<button type="button" class="btn btn--sm btn--primary" data-cmt="add">' + Icons.svg('plus', 14) + 'Добавить</button>' +
          '<span class="cmt__hint">Ctrl + Enter — добавить</span>' +
        '</div>' +
        (shown.length
          ? '<div class="cmt-list">' + shown.map(function (c) { return Comments.itemHtml(c); }).join('') + '</div>'
          : '<div class="cmt__empty">Комментариев пока нет.</div>') +
        (all.length > shown.length
          ? '<button type="button" class="btn btn--sm btn--ghost cmt__more" data-cmt="more">Показать ещё (' + (all.length - shown.length) + ')</button>'
          : '');
    },

    /* ---------- вставка панели в отрендеренную страницу ---------- */
    mount(container) {
      if (!container) return;
      const sec = document.createElement('section');
      sec.className = 'panel cmt-panel';
      this.paint(sec);
      this.bind(sec);
      container.appendChild(sec);
    },

    bind(sec) {
      const self = this;

      sec.addEventListener('input', function (e) {
        if (e.target.classList.contains('cmt-new')) self.draft = e.target.value;
        else if (e.target.classList.contains('cmt__edit') && self.editing) self.editing.text = e.target.value;
      });

      sec.addEventListener('keydown', function (e) {
        const isSend = (e.ctrlKey || e.metaKey) && e.key === 'Enter';
        if (e.target.classList.contains('cmt-new') && isSend) { e.preventDefault(); self.doAdd(sec); }
        else if (e.target.classList.contains('cmt__edit')) {
          if (isSend) { e.preventDefault(); self.doSave(sec); }
          else if (e.key === 'Escape') { e.stopPropagation(); self.editing = null; self.paint(sec); }
        }
      });

      sec.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-cmt]');
        if (!btn) return;
        const act = btn.getAttribute('data-cmt');
        const item = btn.closest('[data-cmt-id]');
        const id = item ? item.getAttribute('data-cmt-id') : null;

        if (act === 'add') self.doAdd(sec);
        else if (act === 'more') { self.limit += PAGE; self.paint(sec); }
        else if (act === 'edit') {
          const c = (self.items || []).find(function (x) { return x.id === id; });
          if (!c) return;
          self.editing = { id: c.id, text: c.text };
          self.paint(sec);
          const ta = sec.querySelector('.cmt__edit');
          if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
        }
        else if (act === 'cancel') { self.editing = null; self.paint(sec); }
        else if (act === 'save') self.doSave(sec);
        else if (act === 'delete') {
          const removed = self.remove(id);
          if (!removed) return;
          if (self.editing && self.editing.id === id) self.editing = null;
          self.paint(sec);
          App.toast('Комментарий удалён', 'success', function () {
            self.items.push(removed);
            self.save();
            if (sec.isConnected) self.paint(sec);
          });
        }
      });
    },

    doAdd(sec) {
      const ta = sec.querySelector('.cmt-new');
      if (!ta) return;
      if (!ta.value.trim()) { ta.focus(); return; }
      this.add(ta.value);
      this.draft = '';
      this.paint(sec);
      const next = sec.querySelector('.cmt-new');
      if (next) next.focus();
    },

    doSave(sec) {
      if (!this.editing) return;
      if (!this.editing.text.trim()) { App.toast('Комментарий не может быть пустым', 'warn'); return; }
      this.update(this.editing.id, this.editing.text);
      this.editing = null;
      this.paint(sec);
    }
  };

  global.Comments = Comments;
})(window);
