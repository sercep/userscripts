// ==UserScript==
// @name         RYM: Chart Notes
// @namespace    https://github.com/sercep/userscripts
// @version      0.6
// @description  Notes for RateYourMusic Charts; stores in IndexedDB; import/export; migrate from GM/localStorage; sync via GitHub Gist; collapsible panel; improved Gist handling
// @author       sercep
// @match        https://rateyourmusic.com/charts/*
// @license      MIT
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      api.github.com
// @run-at       document-idle
// ==/UserScript==

(async function () {
  'use strict';

  // ---------- CONFIG ----------
  const RELEASE_SELECTOR = 'a.page_charts_section_charts_item_link';
  const LS_PREFIX = 'rymChartNote::';
  const GM_MASTER_KEY = 'rymChartNotes';
  const GM_MIGRATED_FLAG = 'rymChartNote::__migrated_to_idb_v2';
  const LS_MIGRATED_FLAG = 'rymChartNote::__migrated_ls_to_idb_v2';
  const AUTO_CLEANUP_GM_AFTER_MIGRATE = false;
  const AUTO_CLEANUP_LS_AFTER_MIGRATE = true;

  const DB_NAME = 'RYMNotesDB';
  const DB_VERSION = 2;
  const STORE_NOTES = 'notes';

  const K_SYNC_PROVIDER = 'rymSync::provider';
  const K_GIST_TOKEN   = 'rymSync::gistToken';
  const K_GIST_ID      = 'rymSync::gistId';
  const K_GIST_FILE    = 'rymSync::gistFile';
  const DEFAULT_GIST_FILE = 'rym_notes.json';

  const K_UI_COLLAPSED = 'rymUI::collapsed';

  // ---------- UTILs ----------
  function pathFromHref(href) {
    try { return new URL(href, window.location.origin).pathname; } catch { return href; }
  }

  function showToast(msg, timeout = 2500) {
    let t = document.getElementById('rym-notes-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'rym-notes-toast';
      Object.assign(t.style, {
        position: 'fixed', right: '16px', bottom: '90px',
        zIndex: 999999, background: 'rgba(0,0,0,0.85)', color: '#fff',
        padding: '8px 12px', borderRadius: '6px', fontSize: '13px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
      });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.display = 'none'; }, timeout);
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) { try { await navigator.clipboard.writeText(text); return; } catch {} }
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }

  // ---------- GM wrappers ----------
  async function gmGet(key, def = undefined) {
    if (typeof GM_getValue === 'function') return GM_getValue(key, def);
    if (typeof GM?.getValue === 'function') return GM.getValue(key, def);
    return def;
  }
  async function gmSet(key, val) {
    if (typeof GM_setValue === 'function') return GM_setValue(key, val);
    if (typeof GM?.setValue === 'function') return GM.setValue(key, val);
  }
  async function gmDel(key) {
    if (typeof GM_deleteValue === 'function') return GM_deleteValue(key);
    if (typeof GM?.deleteValue === 'function') return GM.deleteValue(key);
  }

  // ---------- IndexedDB ----------
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NOTES)) {
          const os = db.createObjectStore(STORE_NOTES, { keyPath: 'path' });
          os.createIndex('updatedAt', 'updatedAt', { unique: false });
        } else {
          const tx = req.transaction;
          try {
            const os = tx.objectStore(STORE_NOTES);
            if (!os.indexNames.contains('updatedAt')) os.createIndex('updatedAt', 'updatedAt', { unique: false });
          } catch {}
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGetAllEntriesMap() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NOTES, 'readonly');
      const store = tx.objectStore(STORE_NOTES);
      const req = store.getAll();
      req.onsuccess = () => {
        const map = {};
        for (const row of req.result) map[row.path] = { note: row.note || '', updatedAt: row.updatedAt || 0 };
        resolve(map);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGetAllSimpleMap() {
    const full = await idbGetAllEntriesMap();
    const simple = {};
    for (const [k, v] of Object.entries(full)) simple[k] = v.note;
    return simple;
  }

  async function idbGet(path) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NOTES, 'readonly');
      const store = tx.objectStore(STORE_NOTES);
      const req = store.get(path);
      req.onsuccess = () => {
        const r = req.result;
        resolve(r ? { note: r.note || '', updatedAt: r.updatedAt || 0 } : null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(path, note, updatedAt = Date.now()) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NOTES, 'readwrite');
      const store = tx.objectStore(STORE_NOTES);
      const req = store.put({ path, note, updatedAt });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbDelete(path) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NOTES, 'readwrite');
      const store = tx.objectStore(STORE_NOTES);
      const req = store.delete(path);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbBulkPutEntries(entriesMap) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NOTES, 'readwrite');
      const store = tx.objectStore(STORE_NOTES);
      const now = Date.now();
      for (const [path, rec] of Object.entries(entriesMap)) {
        const updatedAt = (rec && typeof rec.updatedAt === 'number') ? rec.updatedAt : now;
        const note = (rec && typeof rec.note === 'string') ? rec.note : (rec || '');
        store.put({ path, note, updatedAt });
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function idbReplaceAllEntries(entriesMap) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NOTES, 'readwrite');
      const store = tx.objectStore(STORE_NOTES);
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        const now = Date.now();
        for (const [path, rec] of Object.entries(entriesMap)) {
          const updatedAt = (rec && typeof rec.updatedAt === 'number') ? rec.updatedAt : now;
          const note = (rec && typeof rec.note === 'string') ? rec.note : (rec || '');
          store.put({ path, note, updatedAt });
        }
      };
      clearReq.onerror = () => reject(clearReq.error);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  // ---------- Migration ----------
  async function migrateFromGMToIDB() {
    if (await gmGet(GM_MIGRATED_FLAG, null)) return;
    const raw = await gmGet(GM_MASTER_KEY, null);
    if (raw) {
      try {
        const obj = typeof raw === 'object' ? raw : JSON.parse(raw);
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          const entries = {};
          const now = Date.now();
          for (const [path, note] of Object.entries(obj)) entries[path] = { note: note || '', updatedAt: now };
          await idbBulkPutEntries(entries);
          if (AUTO_CLEANUP_GM_AFTER_MIGRATE) await gmDel(GM_MASTER_KEY);
          console.info('rym: migrated from GM to IndexedDB');
        }
      } catch (e) { console.warn('rym: failed to parse GM map', e); }
    }
    await gmSet(GM_MIGRATED_FLAG, '1');
  }

  async function migrateFromLocalStorageToIDB() {
    if (await gmGet(LS_MIGRATED_FLAG, null)) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LS_PREFIX)) keys.push(key);
    }
    if (keys.length) {
      const now = Date.now();
      const entries = {};
      for (const k of keys) {
        try {
          const path = k.replace(LS_PREFIX, '');
          entries[path] = { note: localStorage.getItem(k) || '', updatedAt: now };
        } catch (e) { console.warn('rym: LS read error', k, e); }
      }
      await idbBulkPutEntries(entries);
      if (AUTO_CLEANUP_LS_AFTER_MIGRATE) for (const k of keys) { try { localStorage.removeItem(k); } catch {} }
      console.info(`rym: migrated ${keys.length} entries from localStorage to IndexedDB`);
    }
    await gmSet(LS_MIGRATED_FLAG, '1');
  }

  // ---------- UI / DOM ----------
  let notesCache = {}; // simple map path -> note

  function addNoteUI(el) {
    const href = el.getAttribute('href'); if (!href) return;
    const path = pathFromHref(href);
    if (el.dataset.rymNoteProcessed) return;
    el.dataset.rymNoteProcessed = 'true';

    const noteText = notesCache[path] || '';

    const btn = document.createElement('button');
    btn.textContent = '✎';
    Object.assign(btn.style, { marginLeft: '4px', fontSize: '12px', cursor: 'pointer' });
    btn.title = 'Edit note';
    btn.dataset.rymNotePath = path;

    const span = document.createElement('span');
    span.textContent = noteText ? ` (${noteText})` : '';
    Object.assign(span.style, { fontSize: '11px', opacity: '0.7', marginLeft: '2px' });
    span.dataset.rymNotePath = path;

    btn.addEventListener('click', async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const current = notesCache[path] || '';
      const newNote = prompt('Note:', current);
      if (newNote !== null) {
        notesCache[path] = newNote;
        if (newNote === '') {
          await idbDelete(path);
        } else {
          await idbSet(path, newNote, Date.now());
        }
        refreshUIForPath(path);
        updatePanelStats();
        showToast('Note saved');
      }
    });

    try {
      if (el.nextSibling) {
        el.parentNode.insertBefore(btn, el.nextSibling);
        el.parentNode.insertBefore(span, btn.nextSibling);
      } else {
        el.parentNode.appendChild(btn);
        el.parentNode.appendChild(span);
      }
    } catch {
      el.parentNode.appendChild(btn);
      el.parentNode.appendChild(span);
    }
  }

  function processAll() {
    document.querySelectorAll(RELEASE_SELECTOR).forEach(addNoteUI);
  }

  // prevent redeclaration if script runs twice
  let observer = window.__rymNotesObserver;
  if (!observer) {
    observer = new MutationObserver(processAll);
    window.__rymNotesObserver = observer;
  } else {
    try { observer.disconnect(); } catch {}
  }

  function refreshUIForPath(path) {
    document.querySelectorAll('[data-rym-note-path]').forEach(node => {
      if (node.dataset.rymNotePath !== path) return;
      const note = notesCache[path] || '';
      if (node.tagName.toLowerCase() === 'button') return;
      node.textContent = note ? ` (${note})` : '';
    });
  }

  function refreshAllUI() {
    document.querySelectorAll('[data-rym-note-path]').forEach(node => {
      const p = node.dataset.rymNotePath;
      const note = notesCache[p] || '';
      if (node.tagName.toLowerCase() === 'button') return;
      node.textContent = note ? ` (${note})` : '';
    });
  }

  // ---------- EXPORT / IMPORT ----------
  function approxSizeBytes(obj) {
    try { return new Blob([JSON.stringify(obj)]).size; } catch { return (JSON.stringify(obj) || '').length; }
  }

  async function exportNotes() {
    const map = await idbGetAllSimpleMap();
    const json = JSON.stringify(map, null, 2);
    await copyToClipboard(json);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'rym_notes.json';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast('Exported and copied to clipboard');
  }

  function openImportModal() {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', left: 0, top: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', zIndex: 1000000, display: 'flex',
      alignItems: 'center', justifyContent: 'center'
    });
    const box = document.createElement('div');
    Object.assign(box.style, {
      width: '720px', maxWidth: '95%', maxHeight: '85%', overflow: 'auto',
      background: '#fff', color: '#000', padding: '12px',
      borderRadius: '8px', boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
    });
    overlay.appendChild(box);

    const h = document.createElement('div');
    h.textContent = 'Import notes (paste JSON). Accepts simple map {"/path":"note"} or extended {"version":2,"entries":{"/path":{"note":"","updatedAt":0}}}';
    h.style.fontWeight = '700'; h.style.marginBottom = '8px';
    box.appendChild(h);

    const ta = document.createElement('textarea');
    Object.assign(ta.style, { width: '100%', height: '320px', fontFamily: 'monospace', fontSize: '13px' });
    ta.value = '';
    box.appendChild(ta);

    const info = document.createElement('div');
    Object.assign(info.style, { marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' });

    const btnPrefill = document.createElement('button');
    btnPrefill.textContent = 'Paste current (for edit)';
    btnPrefill.addEventListener('click', async () => { ta.value = JSON.stringify(await idbGetAllSimpleMap(), null, 2); });

    const btnMerge = document.createElement('button');
    btnMerge.textContent = 'Merge (overwrite newer wins by updatedAt if provided)';
    btnMerge.addEventListener('click', async () => {
      try {
        const parsed = JSON.parse(ta.value);
        const entries = normalizeToEntries(parsed);
        await mergeEntriesIntoLocal(entries);
        notesCache = await idbGetAllSimpleMap();
        refreshAllUI(); updatePanelStats();
        showToast('Imported (merged)'); overlay.remove();
      } catch (e) { alert('Import failed: ' + e.message); }
    });

    const btnReplace = document.createElement('button');
    btnReplace.textContent = 'Replace (wipe & import)';
    btnReplace.addEventListener('click', async () => {
      try {
        const parsed = JSON.parse(ta.value);
        const entries = normalizeToEntries(parsed);
        await idbReplaceAllEntries(entries);
        notesCache = await idbGetAllSimpleMap();
        refreshAllUI(); updatePanelStats();
        showToast('Imported (replaced)'); overlay.remove();
      } catch (e) { alert('Import failed: ' + e.message); }
    });

    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.addEventListener('click', () => overlay.remove());

    info.appendChild(btnPrefill);
    info.appendChild(btnMerge);
    info.appendChild(btnReplace);
    info.appendChild(btnCancel);
    box.appendChild(info);

    document.body.appendChild(overlay);
  }

  // ---------- SYNC (GitHub Gist) ----------
  function normalizeToEntries(input) {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      if ('version' in input && input.version === 2 && input.entries && typeof input.entries === 'object') {
        const out = {};
        for (const [p, r] of Object.entries(input.entries)) {
          const u = (r && typeof r.updatedAt === 'number') ? r.updatedAt : Date.now();
          const n = (r && typeof r.note === 'string') ? r.note : (r || '');
          out[p] = { note: n, updatedAt: u };
        }
        return out;
      } else {
        const out = {};
        const now = Date.now();
        for (const [p, n] of Object.entries(input)) out[p] = { note: String(n ?? ''), updatedAt: now };
        return out;
      }
    }
    throw new Error('Unsupported JSON format');
  }

  async function makeSyncPayload() {
    const entries = await idbGetAllEntriesMap();
    return JSON.stringify({ version: 2, entries }, null, 2);
  }

  async function mergeEntriesIntoLocal(remoteEntries) {
    const local = await idbGetAllEntriesMap();
    const merged = { ...local };
    for (const [path, r] of Object.entries(remoteEntries)) {
      const L = merged[path];
      if (!L || (r.updatedAt || 0) > (L.updatedAt || 0)) {
        merged[path] = { note: r.note || '', updatedAt: r.updatedAt || Date.now() };
      }
    }
    await idbReplaceAllEntries(merged);
  }

  function httpRequest(opts) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        return reject(new Error('GM_xmlhttpRequest is required for cross-origin requests'));
      }
      GM_xmlhttpRequest({
        method: opts.method || 'GET',
        url: opts.url,
        headers: opts.headers || {},
        data: opts.data || null,
        responseType: opts.responseType || 'json',
        onload: (res) => resolve(res),
        onerror: (err) => reject(err),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  // improved: if gist exists but missing file -> patch to add file; otherwise create
  async function gistEnsureExists(token, gistId, filename) {
    const headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };

    // if gistId provided — check it
    if (gistId) {
      try {
        const res = await httpRequest({ method: 'GET', url: `https://api.github.com/gists/${gistId}`, headers, responseType: 'json' });
        if (res.status >= 200 && res.status < 300) {
          const data = (res.response !== undefined && res.response !== null) ? res.response : JSON.parse(res.responseText || '{}');
          // if file exists -> done
          if (data.files && data.files[filename]) return gistId;
          // else try to add file to existing gist (PATCH)
          try {
            const payload = { files: { [filename]: { content: await makeSyncPayload() } } };
            const p = await httpRequest({ method: 'PATCH', url: `https://api.github.com/gists/${gistId}`, headers, data: JSON.stringify(payload), responseType: 'json' });
            if (p.status >= 200 && p.status < 300) return gistId;
            throw new Error(`Failed to add file to gist: ${p.status} ${p.responseText || JSON.stringify(p.response)}`);
          } catch (e) {
            console.warn('rym: failed to add file to existing gist, will try to create new gist', e);
            // fallthrough to create new gist
          }
        }
      } catch (e) {
        console.warn('rym: gist GET failed (will try create)', e);
        // fallthrough to create new gist
      }
    }

    // create new gist
    const payload = {
      description: 'RYM Notes sync',
      public: false,
      files: { [filename]: { content: await makeSyncPayload() } },
    };
    const res = await httpRequest({
      method: 'POST',
      url: 'https://api.github.com/gists',
      headers,
      data: JSON.stringify(payload),
      responseType: 'json',
    });
    if (res.status >= 200 && res.status < 300) {
      const data = (res.response !== undefined && res.response !== null) ? res.response : JSON.parse(res.responseText || '{}');
      return data.id;
    }
    throw new Error(`Failed to create gist: ${res.status} ${res.responseText || JSON.stringify(res.response)}`);
  }

  async function gistPush(token, gistId, filename) {
    const headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };
    const payload = { files: { [filename]: { content: await makeSyncPayload() } } };
    const res = await httpRequest({
      method: 'PATCH',
      url: `https://api.github.com/gists/${gistId}`,
      headers,
      data: JSON.stringify(payload),
      responseType: 'json',
    });
    if (res.status >= 200 && res.status < 300) return true;
    throw new Error(`Push failed: ${res.status} ${res.responseText || JSON.stringify(res.response)}`);
  }

  async function gistPull(token, gistId, filename) {
    const headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github+json',
    };
    const res = await httpRequest({
      method: 'GET',
      url: `https://api.github.com/gists/${gistId}`,
      headers,
      responseType: 'json',
    });
    if (res.status >= 200 && res.status < 300) {
      const data = (res.response !== undefined && res.response !== null) ? res.response : JSON.parse(res.responseText || '{}');
      const file = data?.files?.[filename];
      if (!file || !file.content) throw new Error('File not found in gist (make sure filename is correct or use Ensure to create it)');
      return normalizeToEntries(JSON.parse(file.content));
    }
    throw new Error(`Pull failed: ${res.status} ${res.responseText || JSON.stringify(res.response)}`);
  }

  // ---------- Control Panel (incl. collapse + sync UI) ----------
  function createControlPanel() {
    if (document.getElementById('rym-notes-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'rym-notes-panel';
    Object.assign(panel.style, {
      position: 'fixed', right: '12px', bottom: '12px', zIndex: 999998,
      background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '10px',
      borderRadius: '10px', fontSize: '13px', boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
      display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '260px'
    });

    // header with collapse
    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', alignItems: 'center', gap: '8px' });

    const title = document.createElement('div');
    title.textContent = 'RYM Notes (IDB)';
    title.style.fontWeight = '700';
    title.style.flex = '1';

    const collapseBtn = document.createElement('button');
    collapseBtn.textContent = '–';
    collapseBtn.title = 'Collapse/Expand';
    Object.assign(collapseBtn.style, { width: '28px', height: '26px', cursor: 'pointer' });

    header.appendChild(title);
    header.appendChild(collapseBtn);
    panel.appendChild(header);

    const body = document.createElement('div');
    Object.assign(body.style, { display: 'flex', flexDirection: 'column', gap: '8px' });

    const stats = document.createElement('div');
    stats.id = 'rym-notes-stats';
    stats.style.fontSize = '12px';
    stats.style.opacity = '0.95';
    body.appendChild(stats);

    // Export / Import
    const row1 = document.createElement('div');
    row1.style.display = 'flex'; row1.style.gap = '6px';
    const bExp = document.createElement('button'); bExp.textContent = 'Export'; bExp.style.flex = '1'; bExp.onclick = exportNotes;
    const bImp = document.createElement('button'); bImp.textContent = 'Import'; bImp.style.flex = '1'; bImp.onclick = openImportModal;
    row1.appendChild(bExp); row1.appendChild(bImp);
    body.appendChild(row1);

    // Re-migrate
    const bRemig = document.createElement('button');
    bRemig.textContent = 'Re-migrate (GM/LS → IDB)';
    bRemig.style.fontSize = '12px';
    bRemig.onclick = async () => {
      await migrateFromGMToIDB();
      await migrateFromLocalStorageToIDB();
      notesCache = await idbGetAllSimpleMap();
      refreshAllUI(); updatePanelStats();
      showToast('Re-migration done');
    };
    body.appendChild(bRemig);

    // Sync section (Gist)
    const syncWrap = document.createElement('div');
    Object.assign(syncWrap.style, { background: 'rgba(255,255,255,0.06)', padding: '8px', borderRadius: '8px', marginTop: '4px' });

    const sTitle = document.createElement('div');
    sTitle.textContent = 'Sync (GitHub Gist)';
    sTitle.style.fontWeight = '700';
    sTitle.style.marginBottom = '6px';
    syncWrap.appendChild(sTitle);

    const inToken = inputRow('Token', 'password');
    const inGist  = inputRow('Gist ID', 'text');
    const inFile  = inputRow('Filename', 'text', DEFAULT_GIST_FILE);

    syncWrap.appendChild(inToken.wrap);
    syncWrap.appendChild(inGist.wrap);
    syncWrap.appendChild(inFile.wrap);

    const sBtns = document.createElement('div');
    sBtns.style.display = 'flex'; sBtns.style.gap = '6px'; sBtns.style.marginTop = '6px';

    const bSave = document.createElement('button'); bSave.textContent = 'Save';
    const bEnsure = document.createElement('button'); bEnsure.textContent = 'Ensure Gist';
    const bPull = document.createElement('button'); bPull.textContent = 'Pull';
    const bPush = document.createElement('button'); bPush.textContent = 'Push';
    const bPPM  = document.createElement('button'); bPPM.textContent = 'Pull & Merge';

    sBtns.appendChild(bSave); sBtns.appendChild(bEnsure); sBtns.appendChild(bPull); sBtns.appendChild(bPush); sBtns.appendChild(bPPM);
    syncWrap.appendChild(sBtns);

    body.appendChild(syncWrap);
    panel.appendChild(body);
    document.body.appendChild(panel);

    // load saved into inputs
    (async () => {
      inToken.input.value = (await gmGet(K_GIST_TOKEN, '')) || '';
      inGist.input.value  = (await gmGet(K_GIST_ID, '')) || '';
      inFile.input.value  = (await gmGet(K_GIST_FILE, DEFAULT_GIST_FILE)) || DEFAULT_GIST_FILE;
      // collapse state
      const collapsed = await gmGet(K_UI_COLLAPSED, false);
      setCollapsed(Boolean(collapsed));
    })();

    // collapse toggle
    function setCollapsed(state) {
      if (state) {
        body.style.display = 'none';
        collapseBtn.textContent = '+';
        panel.style.minWidth = '80px';
      } else {
        body.style.display = 'flex';
        collapseBtn.textContent = '–';
        panel.style.minWidth = '260px';
      }
      gmSet(K_UI_COLLAPSED, state);
    }
    collapseBtn.onclick = () => setCollapsed(body.style.display !== 'none');

    // Save action
    bSave.onclick = async () => {
      await gmSet(K_SYNC_PROVIDER, 'gist');
      await gmSet(K_GIST_TOKEN, inToken.input.value.trim());
      await gmSet(K_GIST_ID, inGist.input.value.trim());
      await gmSet(K_GIST_FILE, (inFile.input.value.trim() || DEFAULT_GIST_FILE));
      showToast('Sync settings saved');
    };

    // Always prefer live inputs; fallback to stored settings
    async function readSyncInputs() {
      const token = (inToken.input.value && inToken.input.value.trim()) || (await gmGet(K_GIST_TOKEN, '') || '').trim();
      const gistId = (inGist.input.value && inGist.input.value.trim()) || (await gmGet(K_GIST_ID, '') || '').trim();
      const file = (inFile.input.value && inFile.input.value.trim()) || (await gmGet(K_GIST_FILE, DEFAULT_GIST_FILE)) || DEFAULT_GIST_FILE;
      return { token, gistId, file };
    }

    // Ensure (create gist if needed / add file)
    bEnsure.onclick = async () => {
      try {
        const { token, gistId, file } = await readSyncInputs();
        if (!token) throw new Error('Token is empty (enter token in field or save settings)');
        const newGistId = await gistEnsureExists(token, gistId || '', file);
        await gmSet(K_GIST_ID, newGistId);
        await gmSet(K_GIST_TOKEN, token);
        await gmSet(K_GIST_FILE, file);
        inGist.input.value = newGistId;
        showToast('Gist ready: ' + newGistId);
      } catch (e) {
        console.error(e);
        alert('Ensure Gist failed: ' + (e && e.message ? e.message : e));
      }
    };

    bPull.onclick = async () => {
      try {
        const { token, gistId, file } = await readSyncInputs();
        if (!token || !gistId) throw new Error('Token or Gist ID missing');
        const remoteEntries = await gistPull(token, gistId, file);
        await idbReplaceAllEntries(remoteEntries);
        notesCache = await idbGetAllSimpleMap();
        refreshAllUI(); updatePanelStats();
        showToast('Pulled from Gist');
      } catch (e) {
        console.error(e);
        alert('Pull failed: ' + (e && e.message ? e.message : e));
      }
    };

    bPush.onclick = async () => {
      try {
        const { token, gistId: _gistIdInput, file } = await readSyncInputs();
        if (!token) throw new Error('Token is empty');
        // prefer input gist id if present, else use stored
        let gistId = _gistIdInput;
        gistId = await gistEnsureExists(token, gistId, file); // will create or add file if necessary
        await gmSet(K_GIST_ID, gistId);
        await gmSet(K_GIST_FILE, file);
        await gistPush(token, gistId, file);
        inGist.input.value = gistId;
        showToast('Pushed to Gist');
      } catch (e) {
        console.error(e);
        alert('Push failed: ' + (e && e.message ? e.message : e));
      }
    };

    bPPM.onclick = async () => {
      try {
        const { token, gistId, file } = await readSyncInputs();
        if (!token || !gistId) throw new Error('Token or Gist ID missing');
        const remote = await gistPull(token, gistId, file);
        await mergeEntriesIntoLocal(remote);
        notesCache = await idbGetAllSimpleMap();
        refreshAllUI(); updatePanelStats();
        await gistPush(token, gistId, file);
        showToast('Pulled, merged, pushed');
      } catch (e) {
        console.error(e);
        alert('Pull & Merge failed: ' + (e && e.message ? e.message : e));
      }
    };

    function inputRow(label, type = 'text', placeholder = '') {
      const wrap = document.createElement('div');
      wrap.style.display = 'flex'; wrap.style.gap = '6px'; wrap.style.alignItems = 'center';
      const lab = document.createElement('div'); lab.textContent = label; lab.style.minWidth = '70px';
      const input = document.createElement('input');
      input.type = type; input.placeholder = placeholder;
      Object.assign(input.style, { flex: '1', fontSize: '12px', padding: '4px' });
      wrap.appendChild(lab); wrap.appendChild(input);
      return { wrap, input };
    }
  }

  async function updatePanelStats() {
    const el = document.getElementById('rym-notes-stats');
    if (!el) return;
    const simple = await idbGetAllSimpleMap();
    const count = Object.keys(simple).length;
    const size = approxSizeBytes(simple);
    const kb = (size / 1024).toFixed(1);
    el.textContent = `Entries: ${count} | ~${kb} KB`;
  }

  // ---------- Boot ----------
  await migrateFromGMToIDB();
  await migrateFromLocalStorageToIDB();

  notesCache = await idbGetAllSimpleMap();

  const observerConfig = { childList: true, subtree: true };
  try {
    observer.observe(document.body, observerConfig);
  } catch (e) {
    try { observer.disconnect(); observer.observe(document.body, observerConfig); } catch {}
  }
  processAll();
  window.addEventListener('load', processAll);

  createControlPanel();
  updatePanelStats();

  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('RYM Notes: Export', exportNotes);
      GM_registerMenuCommand('RYM Notes: Import (open modal)', openImportModal);
      GM_registerMenuCommand('RYM Notes: Sync → Push (Gist)', async () => {
        const token = (await gmGet(K_GIST_TOKEN, '')).trim();
        let gistId  = (await gmGet(K_GIST_ID, '')).trim();
        const file  = (await gmGet(K_GIST_FILE, DEFAULT_GIST_FILE)) || DEFAULT_GIST_FILE;
        if (!token) return alert('Set GitHub token in panel first');
        gistId = await gistEnsureExists(token, gistId, file);
        await gmSet(K_GIST_ID, gistId);
        await gistPush(token, gistId, file);
        showToast('Pushed to Gist');
      });
      GM_registerMenuCommand('RYM Notes: Sync ← Pull (Gist)', async () => {
        const token = (await gmGet(K_GIST_TOKEN, '')).trim();
        const gistId= (await gmGet(K_GIST_ID, '')).trim();
        const file  = (await gmGet(K_GIST_FILE, DEFAULT_GIST_FILE)) || DEFAULT_GIST_FILE;
        if (!token || !gistId) return alert('Set GitHub token and Gist ID in panel first');
        const remote = await gistPull(token, gistId, file);
        await idbReplaceAllEntries(remote);
        notesCache = await idbGetAllSimpleMap();
        refreshAllUI(); updatePanelStats();
        showToast('Pulled from Gist');
      });
      GM_registerMenuCommand('RYM Notes: Sync ↔ Pull&Merge (Gist)', async () => {
        const token = (await gmGet(K_GIST_TOKEN, '')).trim();
        const gistId= (await gmGet(K_GIST_ID, '')).trim();
        const file  = (await gmGet(K_GIST_FILE, DEFAULT_GIST_FILE)) || DEFAULT_GIST_FILE;
        if (!token || !gistId) return alert('Set GitHub token and Gist ID in panel first');
        const remote = await gistPull(token, gistId, file);
        await mergeEntriesIntoLocal(remote);
        notesCache = await idbGetAllSimpleMap();
        refreshAllUI(); updatePanelStats();
        await gistPush(token, gistId, file);
        showToast('Pulled, merged, pushed');
      });
    }
  } catch (e) {
    console.warn('GM menu registration failed', e);
  }
})();
