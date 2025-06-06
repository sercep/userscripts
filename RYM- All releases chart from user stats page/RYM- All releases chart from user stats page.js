// ==UserScript==
// @name         RYM: All releases chart from user stats page
// @namespace    https://github.com/sercep/userscripts
// @version      0.1.0
// @description  Add a link to a chart containing all artists from the stats page
// @author       sercep
// @match        https://rateyourmusic.com/stats/*
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // Function to extract artist names from the stats page
    function extractArtists() {
        const artistLinks = document.querySelectorAll('table.mbgen a.artist');
        const artists = Array.from(artistLinks).map(link => {
            // Get the artist name from the href attribute
            const href = link.getAttribute('href');
            return href.split('/artist/')[1];
        });
        return artists;
    }

    // Function to create the chart link
    function createChartLink(artists) {
        const baseUrl = 'https://rateyourmusic.com/charts/popular/album,ep,comp,single,video,unauth,mixtape,musicvideo,djmix,additional/all-time/';
        const artistParam = `a:${artists.join(',')}`;
        const includeParam = 'incl:live,archival,soundtrack/';
        return `${baseUrl}${artistParam}/${includeParam}`;
    }

    // Function to add the link to the page
    function addChartLink() {
        const artists = extractArtists();
        const chartLink = createChartLink(artists);

        // Create link element
        const linkElement = document.createElement('a');
        linkElement.href = chartLink;
        linkElement.textContent = 'View all releases chart';
        linkElement.style.display = 'block';
        linkElement.style.margin = '10px 0';
        linkElement.style.padding = '5px';
        linkElement.style.backgroundColor = 'var(--mono-e)';
        linkElement.style.border = '1px solid var(--mono-a)';
        linkElement.style.borderRadius = '3px';
        linkElement.style.textAlign = 'center';
        linkElement.style.textDecoration = 'none';
        linkElement.style.color = 'var(--mono-a)';

        // Find the "Ownership by Label" section
        const labelSection = Array.from(document.querySelectorAll('h3')).find(h3 => h3.textContent.includes('Ownership by Artist'));
        if (labelSection) {
            // Insert the link after the label section's div
            const labelDiv = labelSection.nextElementSibling.nextElementSibling; // Skip the <br> element
            if (labelDiv) {
                labelDiv.parentNode.insertBefore(linkElement, labelDiv.nextSibling);
            }
        }
    }

    // Run the script when the page is loaded
    window.addEventListener('load', addChartLink);
})();