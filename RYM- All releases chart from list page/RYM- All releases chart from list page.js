// ==UserScript==
// @name         RYM: All releases chart from list page
// @namespace    https://github.com/sercep/userscripts
// @version      0.1.0
// @description  Add a link to a chart containing all artists from a list page
// @author       sercep
// @match        https://rateyourmusic.com/list/*/*
// @license      MIT
// ==/UserScript==
(function() {
    'use strict';

    function extractArtists() {
        const artistLinks = document.querySelectorAll('#user_list a.list_artist');
        const seen = new Set();
        const artists = [];
        for (const link of artistLinks) {
            const href = link.getAttribute('href');
            const slug = href.split('/artist/')[1];
            if (slug && !seen.has(slug)) {
                seen.add(slug);
                artists.push(slug);
            }
        }
        return artists;
    }

    function createChartUrl(artists) {
        const base = 'https://rateyourmusic.com/charts/popular/album,ep,comp,single,video,unauth,mixtape,musicvideo,djmix,additional/all-time/';
        return `${base}a:${artists.join(',')}/incl:live,archival,soundtrack/`;
    }

    function addChartLink() {
        const artists = extractArtists();
        if (!artists.length) return;

        const linkElement = document.createElement('a');
        linkElement.href = createChartUrl(artists);
        linkElement.textContent = `View all releases chart (${artists.length} artists)`;
        linkElement.style.display = 'block';
        linkElement.style.margin = '10px 0';
        linkElement.style.padding = '5px';
        linkElement.style.backgroundColor = 'var(--mono-e)';
        linkElement.style.border = '1px solid var(--mono-a)';
        linkElement.style.borderRadius = '3px';
        linkElement.style.textAlign = 'center';
        linkElement.style.textDecoration = 'none';
        linkElement.style.color = 'var(--mono-a)';

        const listTable = document.getElementById('user_list');
        if (listTable) {
            listTable.parentNode.insertBefore(linkElement, listTable);
        }
    }

    window.addEventListener('load', addChartLink);
})();