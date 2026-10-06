// ==UserScript==
// @name         Leterboxd: Hide 2024 and 2025 Movies
// @namespace    https://github.com/sercep/userscripts
// @version      0.2
// @description  Hides movies from 2024 and 2025 on Letterboxd's Browse Films page
// @author       sercep
// @match        https://letterboxd.com/*
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    let isHidden = false;

    function createToggleButton() {
        const button = document.createElement('button');
        button.textContent = 'Show 2024-2025 Movies';
        button.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            padding: 10px 20px;
            background-color: #00e054;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
        `;
        
        button.addEventListener('click', () => {
            isHidden = !isHidden;
            button.textContent = isHidden ? 'Show 2024-2025 Movies' : 'Hide 2024-2025 Movies';
            updateMoviesVisibility();
        });

        document.body.appendChild(button);
    }

    function updateMoviesVisibility() {
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
                item.style.display = isHidden ? 'none' : '';
            }
        });
    }

    createToggleButton();
    updateMoviesVisibility();

    const observer = new MutationObserver(updateMoviesVisibility);
    observer.observe(document.body, { childList: true, subtree: true });
})();