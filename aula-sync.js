'use strict';

require('dotenv').config?.();

const { createClient } = require('@supabase/supabase-js');
const { CalendarFeed } = require('./calendar-feed');

const DEFAULT_TIME_ZONE = process.env.AULA_TIME_ZONE || 'Europe/Copenhagen';
const DEFAULT_LOOKAHEAD_DAYS = Number(process.env.AULA_LOOKAHEAD_DAYS || 90);
const DEFAULT_LOOKBEHIND_DAYS = Number(process.env.AULA_LOOKBEHIND_DAYS || 7);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function formatDate(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

function formatTime(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('da-DK', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
  return formatter.format(date);
}

function aulaUid(externalId, dateISO) {
  return `a:${externalId}|${dateISO}`;
}

async function loadDetachedExternalIds(client, hid) {
  const { data, error } = await client
    .from('calendar_items')
    .select('uid,data')
    .eq('hid', hid);

  if (error) {
    throw error;
  }

  const result = new Set();
  for (const row of data || []) {
    const payload = (row && row.data) || {};
    if (String(payload.source || '').toLowerCase() !== 'aula') {
      continue;
    }
    if (payload.detachedFromFeed && payload.externalId) {
      result.add(String(payload.externalId));
    }
  }
  return result;
}

async function fetchExistingAulaUids(client, hid) {
  const { data, error } = await client
    .from('calendar_items')
    .select('uid,data')
    .eq('hid', hid);

  if (error) {
    throw error;
  }

  const uids = new Set();
  for (const row of data || []) {
    const payload = (row && row.data) || {};
    if (String(payload.source || '').toLowerCase() === 'aula') {
      uids.add(String(row.uid));
    }
  }
  return uids;
}

async function syncAula() {
  const feedUrl = requiredEnv('AULA_FEED_URL');
  const supabaseUrl = requiredEnv('SUPABASE_URL');
  const supabaseKey = requiredEnv('SUPABASE_SERVICE_KEY');
  const householdId = requiredEnv('HOUSEHOLD_ID').toUpperCase();

  const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const feed = new CalendarFeed({
    feedUrl,
    lookAheadDays: DEFAULT_LOOKAHEAD_DAYS,
    lookBehindDays: DEFAULT_LOOKBEHIND_DAYS,
    timeZone: DEFAULT_TIME_ZONE
  });

  await feed.refresh(true);
  const events = feed.getEvents();

  const detachedExternalIds = await loadDetachedExternalIds(client, householdId);
  const rows = [];
  const seenUids = new Set();

  for (const evt of events) {
    if (evt.cancelled) continue;
    if (!evt.start) continue;

    const startDate = new Date(evt.start);
    const endDate = evt.end ? new Date(evt.end) : null;
    const date = formatDate(startDate, evt.timeZone || DEFAULT_TIME_ZONE);
    const time = evt.allDay ? '' : formatTime(startDate, evt.timeZone || DEFAULT_TIME_ZONE);
    const durationMin = endDate ? Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000)) : 0;
    const externalId = `${evt.uid}${evt.recurrenceId ? `|${evt.recurrenceId}` : ''}`;

    if (detachedExternalIds.has(externalId)) {
      continue;
    }

    const uid = aulaUid(externalId, date);
    if (seenUids.has(uid)) {
      continue;
    }
    seenUids.add(uid);

    const data = {
      id: `aula:${externalId}`,
      title: evt.summary || '(uden titel)',
      type: 'Aktivitet',
      people: ['Alle'],
      person: 'Alle',
      date,
      time,
      durationMin,
      location: evt.location || '',
      note: evt.description || '',
      repeatWeekly: false,
      done: false,
      source: 'aula',
      externalId,
      seriesId: `aula:${evt.uid}`,
      detachedFromFeed: false
    };

    rows.push({
      hid: householdId,
      uid,
      data,
      title: data.title,
      date: data.date,
      time: data.time,
      person: data.person,
      type: data.type,
      note: data.note,
      done: data.done,
      repeat_weekly: data.repeatWeekly
    });
  }

  const existingUids = await fetchExistingAulaUids(client, householdId);
  const newUidSet = new Set(rows.map((row) => row.uid));
  const toDelete = Array.from(existingUids).filter((uid) => !newUidSet.has(uid));

  if (rows.length) {
    const { error } = await client.from('calendar_items').upsert(rows, { onConflict: 'hid,uid' });
    if (error) throw error;
  }

  if (toDelete.length) {
    const { error } = await client
      .from('calendar_items')
      .delete()
      .eq('hid', householdId)
      .in('uid', toDelete);
    if (error) throw error;
  }

  console.log(`Aula sync done. Upserted: ${rows.length}. Deleted: ${toDelete.length}.`);
}

syncAula().catch((err) => {
  console.error('[aula-sync] failed', err);
  process.exitCode = 1;
});
