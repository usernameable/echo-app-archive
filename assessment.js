export const ASSESSMENT_THRESHOLDS = {
  durationRatioMin: 0.6, durationRatioMax: 2.5, voicedRatioMin: 0.40,
  maxVoicedRunSecMin: 1.0, peakLevelMin: 0.05,
  wordHitRateMin: 0.70, asrConfidenceFloor: 0.60,
  retryBeforeDegrade: 2, retryBeforeForcePass: 3,
  vadArmAfterVoicedSec: 0.3, autoStopSilenceSec: 1.2, recordingMaxSec: 10,
  asrStartTimeoutSec: 5, asrResultTimeoutSec: 5
};

export function summarizeFrames(frames, targetDurationSec) {
  const t = ASSESSMENT_THRESHOLDS;
  const durationSec = frames.length ? frames.at(-1).samples / frames.at(-1).sampleRate : 0;
  const voiced = frames.map(frame => frame.rms > .02);
  let run = 0, maxRun = 0, pauses = 0, sbs = 0, silence = 0;
  for (let i = 0; i < voiced.length; i++) {
    if (voiced[i]) { run++; if (silence && silence < 15 && run > 1) run += silence; silence = 0; }
    else { silence++; if (silence >= 15) { maxRun = Math.max(maxRun, run); run = 0; } }
  }
  maxRun = Math.max(maxRun, run);
  for (let i = 0; i < voiced.length;) {
    if (voiced[i]) { i++; continue; }
    const start = i;
    while (i < voiced.length && !voiced[i]) i++;
    if (start > 0 && i < voiced.length && (i - start) > 30) { pauses++; sbs += (i-start) * .01; }
  }
  return {
    durationSec, targetDurationSec, durationRatio: targetDurationSec ? durationSec / targetDurationSec : 0,
    voicedRatio: voiced.length ? voiced.filter(Boolean).length / voiced.length : 0,
    maxVoicedRunSec: maxRun * .01, pauseCount: pauses, sbsSec: sbs,
    peakLevel: frames.length ? frames.at(-1).peak : 0, silenceAtEndSec: silence * .01,
    transcript: null, asrConfidence: null, wordHits: [], wordHitRate: null, ccw: null
  };
}

export function assess({ recordingId, signals, wordCount, priorFailures, channel = 'none' }) {
  const t = ASSESSMENT_THRESHOLDS;
  const result = { recordingId, signals, verdict: 'retry', reasons: [], channel, scored: channel !== 'none' };
  if (priorFailures + 1 >= t.retryBeforeForcePass) { result.verdict = 'force_pass'; result.scored = false; return result; }
  if (signals.durationSec < .3 || signals.peakLevel < t.peakLevelMin) { result.verdict = 'no_sound'; result.reasons.push('no_sound'); }
  else if (signals.asrConfidence != null && signals.asrConfidence < t.asrConfidenceFloor) result.reasons.push('low_confidence');
  else {
    const short = wordCount <= 3;
    const okay = signals.voicedRatio >= t.voicedRatioMin &&
      (short || (signals.durationRatio >= t.durationRatioMin && signals.durationRatio <= t.durationRatioMax &&
        (channel !== 'none' || signals.maxVoicedRunSec >= t.maxVoicedRunSecMin))) &&
      (channel === 'none' || signals.wordHitRate >= t.wordHitRateMin);
    result.verdict = okay ? 'pass' : 'retry';
    if (!okay) result.reasons.push('signal');
  }
  if (result.verdict !== 'pass' && priorFailures + 1 === t.retryBeforeDegrade) { result.verdict = 'degrade'; result.scored = false; }
  return result;
}

export function debugResult(result) {
  if (new URLSearchParams(location.search).get('debug') !== '1') return;
  const s = result.signals;
  console.table([{ recordingId: result.recordingId, durationRatio: s.durationRatio, voicedRatio: s.voicedRatio,
    maxVoicedRunSec: s.maxVoicedRunSec, peakLevel: s.peakLevel, verdict: result.verdict, channel: result.channel }]);
}
