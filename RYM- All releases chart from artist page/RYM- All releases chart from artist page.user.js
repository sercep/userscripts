// ==UserScript==
// @name         RYM: All releases chart from artist page
// @namespace    https://github.com/sercep/userscripts
// @version      1.1.1
// @description  Add link to all releases chart from this artist sorted by popularity on artist page
// @author       sercep
// @match        https://rateyourmusic.com/artist/*
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';
    var url = document.URL;
    var artistlink = "https://rateyourmusic.com/artist/";
    var artistname = url.replace(artistlink, '');
    var songratings = document.querySelector(".page_artist_tracks_track_stats_scores").lastElementChild.textContent.trim().replace("k","000");
    // console.log(songratings);
    if (songratings>300) {
        document.querySelector(".page_artist_section_song_guide").innerHTML = "<span class=\"highlighted\"><i class=\"fa fa-caret-down\"></i><a href=\"https://rateyourmusic.com/charts/popular/song/all-time/a:" + artistname + "/\"> Popular songs</a></span> <span>|</span> <span class=\"\"><a href=\"https://rateyourmusic.com/charts/top/song/all-time/a:" + artistname + "/\">Top songs</a></span><span>|</span><span class=\"\"><a href=\"https://rateyourmusic.com/charts/popular/album,ep,comp,single,video,unauth,mixtape,musicvideo,djmix,additional/all-time/a:" + artistname + "/incl:live,archival,soundtrack/\">All releases</a></span>";
    }
    else {
        document.querySelector(".page_artist_section_song_guide").innerHTML = "<span class=\"highlighted\"><i class=\"fa fa-caret-down\"></i><a href=\"https://rateyourmusic.com/charts/popular/song/all-time/a:" + artistname + "/\"> Popular songs</a></span> <span>|</span> <span class=\"\"><a href=\"https://rateyourmusic.com/charts/esoteric/song/all-time/a:" + artistname + "/\">Top (esoteric) songs</a></span><span>|</span><span class=\"\"><a href=\"https://rateyourmusic.com/charts/popular/album,ep,comp,single,video,unauth,mixtape,musicvideo,djmix,additional/all-time/a:" + artistname + "/incl:live,archival,soundtrack/\">All releases</a></span>";
    }
})();
