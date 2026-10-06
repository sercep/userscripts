// ==UserScript==
// @name         RYM: per-track descriptor capture
// @namespace    https://github.com/sercep/userscripts
// @version      1.0.1
// @description  Captures RYM's per-track descriptor-voting data into a downloadable JSON with metadata.
// @author       sercep
// @match        https://rateyourmusic.com/rdescriptor/set*
// @match        https://www.rateyourmusic.com/rdescriptor/set*
// @license      MIT
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const albumId = new URLSearchParams(location.search).get('album_id') || 'unknown';
  const captured = {}; // scope ("album" | "1" | "2" | ...) -> [descriptor names]

  function getReleaseMeta() {
    let artist = '';
    let album = '';

    const artistEl = document.querySelector('a.artist') ||
                     document.querySelector('a[href^="/artist/"]');
    if (artistEl) artist = artistEl.textContent.trim();

    const albumEl = document.querySelector('a.album') ||
                    document.querySelector('a[href^="/release/"]:not(:has(img))') ||
                    document.querySelector('.album_title');
    if (albumEl) album = albumEl.textContent.trim();

    if (!album) {
      const coverImg = document.querySelector('img[id^="img_l_"]');
      if (coverImg && coverImg.alt) album = coverImg.alt.trim();
    }

    if (!artist || !album) {
      const titleClean = document.title
        .replace(/^Set (genres|descriptors):\s*/i, '')
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

  function appliedDescriptors() {
    const container = Array.from(document.querySelectorAll('div[id^="descriptorListl"]'))
      .find(el => /^descriptorListl\d+$/.test(el.id));
    if (!container) return [];
    // Descriptors aren't links (no genre-page equivalent), so there's no
    // href to key off. The box's own class (descriptora/descriptord) is
    // what says whether it applies; the label is just the text of the
    // first nested <div> inside an applied ("descriptora") item.
    return Array.from(container.querySelectorAll('div.descriptora'))
      .map(item => {
        const nameDiv = item.querySelector('div');
        return nameDiv ? nameDiv.textContent.trim() : null;
      })
      .filter(Boolean);
  }

  function parseCurrentDescriptors() {
    const selected = document.querySelector('li.trackselect_btn.selected');
    let scope = 'album';
    if (selected && !selected.classList.contains('entirealbum')) {
      scope = selected.id.replace('trackselect_btn_', '');
    }
    return { scope, descriptors: appliedDescriptors() };
  }

  function totalTracks() {
    return document.querySelectorAll('li.trackselect_btn:not(.entirealbum)').length;
  }

  function capture() {
    const data = parseCurrentDescriptors();
    if (data.descriptors.length === 0) return; // nothing loaded yet
    captured[data.scope] = data.descriptors;
    flash(data.scope);
    updatePanel();
  }

  // Fires only in reaction to DOM changes RYM makes after YOUR OWN click on
  // a track. This observer never clicks, navigates, or issues any request --
  // it only reads content the page already loaded because you clicked it.
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(capture, 400);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // capture whatever's already on screen on page load ("Entire album")
  setTimeout(capture, 300);

  // --- minimal floating panel ---
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
    const payload = { _meta: meta, ...captured };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);

    const titleParts = [meta.artist, meta.album].filter(Boolean);
    const safeTitle = titleParts.join(' - ').replace(/[\\/:*?"<>|]/g, '_').trim();

    a.download = safeTitle.length > 0 ? `rym-descriptors-${safeTitle}.json` : `rym-descriptors-${albumId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  updatePanel();
})();