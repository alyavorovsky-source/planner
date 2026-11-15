/* DailyFlow — окно «Что нового». Показывается один раз при первом открытии новой версии. */
(function (global) {
  'use strict';

  const SEEN_KEY = 'dailyflow.seenVersion.v1';
  const DATA_KEY = 'dailyflow.data.v1';   // ключ данных из store.js

  /* Запоминаем ДО запуска приложения: были ли у пользователя сохранённые данные.
     Новичку, открывшему планер впервые, «новинки» показывать незачем. */
  const hadData = (function () {
    try { return localStorage.getItem(DATA_KEY) !== null; } catch (e) { return false; }
  })();

  let root = null;
  let lastFocus = null;

  function esc(s) { return global.U ? U.esc(s) : String(s); }

  function entryHtml(e) {
    return '<div class="wn-entry">' +
      '<div class="wn-entry__head"><b>Версия ' + esc(e.version) + '</b><span>' + esc(e.date) + '</span></div>' +
      '<ul class="wn-list">' + e.items.map(function (it) {
        return '<li><span class="wn-list__icon">' + Icons.svg('checkCircle', 18) + '</span>' +
          '<div><div class="wn-list__title">' + esc(it.title) + '</div><div class="wn-list__text">' + esc(it.text) + '</div></div></li>';
      }).join('') + '</ul></div>';
  }

  const WhatsNew = {
    /* Вызывается при запуске: показывает окно, если эта версия ещё не показывалась. */
    maybeShow() {
      let seen = null;
      try { seen = localStorage.getItem(SEEN_KEY); } catch (e) { seen = null; }
      if (seen === AppInfo.version) return;
      this.remember();
      if (seen === null && !hadData) return;
      setTimeout(function () { WhatsNew.open(); }, 700);
    },

    remember() {
      try { localStorage.setItem(SEEN_KEY, AppInfo.version); } catch (e) { /* хранилище недоступно */ }
    },

    open() {
      if (root) return;
      const cur = AppInfo.changelog[0];
      const older = AppInfo.changelog.slice(1);
      lastFocus = document.activeElement;

      root = document.createElement('div');
      root.className = 'wn-root';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-labelledby', 'wnTitle');
      root.innerHTML =
        '<div class="wn-backdrop" data-wn="close"></div>' +
        '<div class="wn-card">' +
          '<div class="wn-top">' +
            '<span class="wn-spark">' + Icons.svg('star', 20) + '</span>' +
            '<div><h2 class="wn-title" id="wnTitle">Что нового</h2>' +
            '<div class="wn-sub">Версия ' + esc(cur.version) + ' · ' + esc(cur.date) + '</div></div>' +
            '<button type="button" class="icon-btn wn-x" data-wn="close" aria-label="Закрыть">' + Icons.svg('close', 18) + '</button>' +
          '</div>' +
          '<div class="wn-body">' + entryHtml(cur) +
            (older.length
              ? '<details class="wn-older"><summary>Предыдущие версии</summary>' + older.map(entryHtml).join('') + '</details>'
              : '') +
          '</div>' +
          '<div class="wn-foot"><button type="button" class="btn btn--primary" data-wn="close">Понятно</button></div>' +
        '</div>';
      document.body.appendChild(root);
      root.addEventListener('click', function (e) {
        if (e.target.closest('[data-wn="close"]')) WhatsNew.close();
      });
      const btn = root.querySelector('.wn-foot .btn');
      if (btn) btn.focus();
    },

    close() {
      if (!root) return;
      const el = root;
      root = null;
      el.classList.add('wn-root--out');
      setTimeout(function () { el.remove(); }, 180);
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
    },

    isOpen() { return !!root; }
  };

  /* Escape закрывает окно и не доходит до остальных обработчиков */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && WhatsNew.isOpen()) {
      e.stopPropagation();
      WhatsNew.close();
    }
  }, true);

  global.WhatsNew = WhatsNew;
})(window);
