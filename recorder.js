import { ASSESSMENT_THRESHOLDS, summarizeFrames } from './assessment.js';

export async function recordSentence(targetDurationSec, onLevel, stopSignal, onReady) {
  const params = new URLSearchParams(location.search);
  const debug = params.get('debug') === '1';
  const raw = debug && params.get('raw') === '1';
  const request = navigator.mediaDevices.getUserMedia({ audio: raw ? { echoCancellation:false, noiseSuppression:false, autoGainControl:false } : true });
  let timedOut = false, timer;
  request.then(late => { if (timedOut) late.getTracks().forEach(track => track.stop()); }).catch(() => {});
  const stream = await Promise.race([
    request,
    new Promise((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new DOMException('等待麦克风回应超时', 'TimeoutError')); }, 12000); })
  ]).finally(() => clearTimeout(timer));
  if (debug) {
    const track = stream.getAudioTracks()[0], settings = track.getSettings();
    const trackInfo = { muted:track.muted, readyState:track.readyState, sampleRate:settings.sampleRate, channelCount:settings.channelCount, echoCancellation:settings.echoCancellation, noiseSuppression:settings.noiseSuppression, autoGainControl:settings.autoGainControl };
    console.info('输入轨道', trackInfo);
    onLevel?.(0, 'track', trackInfo);
    track.addEventListener('mute', () => console.info('输入轨道静音'));
    track.addEventListener('unmute', () => console.info('输入轨道恢复'));
  }
  let audio, node, source, recorder;
  const frames = [];
  let done = false, spoken = 0, quietInputFrames = 0, inputHint = false, noFrameTimer, manualStop, lastFrameAt = performance.now();
  try {
    audio = new AudioContext();
    await audio.resume();
    await audio.audioWorklet.addModule('./audio-worklet.js');
    source = audio.createMediaStreamSource(stream);
    node = new AudioWorkletNode(audio, 'signal-frames');
    source.connect(node);
    const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    let readySent = false;
    function announceReady() {
      if (readySent || done || recorder.state !== 'recording') return;
      readySent = true;
      onReady?.();
    }
    const stopped = new Promise((resolve, reject) => {
      recorder.onstart = announceReady;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error('录音失败'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
    });
    node.port.onmessage = ({ data }) => {
      announceReady();
      lastFrameAt = performance.now();
      frames.push(data);
      if (debug) console.debug('PCM 帧', frames.length, 'rms', data.rms, 'peak', data.peak, 'samples', data.samples);
      onLevel?.(data.rms, undefined, data);
      spoken = data.rms > .02 ? spoken + .01 : spoken;
      quietInputFrames = data.rms < .005 ? quietInputFrames + 1 : 0;
      if (!inputHint && quietInputFrames >= 200) { inputHint = true; onLevel?.(0, 'low_input'); }
      if (inputHint && data.rms > .02) { inputHint = false; onLevel?.(data.rms, null); }
      if (!done && spoken === 0 && data.samples / data.sampleRate >= 4) finish();
      if (!done && data.samples / data.sampleRate >= ASSESSMENT_THRESHOLDS.recordingMaxSec) finish();
      if (!done && spoken >= ASSESSMENT_THRESHOLDS.vadArmAfterVoicedSec) {
        let tail = 0;
        for (let i = frames.length - 1; i >= 0 && frames[i].rms <= .02; i--) tail++;
        if (tail * .01 >= ASSESSMENT_THRESHOLDS.autoStopSilenceSec) finish();
      }
    };
    function finish() { if (done) return; done = true; if (recorder.state !== 'inactive') recorder.stop(); }
    recorder.start();
    announceReady();
    manualStop = finish;
    if (stopSignal?.aborted) finish();
    else stopSignal?.addEventListener('abort', finish, { once:true });
    lastFrameAt = performance.now();
    noFrameTimer = setInterval(() => { if (!done && performance.now() - lastFrameAt >= 2000) { onLevel?.(0, 'no_frames'); finish(); } }, 250);
    const blob = await stopped;
    if (debug) console.info('PCM 总帧数', frames.length, '峰值', frames.at(-1)?.peak ?? 0);
    return { blob, signals: summarizeFrames(frames, targetDurationSec) };
  } finally {
    if (manualStop) stopSignal?.removeEventListener('abort', manualStop);
    clearInterval(noFrameTimer);
    stream.getTracks().forEach(track => track.stop());
    source?.disconnect(); node?.disconnect();
    await audio?.close();
  }
}
