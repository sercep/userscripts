// ==UserScript==
// @name         RYM: All releases chart from artist page
// @namespace    https://github.com/sercep/userscripts
// @version      1.0
// @description  Add link to popular songs chart and link to all releases chart from this artist sorted by popularity (including live, archival, soundtracks and scores)
// @author       sercep
// @match        https://rateyourmusic.com/artist/*
// ==/UserScript==

(function() {
    'use strict';
    var url = document.URL;
    var artistlink = "https://rateyourmusic.com/artist/";
    var artistname = url.replace(artistlink, '');
    document.querySelector(".page_artist_section_song_guide").innerHTML = "<span class=\"highlighted\"><i class=\"fa fa-caret-down\"></i><a href=\"https://rateyourmusic.com/charts/popular/song/all-time/a:" + artistname + "/\"> Popular songs</a></span> <span>|</span> <span class=\"\"><a href=\"https://rateyourmusic.com/charts/top/song/all-time/a:" + artistname + "/\">Top songs</a></span><span>|</span><span class=\"\"><a href=\"https://rateyourmusic.com/charts/popular/album,ep,comp,single,video,unauth,mixtape,musicvideo,djmix,additional/all-time/a:" + artistname + "/incl:live,archival,soundtrack/\">All releases</a></span>";
})();