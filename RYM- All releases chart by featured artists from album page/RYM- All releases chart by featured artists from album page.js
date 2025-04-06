// ==UserScript==
// @name         RYM: All releases chart by featured artists from album page
// @namespace    https://github.com/sercep/userscripts
// @version      0.1
// @description  Add links to all releases chart by featured artists sorted by popularity on album page
// @author       sercep
// @match        https://rateyourmusic.com/artist/*
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const artistAnchors = document.querySelectorAll('ul.credits li.featured_credit a.artist');
    const artistSet = new Set();
    artistAnchors.forEach(a => {
        const href = a.getAttribute('href');
        if (!href) return;
        const parts = href.split('/');
        if (parts.length >= 3 && parts[1] === 'artist') {
            artistSet.add(parts[2]);
        }
    });
    if (artistSet.size === 0) return;

    const artistParam = Array.from(artistSet).join(',');
    const chartsUrl = `https://rateyourmusic.com/charts/popular/album,ep,comp,single,video,unauth,mixtape,musicvideo,djmix,additional/all-time/a:${artistParam}/incl:live,archival,soundtrack/`;

    const outerDiv = document.createElement('div');
    outerDiv.className = 'hide-for-small';

    outerDiv.style.width = '90%';
    outerDiv.style.maxWidth = '1200px';
    outerDiv.style.margin = '0 auto';
    outerDiv.style.padding = '0';

    const newSection = document.createElement('div');
    newSection.className = 'section_charts';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'release_page_header hide-for-small';

    const h2 = document.createElement('h2');
    const link = document.createElement('a');
    link.href = chartsUrl;
    link.textContent = 'All releases by featured artists';
    link.style.color = '#0077cc';
    link.style.textDecoration = 'none';

    h2.appendChild(link);
    headerDiv.appendChild(h2);
    newSection.appendChild(headerDiv);

    const table = document.createElement('table');
    table.className = 'color_bar';
    table.style.cssText = 'width:100%;height:1px;font-size:1px;padding:0;';
    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');
    tr.style.cssText = 'height:1px;padding:0;';
    tbody.appendChild(tr);
    table.appendChild(tbody);
    newSection.appendChild(table);

    outerDiv.appendChild(newSection);

    const trackSections = document.querySelectorAll('.section_tracklisting');
    let targetSection = null;
    trackSections.forEach(section => {
        if (section.textContent.includes("Track listing")) {
            targetSection = section;
        }
    });
    if (targetSection && targetSection.parentNode) {
        targetSection.parentNode.insertBefore(outerDiv, targetSection.nextSibling);
    } else {
        document.body.appendChild(outerDiv);
    }
})();
