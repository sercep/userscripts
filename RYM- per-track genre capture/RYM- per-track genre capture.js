// ==UserScript==
// @name         RYM: per-track genre capture
// @namespace    https://github.com/sercep/userscripts
// @version      1.2.1
// @description  Captures RYM's per-track genre-voting data into a downloadable JSON with metadata.
// @author       sercep
// @match        https://rateyourmusic.com/rgenre/set*
// @match        https://www.rateyourmusic.com/rgenre/set*
// @license      MIT
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const albumId = new URLSearchParams(location.search).get('album_id') || 'unknown';
  const captured = {};

  function getReleaseMeta() {
    let artist = '';
    let album = '';

    // Артист: ссылка с классом artist или href /artist/
    const artistEl = document.querySelector('a.artist') ||
                     document.querySelector('a[href^="/artist/"]');
    if (artistEl) artist = artistEl.textContent.trim();

    // Релиз: на этой странице ссылка имеет класс 'album'
    const albumEl = document.querySelector('a.album') ||
                    document.querySelector('a[href^="/release/"]:not(:has(img))') ||
                    document.querySelector('.album_title');
    if (albumEl) album = albumEl.textContent.trim();

    // Запасной вариант 1: alt/title обложки альбома
    if (!album) {
      const coverImg = document.querySelector('img[id^="img_l_"]');
      if (coverImg && coverImg.alt) album = coverImg.alt.trim();
    }

    // Запасной вариант 2: парсинг заголовка вкладки
    if (!artist || !album) {
      const titleClean = document.title
        .replace(/^Set genres:\s*/i, '')
        .replace(/\s*-\s*Rate Your Music$/i, '')
        .trim();
      const parts = titleClean.split(/\s*[-–—]\s*/);
      if (parts.length >= 2) {
        artist = artist || parts[0].trim();
        album = album || parts.slice(1).join(' - ').trim();
      }
    }

    return { album_id: albumId, artist, album };
  }

  function appliedGenres(prefix) {
    const container = Array.from(document.querySelectorAll('div[id^="' + prefix + '"]'))
      .find(el => new RegExp('^' + prefix + '\\d+$').test(el.id));
    if (!container) return [];
    return Array.from(container.querySelectorAll('div.genrea a[href^="/genre/"]'))
      .map(a => a.textContent.trim());
  }

  function parseCurrentGenres() {
    const selected = document.querySelector('li.trackselect_btn.selected');
    let scope = 'album';
    if (selected && !selected.classList.contains('entirealbum')) {
      scope = selected.id.replace('trackselect_btn_', '');
    }
    return {
      scope,
      primary: appliedGenres('genreListlg'),
      secondary: appliedGenres('genreListls'),
    };
  }

  function totalTracks() {
    return document.querySelectorAll('li.trackselect_btn:not(.entirealbum)').length;
  }

  function capture() {
    const data = parseCurrentGenres();
    if (data.primary.length === 0 && data.secondary.length === 0) return;
    captured[data.scope] = { primary: data.primary, secondary: data.secondary };
    flash(data.scope);
    updatePanel();
  }

  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(capture, 400);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(capture, 300);

  // Floating UI Panel
  const panel = document.createElement('div');
  panel.style.cssText = `
    position: fixed; bottom: 16px; right: 16px; z-index: 999999;
    background: #1c1c1c; color: #eee; font: 12px/1.4 sans-serif;
    padding: 10px 12px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.4);
    width: 200px;
  `;
  const countEl = document.createElement('div');
  countEl.style.marginBottom = '6px';
  const flashEl = document.createElement('div');
  flashEl.style.cssText = 'min-height:14px;opacity:.7;margin-bottom:6px;';
  const dlBtn = document.createElement('button');
  dlBtn.textContent = '\u2B07 Скачать JSON';
  dlBtn.style.cssText = 'width:100%;margin-bottom:4px;cursor:pointer;padding:4px;';
  dlBtn.onclick = downloadJson;
  const clearBtn = document.createElement('button');
  clearBtn.textContent = '\u2715 Очистить';
  clearBtn.style.cssText = 'width:100%;cursor:pointer;padding:4px;';
  clearBtn.onclick = () => {
    Object.keys(captured).forEach(k => delete captured[k]);
    updatePanel();
  };
  panel.append(countEl, flashEl, dlBtn, clearBtn);
  document.body.appendChild(panel);

  function flash(scope) {
    flashEl.textContent = scope === 'album' ? 'поймано: альбом' : `поймано: трек ${scope}`;
    setTimeout(() => { if (flashEl.textContent.includes(String(scope))) flashEl.textContent = ''; }, 1500);
  }

  function updatePanel() {
    const doneCount = Object.keys(captured).filter(s => s !== 'album').length;
    countEl.textContent = `Захвачено: ${doneCount} / ${totalTracks()} треков` +
      (captured.album ? ' + альбом' : '');
  }

  function downloadJson() {
    const meta = getReleaseMeta();
    const payload = {
      _meta: meta,
      ...captured
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);

    const titleParts = [meta.artist, meta.album].filter(Boolean);
    const safeTitle = titleParts.join(' - ').replace(/[\\/:*?"<>|]/g, '_').trim();

    a.download = safeTitle.length > 0 ? `rym-genres-${safeTitle}.json` : `rym-genres-${albumId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  updatePanel();
})();