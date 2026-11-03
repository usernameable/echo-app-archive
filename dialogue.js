import { ASSESSMENT_THRESHOLDS } from './assessment.js';

export function completionResult(result) {
  if (result.signals.durationSec < .3 || result.signals.peakLevel < ASSESSMENT_THRESHOLDS.peakLevelMin) return result;
  return { ...result, verdict:'pass', scored:false, reasons:[] };
}

export function lineById(unit, id) { return unit.script.find(line => line.id === id); }

export function childChatIndex(unit, index) {
  return lineById(unit, unit.chat[index])?.speaker === 'A' ? index + 1 : index;
}

export function listenGroup(unit, index) {
  const start = index > 0 && unit.script[index]?.speaker === 'B' && unit.script[index-1]?.speaker === 'A' ? index-1 : index;
  return unit.script[start]?.speaker === 'A' && unit.script[start+1]?.speaker === 'B' ? [start,start+1] : [start];
}

export function previousMachine(unit, childId) {
  const index = unit.chat.indexOf(childId);
  if (index < 1) return null;
  const line = lineById(unit, unit.chat[index - 1]);
  return line?.speaker === 'A' ? line : null;
}

export function rankClips(records) {
  const t = ASSESSMENT_THRESHOLDS;
  const usable = item => item.signals?.durationSec >= .3 && item.signals.peakLevel >= t.peakLevelMin &&
    (item.signals.durationRatio == null || (item.signals.durationRatio >= t.durationRatioMin && item.signals.durationRatio <= t.durationRatioMax)) &&
    (item.signals.voicedRatio == null || item.signals.voicedRatio >= t.voicedRatioMin);
  const recognized = item => item.channel === 'webspeech' && item.signals.asrConfidence >= t.asrConfidenceFloor &&
    item.signals.wordHitRate >= t.wordHitRateMin;
  const continuity = item => Math.min(1, (item.signals.maxVoicedRunSec ?? 0) /
    (item.signals.targetDurationSec || item.signals.durationSec));
  return records.filter(usable).sort((a, b) => Number(recognized(b)) - Number(recognized(a)) ||
    (recognized(a) ? b.signals.wordHitRate - a.signals.wordHitRate : 0) ||
    continuity(b) - continuity(a) ||
    Math.abs((a.signals.durationRatio ?? 1) - 1) - Math.abs((b.signals.durationRatio ?? 1) - 1) ||
    (b.createdAt ?? 0) - (a.createdAt ?? 0) || String(a.recordingId).localeCompare(String(b.recordingId)));
}

export function clipSelectionBasis(item) {
  const t = ASSESSMENT_THRESHOLDS;
  return item.channel === 'webspeech' && item.signals.asrConfidence >= t.asrConfidenceFloor && item.signals.wordHitRate >= t.wordHitRateMin
    ? '依据：机器听到的词更完整。' : '依据：这句连续出声更完整。';
}

export function sectionCandidates(unit, records, sessionId, sectionIndex = 0) {
  return rankClips(records.filter(item => item.unitId === unit.id && item.sessionId === sessionId &&
    item.sectionIndex === sectionIndex && unit.learn.includes(item.sentenceId) && previousMachine(unit, item.sentenceId)));
}

export function bestSectionClip(unit, records, sessionId, sectionIndex = 0) {
  return sectionCandidates(unit, records, sessionId, sectionIndex)[0] ?? null;
}
