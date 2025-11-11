#!/usr/bin/env node
const express = require('express');
const cors = require('cors');
const { AsyncDeviceDiscovery, Sonos } = require('sonos');
const { CalendarFeed, normalizeFeedUrl } = require('./calendar-feed');

// Enkel lokal Sonos-controller der eksponerer et JSON-API til Webkiosk.
// Kør `npm install` og derefter `npm start` for at starte tjenesten på port 8789.

const PORT = process.env.PORT || 8789;
const DISCOVERY_INTERVAL_MS = Number(process.env.SONOS_DISCOVERY_INTERVAL || 15000);
const POLL_TIMEOUT_MS = Number(process.env.SONOS_POLL_TIMEOUT || 5000);
const DEFAULT_CALENDAR_REFRESH_HOURS = (() => {
  const value = Number(process.env.CALENDAR_REFRESH_INTERVAL_HOURS);
  return Number.isFinite(value) && value > 0 ? value : 6;
})();
const DEFAULT_CALENDAR_LOOKAHEAD_DAYS = (() => {
  const value = Number(process.env.CALENDAR_LOOKAHEAD_DAYS);
  return Number.isFinite(value) && value >= 0 ? value : 90;
})();
const DEFAULT_CALENDAR_LOOKBEHIND_DAYS = (() => {
  const value = Number(process.env.CALENDAR_LOOKBEHIND_DAYS);
  return Number.isFinite(value) && value >= 0 ? value : 7;
})();

const app = express();
app.use(cors());
app.use(express.json());

let calendarFeed = null;

if (process.env.CALENDAR_FEED_URL) {
  setupCalendarFeed(process.env.CALENDAR_FEED_URL).catch((err) => {
    console.error('[calendar] init-fejl', err);
  });
}

const discovery = new AsyncDeviceDiscovery();
let topologyCache = new Map();
let lastDiscovery = 0;
let favoritesCache = [];
let favoritesUpdated = 0;

function parsePositiveNumber(value, fieldName) {
  if (value == null) {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${fieldName} skal være et positivt tal`);
  }
  return number;
}

function parseNonNegativeNumber(value, fieldName) {
  if (value == null) {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} skal være et ikke-negativt tal`);
  }
  return number;
}

async function setupCalendarFeed(feedUrl, options = {}) {
  const normalizedUrl = normalizeFeedUrl(feedUrl);
  const refreshIntervalHours = options.refreshIntervalHours ?? DEFAULT_CALENDAR_REFRESH_HOURS;
  const lookAheadDays = options.lookAheadDays ?? DEFAULT_CALENDAR_LOOKAHEAD_DAYS;
  const lookBehindDays = options.lookBehindDays ?? DEFAULT_CALENDAR_LOOKBEHIND_DAYS;
  if (calendarFeed) {
    calendarFeed.stop();
  }
  calendarFeed = new CalendarFeed({
    feedUrl: normalizedUrl,
    refreshIntervalHours,
    lookAheadDays,
    lookBehindDays
  });
  try {
    await calendarFeed.start();
    console.log(`[calendar] Hentede kalender-feed ${normalizedUrl}`);
  } catch (err) {
    console.error('[calendar] kunne ikke starte kalender-feed', err);
    throw err;
  }
}

function pick(val, ...keys) {
  if (!val) return undefined;
  for (const key of keys) {
    if (val[key] !== undefined) {
      return val[key];
    }
  }
  return undefined;
}

function parseLocationHost(location) {
  try {
    if (!location) return undefined;
    const url = new URL(location);
    return { host: url.hostname, port: Number(url.port) || 1400 };
  } catch (err) {
    return undefined;
  }
}

function normalizeMember(raw) {
  const fromLocation = parseLocationHost(raw?.Location || raw?.location);
  const host = raw?.host || pick(raw, 'Host', 'ip') || fromLocation?.host;
  const port = Number(raw?.port || pick(raw, 'Port')) || fromLocation?.port || 1400;
  return {
    id: pick(raw, 'UUID', 'uuid', 'Id', 'id', 'UDN', 'DeviceID') || null,
    name: pick(raw, 'RoomName', 'roomName', 'ZoneName', 'Name', 'name') || 'Sonos-enhed',
    host,
    port
  };
}

function normalizeGroup(raw) {
  const coordinatorInfo = raw?.Coordinator || raw?.coordinator || raw?.GroupCoordinator || {};
  const coordinatorLocation = parseLocationHost(coordinatorInfo?.location || coordinatorInfo?.Location);
  const coordinatorHost = coordinatorInfo?.host || pick(coordinatorInfo, 'ip', 'Host') || coordinatorLocation?.host;
  const coordinatorPort = Number(coordinatorInfo?.port || coordinatorLocation?.port || 1400);
  const membersRaw = raw?.Members || raw?.members || raw?.ZoneGroupMembers || [];
  return {
    id: pick(raw, 'ID', 'Id', 'id') || (coordinatorInfo?.uuid) || null,
    name: pick(raw, 'Name', 'name', 'ZoneName') || 'Sonos gruppe',
    coordinatorHost,
    coordinatorPort,
    members: membersRaw.map(normalizeMember)
  };
}

async function discoverTopology(force = false) {
  if (!force && topologyCache.size && Date.now() - lastDiscovery < DISCOVERY_INTERVAL_MS) {
    return topologyCache;
  }
  const device = await discovery.discover();
  const groupsRaw = await device.getAllGroups();
  const map = new Map();
  for (const groupRaw of groupsRaw || []) {
    const group = normalizeGroup(groupRaw);
    if (!group.id || !group.coordinatorHost) continue;
    map.set(group.id, {
      info: group,
      controller: new Sonos(group.coordinatorHost, group.coordinatorPort)
    });
  }
  topologyCache = map;
  lastDiscovery = Date.now();
  return topologyCache;
}

async function getGroupEntry(groupId) {
  const topo = await discoverTopology(false);
  if (groupId && topo.has(groupId)) {
    return topo.get(groupId);
  }
  if (!groupId && topo.size) {
    return topo.values().next().value;
  }
  const refreshed = await discoverTopology(true);
  if (groupId) {
    return refreshed.get(groupId);
  }
  return refreshed.values().next()?.value || null;
}

async function fetchFavorites(controller) {
  if (favoritesCache.length && Date.now() - favoritesUpdated < DISCOVERY_INTERVAL_MS) {
    return favoritesCache;
  }
  try {
    const favResponse = await controller.getFavorites();
    const items = favResponse?.items || favResponse || [];
    favoritesCache = items.map((item) => {
      const id = item.id || item.title || item.titleBrief || item.Uri || item.uri;
      let image = item.albumArtUri || item.albumArtURI || item.imageUrl;
      if (image && image.startsWith('/')) {
        image = `http://${controller.host}:${controller.port || 1400}${image}`;
      }
      return {
        id,
        title: item.title || item.titleBrief || 'Favorit',
        description: item.artist || item.album || item.streamContent || '',
        imageUrl: image || ''
      };
    });
    favoritesUpdated = Date.now();
  } catch (err) {
    favoritesCache = [];
    favoritesUpdated = Date.now();
    console.warn('[sonos] kunne ikke hente favoritter', err.message);
  }
  return favoritesCache;
}

async function buildGroupState(groupId) {
  const entry = await getGroupEntry(groupId);
  if (!entry) {
    return null;
  }
  const { controller, info } = entry;
  controller.setTimeout?.(POLL_TIMEOUT_MS);
  const [playState, volume, muted, track] = await Promise.all([
    controller.getCurrentState().catch(() => 'STOPPED'),
    controller.getVolume().catch(() => null),
    controller.getMuted().catch(() => null),
    controller.currentTrack().catch(() => ({}))
  ]);
  const members = [];
  for (const member of info.members) {
    if (!member.host) {
      members.push({ id: member.id, name: member.name, volume: null, muted: null });
      continue;
    }
    const memberDevice = new Sonos(member.host, member.port || 1400);
    memberDevice.setTimeout?.(POLL_TIMEOUT_MS);
    const [mVol, mMuted] = await Promise.all([
      memberDevice.getVolume().catch(() => null),
      memberDevice.getMuted().catch(() => null)
    ]);
    members.push({ id: member.id, name: member.name, volume: mVol, muted: mMuted });
  }
  return {
    id: info.id,
    name: info.name,
    isPlaying: /play/i.test(playState || ''),
    transportState: playState || 'UNKNOWN',
    volume: volume != null ? Number(volume) : null,
    muted: muted != null ? Boolean(muted) : null,
    track: {
      title: track?.title || track?.Track || '',
      artist: track?.artist || track?.Artist || track?.streamContent || '',
      album: track?.album || track?.Album || '',
      artUri: track?.albumArtURL || track?.albumArtUri || ''
    },
    members
  };
}

function ensureCalendarConfigured(res) {
  if (!calendarFeed) {
    res.status(404).json({ error: 'Kalender-feed er ikke konfigureret' });
    return false;
  }
  return true;
}

function parseDateQuery(value, fieldName) {
  if (value == null) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} skal være en gyldig dato`);
  }
  return date;
}

app.get('/api/calendar/status', (req, res) => {
  if (!ensureCalendarConfigured(res)) {
    return;
  }
  res.json({ info: calendarFeed.info });
});

app.get('/api/calendar/events', async (req, res) => {
  if (!ensureCalendarConfigured(res)) {
    return;
  }
  try {
    const start = parseDateQuery(req.query.start, 'start');
    const end = parseDateQuery(req.query.end, 'end');
    const includeCancelled = String(req.query.includeCancelled).toLowerCase() === 'true';
    await calendarFeed.refresh(false);
    const events = calendarFeed.getEvents({ start, end, includeCancelled });
    res.json({
      feedUrl: calendarFeed.feedUrl,
      updatedAt: calendarFeed.lastUpdatedAt,
      fetchedAt: calendarFeed.lastFetchedAt,
      events
    });
  } catch (err) {
    console.error('[calendar] events-fejl', err);
    res.status(400).json({ error: err.message || 'Kunne ikke hente kalender-hændelser' });
  }
});

app.post('/api/calendar/config', async (req, res) => {
  try {
    const { feedUrl, refreshHours, refreshIntervalHours, lookAheadDays, lookBehindDays } = req.body || {};
    const refreshValue = refreshHours ?? refreshIntervalHours;
    const refreshInterval = parsePositiveNumber(refreshValue, 'refreshIntervalHours');
    const ahead = parseNonNegativeNumber(lookAheadDays, 'lookAheadDays');
    const behind = parseNonNegativeNumber(lookBehindDays, 'lookBehindDays');

    if (feedUrl) {
      await setupCalendarFeed(feedUrl, {
        refreshIntervalHours: refreshInterval ?? DEFAULT_CALENDAR_REFRESH_HOURS,
        lookAheadDays: ahead ?? DEFAULT_CALENDAR_LOOKAHEAD_DAYS,
        lookBehindDays: behind ?? DEFAULT_CALENDAR_LOOKBEHIND_DAYS
      });
    } else {
      if (!ensureCalendarConfigured(res)) {
        return;
      }
      if (refreshInterval != null) {
        calendarFeed.setRefreshIntervalHours(refreshInterval);
      }
      calendarFeed.setRangeDays({
        lookAheadDays: ahead,
        lookBehindDays: behind
      });
    }

    res.json({ ok: true, info: calendarFeed ? calendarFeed.info : null });
  } catch (err) {
    console.error('[calendar] konfigurations-fejl', err);
    res.status(400).json({ error: err.message || 'Ugyldig kalender-konfiguration' });
  }
});

app.post('/api/calendar/refresh', async (req, res) => {
  if (!ensureCalendarConfigured(res)) {
    return;
  }
  try {
    await calendarFeed.refresh(true);
    res.json({ ok: true, info: calendarFeed.info });
  } catch (err) {
    console.error('[calendar] refresh-fejl', err);
    res.status(500).json({ error: err.message || 'Kalender-opdatering mislykkedes' });
  }
});

app.get('/api/state', async (req, res) => {
  try {
    const topology = await discoverTopology(false);
    if (!topology.size) {
      res.json({ groups: [], favorites: [] });
      return;
    }
    const groupStates = [];
    for (const [groupId] of topology.entries()) {
      const state = await buildGroupState(groupId);
      if (state) {
        groupStates.push(state);
      }
    }
    const coordinator = topology.values().next().value?.controller;
    const favorites = coordinator ? await fetchFavorites(coordinator) : [];
    res.json({
      timestamp: Date.now(),
      groups: groupStates,
      favorites
    });
  } catch (err) {
    console.error('[sonos] state error', err);
    res.status(500).json({ error: err.message || 'Unknown Sonos-fejl' });
  }
});

app.post('/api/groups/:groupId/command', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { action, volume, favoriteId } = req.body || {};
    const entry = await getGroupEntry(groupId);
    if (!entry) {
      res.status(404).json({ error: 'Gruppe ikke fundet' });
      return;
    }
    const controller = entry.controller;
    controller.setTimeout?.(POLL_TIMEOUT_MS);
    switch (action) {
      case 'play':
        await controller.play();
        break;
      case 'pause':
        await controller.pause();
        break;
      case 'next':
        await controller.next();
        break;
      case 'previous':
        await controller.previous();
        break;
      case 'setVolume':
        if (volume == null || Number.isNaN(Number(volume))) {
          res.status(400).json({ error: 'Manglende volume' });
          return;
        }
        await controller.setVolume(Number(volume));
        break;
      case 'mute':
        await controller.setMuted(true);
        break;
      case 'unmute':
        await controller.setMuted(false);
        break;
      case 'playFavorite': {
        if (!favoriteId) {
          res.status(400).json({ error: 'Manglende favoriteId' });
          return;
        }
        const favorites = await fetchFavorites(controller);
        const fav = favorites.find((item) => item.id === favoriteId || item.title === favoriteId);
        if (!fav) {
          res.status(404).json({ error: 'Favorit ikke fundet' });
          return;
        }
        await controller.playFavorite(fav.title);
        break;
      }
      default:
        res.status(400).json({ error: 'Ukendt handling' });
        return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[sonos] command error', err);
    res.status(500).json({ error: err.message || 'Sonos kommando-fejl' });
  }
});

app.get('/', (req, res) => {
  res.json({
    service: 'WAP Sonos Local Controller',
    status: 'ok',
    groups: Array.from(topologyCache.keys()),
    lastDiscovery,
    calendar: calendarFeed ? calendarFeed.info : null
  });
});

app.listen(PORT, () => {
  console.log(`Sonos lokal controller kører på port ${PORT}`);
});
