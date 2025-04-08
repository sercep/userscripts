// ==UserScript==
// @name         RYM: All releases chart from album page
// @namespace    https://github.com/sercep/userscripts
// @version      0.2
// @description  Add links to all releases chart by featured and credited artists on album page
// @author       sercep
// @match        https://rateyourmusic.com/release/*
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    function collectArtistsFrom(selector) {
        const anchors = document.querySelectorAll(selector);
        const result = [];
        anchors.forEach(a => {
            const href = a.getAttribute('href');
            if (!href) return;
            const parts = href.split('/');
            if (parts.length >= 3 && parts[1] === 'artist') {
                const artistId = parts[2];
                if (!result.includes(artistId)) {
                    result.push(artistId);
                }
            }
        });
        return result;
    }

    const featuredArtists = collectArtistsFrom('ul.credits li.featured_credit a.artist');

    const mainCredits = collectArtistsFrom('ul.credits > li a.artist');
    const minorCredits = collectArtistsFrom('#minor_credits_ a.artist');

    const allCreditedArtists = [...mainCredits];
    for (const a of minorCredits) {
        if (!allCreditedArtists.includes(a)) {
            allCreditedArtists.push(a);
        }
    }

    if (featuredArtists.length === 0 && allCreditedArtists.length === 0) return;

    const buildChartUrl = (artistArray) => {
        const artistParam = artistArray.join(',');
        return `https://rateyourmusic.com/charts/popular/album,ep,comp,single,video,unauth,mixtape,musicvideo,djmix,additional/all-time/a:${artistParam}/incl:live,archival,soundtrack/`;
    };

    const outerDiv = document.createElement('div');
    outerDiv.className = 'section-for-charts';
    outerDiv.style.width = '90%';
    outerDiv.style.maxWidth = '1200px';
    outerDiv.style.margin = '0 auto';
    outerDiv.style.padding = '0';

    const newSection = document.createElement('div');
    newSection.className = 'section_charts';

    const headerDiv1 = document.createElement('div');
    headerDiv1.className = 'release_page_header';
    const h2 = document.createElement('h2');
    h2.textContent = 'Charts';
    headerDiv1.appendChild(h2);
    newSection.appendChild(headerDiv1);

    if (featuredArtists.length > 0) {
        const featuredUrl = buildChartUrl(featuredArtists);
        const headerDiv2 = document.createElement('div');
        headerDiv2.className = 'release_page_header';
        const link1 = document.createElement('a');
        link1.href = featuredUrl;
        link1.textContent = 'All releases by featured artists';
        link1.style.color = '#0077cc';
        link1.style.textDecoration = 'none';
        headerDiv2.appendChild(link1);
        newSection.appendChild(headerDiv2);
    }

    if (allCreditedArtists.length > 0) {
        const creditedUrl = buildChartUrl(allCreditedArtists);
        const headerDiv3 = document.createElement('div');
        headerDiv3.className = 'release_page_header';
        const link2 = document.createElement('a');
        link2.href = creditedUrl;
        link2.textContent = 'All releases by credited artists';
        link2.style.color = '#0077cc';
        link2.style.textDecoration = 'none';
        headerDiv3.appendChild(link2);
        newSection.appendChild(headerDiv3);
    }

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

    const listSection = document.querySelector('.section_lists');
    if (listSection && listSection.parentNode) {
        listSection.parentNode.insertBefore(outerDiv, listSection);
    } else {
        document.body.appendChild(outerDiv);
    }
})();
