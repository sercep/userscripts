// ==UserScript==
// @name         Leterboxd: Hide 2024 and 2025 Movies
// @namespace    https://github.com/sercep/userscripts
// @version      0.1
// @description  Hides movies from 2024 and 2025 on Letterboxd's Browse Films page
// @author       sercep
// @match        https://letterboxd.com/films/*
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    function hideMoviesByYear() {
        document.querySelectorAll('.film-detail, .film-poster, .poster-list li, .film-list li').forEach(function(item) {
            let yearText = '';
            let yearElem = item.querySelector('.film-year, .poster-year, .year, .film-poster-year');
            if (yearElem) {
                yearText = yearElem.textContent.trim();
            } else {
                let match = item.textContent.match(/\b(2024|2025)\b/);
                if (match) yearText = match[0];
            }
            if (yearText === '2024' || yearText === '2025') {
                item.style.display = 'none';
            }
        });
    }

    hideMoviesByYear();

    const observer = new MutationObserver(hideMoviesByYear);
    observer.observe(document.body, { childList: true, subtree: true });
})();