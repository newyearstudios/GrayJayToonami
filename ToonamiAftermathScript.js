// Toonami Aftermath - Grayjay plugin
// Each live channel is exposed as a "creator" with one live stream.
//
// Stream URL pattern: <streamBase>/<slug>/playlist.m3u8
// Schedule (optional): <apiBase>/channelsCurrentMedia?startDate=<ISO>

var PLATFORM = "Toonami Aftermath";
var SITE = "https://www.toonamiaftermath.com/";

var CHANNELS = [
  { slug: "est",      name: "Toonami Aftermath East",   apiName: "Toonami Aftermath East",   west: false,
    description: "The main Toonami Aftermath feed (Eastern time)." },
  { slug: "pst",      name: "Toonami Aftermath West",   apiName: "Toonami Aftermath West",   west: true,
    description: "The Toonami Aftermath feed on Pacific time." },
  { slug: "movies",   name: "Toonami Aftermath Movies", apiName: "Movies",                   west: false,
    description: "Movies channel." },
  { slug: "radio",    name: "Toonami Aftermath Radio",  apiName: "Toonami Aftermath Radio",  west: false,
    description: "Radio channel (audio-focused stream)." },
  { slug: "snick-est", name: "Snickelodeon East",       apiName: "Snickelodeon East",        west: false,
    description: "Snickelodeon, Eastern feed." },
  { slug: "snick-pst", name: "Snickelodeon West",       apiName: "Snickelodeon West",        west: true,
    description: "Snickelodeon, Pacific feed." },
  { slug: "mtv97",    name: "MTV97",                    apiName: "MTV97",                    west: false,
    description: "MTV97 channel." }
];

var _schedule = { at: 0, data: null };
var SCHEDULE_TTL_MS = 60 * 1000;

// ---------------------------------------------------------------- helpers

function setting(name, fallback) {
  try {
    if (typeof _settings !== "undefined" && _settings && _settings[name] !== undefined && _settings[name] !== null && _settings[name] !== "") {
      return _settings[name];
    }
  } catch (e) {}
  return fallback;
}

function boolSetting(name, fallback) {
  var v = setting(name, fallback);
  return v === true || v === "true" || v === 1 || v === "1";
}

function trimSlash(s) {
  return String(s).replace(/\/+$/, "");
}

function iconUrl() {
  try {
    if (typeof config !== "undefined" && config && config.iconUrl) return config.iconUrl;
  } catch (e) {}
  return "";
}

function thumbs() {
  var u = iconUrl();
  return u ? new Thumbnails([new Thumbnail(u, 0)]) : new Thumbnails([]);
}

function channelBySlug(slug) {
  for (var i = 0; i < CHANNELS.length; i++) {
    if (CHANNELS[i].slug === slug) return CHANNELS[i];
  }
  return null;
}

function channelUrl(ch) { return SITE + "#/channel/" + ch.slug; }
function watchUrl(ch)   { return SITE + "#/watch/" + ch.slug; }

function slugFromUrl(url) {
  var m = /#\/(?:channel|watch)\/([A-Za-z0-9_-]+)/.exec(String(url));
  return m ? m[1] : null;
}

function streamUrl(ch) {
  return trimSlash(setting("streamBase", "http://api.toonamiaftermath.com:3000")) + "/" + ch.slug + "/playlist.m3u8";
}

function authorLink(ch) {
  return new PlatformAuthorLink(
    new PlatformID(PLATFORM, ch.slug, config.id),
    ch.name,
    channelUrl(ch),
    iconUrl(),
    0
  );
}

// ---------------------------------------------------------------- schedule

function fetchSchedule() {
  if (!boolSetting("showNowPlaying", true)) return null;
  var nowMs = Date.now();
  if (_schedule.data && (nowMs - _schedule.at) < SCHEDULE_TTL_MS) return _schedule.data;

  try {
    // Ask from an hour back so the currently running item is included.
    var start = new Date(nowMs - 60 * 60 * 1000).toISOString();
    var url = trimSlash(setting("apiBase", "https://api.toonamiaftermath.com")) +
      "/channelsCurrentMedia?startDate=" + encodeURIComponent(start);
    var res = http.GET(url, {}, false);
    if (!res || !res.isOk) return _schedule.data; // keep stale data if any
    var json = JSON.parse(res.body);
    if (!Array.isArray(json)) return _schedule.data;
    _schedule = { at: nowMs, data: json };
    return json;
  } catch (e) {
    log("Toonami schedule fetch failed: " + e);
    return _schedule.data;
  }
}

// Returns { show, episode, startMs } or null. Never throws.
function nowPlaying(ch) {
  try {
    var data = fetchSchedule();
    if (!data) return null;

    var entry = null;
    for (var i = 0; i < data.length; i++) {
      if (data[i] && data[i].name === ch.apiName) { entry = data[i]; break; }
    }
    if (!entry || !Array.isArray(entry.media) || entry.media.length === 0) return null;

    var shiftH = ch.west ? parseFloat(setting("westShiftHours", "0")) : 0;
    if (isNaN(shiftH)) shiftH = 0;
    var shiftMs = shiftH * 3600 * 1000;
    var nowMs = Date.now();

    var best = null, bestStart = -Infinity;
    for (var j = 0; j < entry.media.length; j++) {
      var m = entry.media[j];
      if (!m || !m.startDate) continue;
      var s = Date.parse(m.startDate) + shiftMs;
      if (isNaN(s)) continue;
      if (s <= nowMs && s > bestStart) { best = m; bestStart = s; }
    }
    if (!best) return null;

    var info = best.info || {};
    return {
      show: info.fullname || best.name || "",
      episode: info.episode || "",
      block: best.blockName || "",
      startMs: bestStart
    };
  } catch (e) {
    log("Toonami nowPlaying failed: " + e);
    return null;
  }
}

function liveTitle(ch) {
  var np = nowPlaying(ch);
  if (!np || !np.show) return ch.name + " (Live)";
  var t = np.show + (np.episode ? " - " + np.episode : "");
  return t + " | " + ch.name;
}

// ---------------------------------------------------------------- builders

function toPlatformVideo(ch) {
  return new PlatformVideo({
    id: new PlatformID(PLATFORM, "live-" + ch.slug, config.id),
    name: liveTitle(ch),
    thumbnails: thumbs(),
    author: authorLink(ch),
    datetime: Math.floor(Date.now() / 1000),
    duration: 0,
    viewCount: 0,
    url: watchUrl(ch),
    isLive: true
  });
}

function toPlatformChannel(ch) {
  return new PlatformChannel({
    id: new PlatformID(PLATFORM, ch.slug, config.id),
    name: ch.name,
    thumbnail: iconUrl(),
    banner: null,
    subscribers: 0,
    description: ch.description,
    url: channelUrl(ch),
    urlAlternatives: [channelUrl(ch), watchUrl(ch)],
    links: { "Website": SITE }
  });
}

function matches(ch, query) {
  if (!query) return true;
  var q = String(query).toLowerCase();
  return ch.name.toLowerCase().indexOf(q) !== -1 ||
         ch.slug.toLowerCase().indexOf(q) !== -1 ||
         ch.description.toLowerCase().indexOf(q) !== -1;
}

// ---------------------------------------------------------------- source API

source.enable = function (conf, settings, savedState) {
  // Nothing to log in to; settings are read lazily via _settings.
};

source.getHome = function () {
  var videos = [];
  for (var i = 0; i < CHANNELS.length; i++) videos.push(toPlatformVideo(CHANNELS[i]));
  return new ContentPager(videos, false);
};

source.searchSuggestions = function (query) {
  var out = [];
  for (var i = 0; i < CHANNELS.length; i++) {
    if (matches(CHANNELS[i], query)) out.push(CHANNELS[i].name);
  }
  return out;
};

source.getSearchCapabilities = function () {
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological],
    filters: []
  };
};

source.search = function (query, type, order, filters, continuationToken) {
  var videos = [];
  for (var i = 0; i < CHANNELS.length; i++) {
    if (matches(CHANNELS[i], query)) videos.push(toPlatformVideo(CHANNELS[i]));
  }
  return new ContentPager(videos, false);
};

source.getSearchChannelContentsCapabilities = function () {
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological],
    filters: []
  };
};

source.searchChannelContents = function (channelUrl_, query, type, order, filters, continuationToken) {
  var ch = channelBySlug(slugFromUrl(channelUrl_));
  if (!ch || !matches(ch, query) && query) return new ContentPager([], false);
  return new ContentPager([toPlatformVideo(ch)], false);
};

source.searchChannels = function (query, continuationToken) {
  var channels = [];
  for (var i = 0; i < CHANNELS.length; i++) {
    if (matches(CHANNELS[i], query)) channels.push(toPlatformChannel(CHANNELS[i]));
  }
  return new ChannelPager(channels, false);
};

source.isChannelUrl = function (url) {
  var u = String(url);
  return /^https?:\/\/(www\.)?toonamiaftermath\.com\/?#\/channel\/[A-Za-z0-9_-]+/.test(u) &&
         channelBySlug(slugFromUrl(u)) !== null;
};

source.getChannel = function (url) {
  var ch = channelBySlug(slugFromUrl(url));
  if (!ch) throw new ScriptException("Unknown Toonami Aftermath channel: " + url);
  return toPlatformChannel(ch);
};

source.getChannelCapabilities = function () {
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological],
    filters: []
  };
};

source.getChannelContents = function (url, type, order, filters, continuationToken) {
  var ch = channelBySlug(slugFromUrl(url));
  if (!ch) throw new ScriptException("Unknown Toonami Aftermath channel: " + url);
  return new ContentPager([toPlatformVideo(ch)], false);
};

source.isContentDetailsUrl = function (url) {
  var u = String(url);
  return /^https?:\/\/(www\.)?toonamiaftermath\.com\/?#\/watch\/[A-Za-z0-9_-]+/.test(u) &&
         channelBySlug(slugFromUrl(u)) !== null;
};

source.getContentDetails = function (url) {
  var ch = channelBySlug(slugFromUrl(url));
  if (!ch) throw new ScriptException("Unknown Toonami Aftermath stream: " + url);

  var np = nowPlaying(ch);
  var desc = ch.description;
  if (np && np.show) {
    desc = "Now playing: " + np.show + (np.episode ? " - " + np.episode : "") +
           (np.block ? "\nBlock: " + np.block : "") + "\n\n" + ch.description;
  }

  var hls = new HLSSource({
    name: "Live",
    duration: 0,
    url: streamUrl(ch),
    priority: true
  });

  return new PlatformVideoDetails({
    id: new PlatformID(PLATFORM, "live-" + ch.slug, config.id),
    name: liveTitle(ch),
    thumbnails: thumbs(),
    author: authorLink(ch),
    datetime: Math.floor(Date.now() / 1000),
    duration: 0,
    viewCount: 0,
    url: watchUrl(ch),
    isLive: true,
    shareUrl: SITE,
    description: desc,
    video: new VideoSourceDescriptor([hls]),
    live: null,
    rating: new RatingLikes(0),
    subtitles: []
  });
};

log("Toonami Aftermath plugin loaded");
