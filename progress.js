import { dateKey, consecutiveDays } from './storage.js';

export function breathWords(record, unit) {
  const line = unit?.script.find(item => item.id === record.sentenceId);
  const words = line?.text.match(/[A-Za-z']+/g)?.length ?? 0;
  if (!words) return 0;
  if (record.channel === 'webspeech' && Number.isFinite(record.signals?.ccw)) return Math.min(words, record.signals.ccw);
  const sec = record.signals?.maxVoicedRunSec ?? 0, target = record.signals?.targetDurationSec ?? 0;
  return sec > 0 && target > 0 ? Math.min(words, Math.round(sec / (target / words))) : 0;
}

export function progressFacts(state, units, at) {
  const today = dateKey(at), records = state.recordings.filter(item => item.createdAt && item.signals?.peakLevel >= .05);
  const byDay = day => records.filter(item => dateKey(item.createdAt) === day);
  const todayRecords = byDay(today);
  const measure = rows => ({
    sentences: new Set(rows.map(item => `${item.unitId}:${item.sentenceId}`)).size,
    words: Math.max(0, ...rows.map(item => breathWords(item, units.find(unit => unit.id === item.unitId)))),
    seconds: Math.round(rows.reduce((sum,item) => sum + (item.signals?.durationSec ?? 0), 0)),
    noLongPause: new Set(rows.filter(item => item.verdict === 'pass' && item.signals?.pauseCount === 0)
      .map(item => `${item.unitId}:${item.sentenceId}`)).size
  });
  const finished = [...state.sessions].reverse().filter(session => records.some(item => item.sessionId === session.sessionId));
  const current = finished[0] && measure(records.filter(item => item.sessionId === finished[0].sessionId));
  const previous = finished[1] && measure(records.filter(item => item.sessionId === finished[1].sessionId));
  const weekStart = new Date(at); weekStart.setHours(12,0,0,0); weekStart.setDate(weekStart.getDate() - (weekStart.getDay()+6)%7);
  const week = Array.from({length:7},(_,index) => { const day = new Date(weekStart); day.setDate(day.getDate()+index); return { date:dateKey(day), done:state.completedDays.includes(dateKey(day)), today:dateKey(day) === today }; });
  const weekRecords = records.filter(item => dateKey(item.createdAt) >= week[0].date && dateKey(item.createdAt) <= week[6].date);
  const weekAverageWords = weekRecords.length ? Math.round(weekRecords.reduce((sum,item) => sum + breathWords(item, units.find(unit => unit.id === item.unitId)), 0) / weekRecords.length) : null;
  const yesterday = new Date(at); yesterday.setDate(yesterday.getDate()-1);
  return { today:measure(todayRecords), yesterday:measure(byDay(dateKey(yesterday))),
    current, previous, week, weekDays:week.filter(day => day.done).length, weekAverageWords,
    streak:consecutiveDays(state.completedDays, at), yesterdayStreak:consecutiveDays(state.completedDays, yesterday),
    completedSessions:state.sessions.length };
}
