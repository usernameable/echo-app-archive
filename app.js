import { units, firstUnit } from './content.js?v=2.6.1';
import { initVoices, speak, stopSpeech, targetDuration } from './tts.js?v=2.6.3';
import { recordSentence } from './recorder.js?v=4.2.2';
import { assess, debugResult } from './assessment.js';
import { startLocalRecognition, alignWords } from './recognition.js';
import { loadProgress, saveProgress, failures, setFailures, saveClip, loadClip, deleteClip, recordingEpoch, deleteAllClips, clearDemoProgress, dateKey, markCompletedDay, consecutiveDays } from './storage.js';
import { lineById, childChatIndex, bestSectionClip, previousMachine, completionResult, rankClips, sectionCandidates } from './dialogue.js';
import { recapScreen, chatScreen, resultNotice, feedbackText } from './flow-screens.js';
import { progressFacts, breathWords } from './progress.js';
import { icon } from './icons.js';
import { buddyIdle } from './buddy.js';
import { createParent } from './parent.js';
import { createSelfcheck } from './selfcheck.js';

const main = document.querySelector('#main');
const label = document.querySelector('#stage-label');
const params = new URLSearchParams(location.search);
const debug = params.get('debug') === '1';
const preview = params.get('page');
if (params.get('demo') === '1') document.querySelector('#demo-badge').hidden = false;
if (params.get('demo') === '1') document.querySelector('#demo-reset').hidden = false;
const demoDay = params.get('demo') === '1' && /^\d{4}-\d{2}-\d{2}$/.test(params.get('day') ?? '') ? params.get('day') : null;
const demoTime = demoDay ? new Date(`${demoDay}T12:00:00`).getTime() : NaN;
const sessionNow = () => demoDay && dateKey(demoTime) === demoDay ? demoTime : Date.now();
const SESSION_MAX_MS = 15 * 60 * 1000;
const newProgress = () => ({ stage: 'home', sessionId: crypto.randomUUID(), startedAt: null, sentenceIndex: 0,
  chatIndex: 0, chatHelp: 0, chatHidden: false, chatDone: false, counts: {}, recordings: [], shared: false, heard: false });
let state = loadProgress() ?? newProgress();
if (!['home','listen','speak','recap','chat','wrap','share'].includes(state.stage)) state.stage = 'recap';
if (state.contentRevision !== 2) { state.listenIndex = 0; state.chatIndex = 0; state.chatDone = false; state.contentRevision = 2; }
state.savedLines ??= [];
state.recordings ??= [];
state.sessions ??= [];
state.completedDays ??= [];
state.resting ??= false;
state.restDeferred = false;
state.unitId ??= firstUnit.id;
state.listenIndex ??= 0;
state.listenAudioUnavailable ??= false;
state.chatHidden ??= false;
state.seen = state.seen?.map(key => key.startsWith('U-') ? key : `${firstUnit.id}:${key}`);
for (const item of state.recordings) { item.unitId ??= firstUnit.id; item.sessionId ??= state.sessionId; }
let unit = units.find(item => item.id === state.unitId) ?? firstUnit;
let showHome = !preview && state.stage !== 'home';
let homeRecommendation = firstUnit, verifiedSaved = new Set();
let overlayPage = ['progress','lines'].includes(preview) ? preview : null, overlayReturn = null;
const resumed = state.recordings.findLast(item => item.unitId === unit.id && item.sessionId === state.sessionId &&
  item.sentenceId === unit.learn[state.sentenceIndex] && item.stage === 'speak');
let busy = false, latestResult = resumed ? { recordingId:resumed.recordingId, signals:resumed.signals,
  verdict:resumed.verdict, channel:resumed.channel } : null, audioPlayback = null, clipUrl = null, scriptPlaying = false, scriptPaused = false, scriptRunId = 0;
let pairPlaying = false, pairTimer = null, pairWait = null;
let chatController = null;
let recordController = null;
let machinePlayId = 0;
let debugSnapshot = {};
const queuedAudio = [];
const save = () => saveProgress(state);
const selfcheck = createSelfcheck(main);
const parent = createParent({ main, units, getState: () => state, now: sessionNow,
  onOpen: () => { stopSpeech(); stopClip(); overlayPage = 'parent'; render(); },
  playClip, playDemo: speak, stopAudio: () => { stopSpeech(); stopClip(); },
  openDelete: () => { settings.showModal(); document.querySelector('#delete-recordings').click(); } });
let toastTimer;
function showToast(message, tone = 'neutral') {
  const node = document.querySelector('#toast');
  clearTimeout(toastTimer);
  node.className = `toast ${tone}`; node.textContent = message; node.hidden = false;
  toastTimer = setTimeout(() => { node.hidden = true; }, 2800);
}
const addCount = word => { state.counts[word] = Math.min(6, (state.counts[word] ?? 0) + 1); save(); };
function markSeen(key, word) {
  state.seen ??= [];
  const id = `${unit.id}:${key}`;
  if (state.seen.includes(id)) return;
  state.seen.push(id); addCount(word);
}
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const buttons = words => words.map(word => `<button class="word word-chip" data-word="${esc(word)}" lang="en" aria-label="听单词 ${esc(word)}">${esc(word)}</button>`).join('');
const stageNames = { home:'今天的单元', listen:'听对话', speak:'逐句跟读', recap:'小节回顾', chat:'对话接龙', resting:'休息时间', wrap:'今日一句', share:'已分享', progress:'我的进步', lines:'我的句子本', parent:'家长查看', selfcheck:'演示前自检' };
function debugPanel() {
  const mode = params.get('asr') === 'on' ? '本地识别对照' : params.get('raw') === '1' ? '关闭降噪对照' : '普通录音';
  return `<aside class="debug-panel"><h2>录音诊断 · ${mode}</h2><p>点上方“开始录音”。读一句，或保持安静；结果出现后点“复制诊断结果”，把复制的文字发给我。</p><nav class="debug-modes" aria-label="录音对照模式"><a href="?page=speak&debug=1">普通录音</a><a href="?page=speak&debug=1&asr=on">本地识别对照</a><a href="?page=speak&debug=1&raw=1">关闭降噪对照</a></nav><pre id="debug-output"></pre><button id="copy-debug" class="secondary" disabled>复制诊断结果</button><span id="debug-copy-status" class="small-note"></span></aside>`;
}
function debugText() {
  const d = debugSnapshot, s = d.signals, t = d.track;
  const frame = f => f ? `rms=${f.rms.toFixed(5)} peak=${f.peak.toFixed(5)} samples=${f.samples}` : '—';
  return [`模式：${params.get('asr') === 'on' ? '本地识别对照' : params.get('raw') === '1' ? '关闭降噪对照' : '普通录音'}`,
    `识别：${d.recognition ?? '待录音'}`,
    `轨道：${t ? `muted=${t.muted} sampleRate=${t.sampleRate} channelCount=${t.channelCount} echoCancellation=${t.echoCancellation} noiseSuppression=${t.noiseSuppression} autoGainControl=${t.autoGainControl}` : '待取流'}`,
    `总帧数：${d.frames ?? 0}；最后样本数：${d.samples ?? 0}；最大帧 rms：${(d.maxRms ?? 0).toFixed(5)}；峰值：${(d.peak ?? 0).toFixed(5)}`,
    `首帧：${frame(d.first)}`, `末帧：${frame(d.last)}`,
    `输入提示：${d.issue ?? '无'}`,
    `durationRatio=${s?.durationRatio ?? '—'} voicedRatio=${s?.voicedRatio ?? '—'} maxVoicedRunSec=${s?.maxVoicedRunSec ?? '—'} peakLevel=${s?.peakLevel ?? '—'}`,
    `verdict=${d.verdict ?? '待判定'} channel=${d.channel ?? '—'}`].join('\n');
}
function updateDebug() { const node = main.querySelector('#debug-output'); if (node) node.textContent = debugText(); const copy = main.querySelector('#copy-debug'); if (copy) copy.disabled = !debugSnapshot.verdict; }
function checkpoint(stage) {
  const fromStage = state.stage;
  if (state.stage === 'listen' && stage !== 'listen') { scriptRunId++; scriptPlaying = false; queuedAudio.length = 0; stopSpeech(); }
  if (state.stage === 'recap' && stage !== 'recap') stopPair();
  if (state.stage === 'chat' && stage !== 'chat') { machinePlayId++; chatController?.abort(); stopSpeech(); }
  state.stage = stage;
  if (stage === 'chat') state.chatIndex = childChatIndex(unit, state.chatIndex);
  if (stage === 'recap') {
    if (!(fromStage === 'chat' && state.sectionSelected && sectionCandidates(unit, state.recordings, state.sessionId).some(item => item.recordingId === state.sectionHighlight))) {
      const best = bestSectionClip(unit, state.recordings, state.sessionId);
      state.sectionHighlight = best?.recordingId ?? null;
      state.sectionSelected = false;
    }
  }
  if (stage === 'wrap' && !state.sessions.some(item => item.sessionId === state.sessionId)) {
    const clips = state.recordings.filter(item => item.sessionId === state.sessionId);
    const best = chooseShowcase();
    if (best && !state.savedLines.includes(best.recordingId)) { state.savedLines.push(best.recordingId); refreshSavedLines(); }
    state.sessions.push({ sessionId:state.sessionId, unitId:unit.id, date:dateKey(sessionNow()), stage:'wrap',
      spokenSec:clips.reduce((sum,item) => sum + (item.signals?.durationSec ?? 0), 0),
      sentenceIds:[...new Set(clips.map(item => item.sentenceId))], sectionIndex:0,
      shared:clips.some(item => item.sharedByChild) });
    state.completedDays = markCompletedDay(state.completedDays, sessionNow());
  }
  save();
  render();
  if (stage === 'chat') playMachineTurn();
}
function timeGuard() {
  if (state.resting) return;
  if (debug && preview) return;
  if (state.startedAt && !['wrap','share'].includes(state.stage) && Date.now() - state.startedAt >= SESSION_MAX_MS) {
    stopSpeech(); stopClip(); checkpoint('wrap');
  }
}
setInterval(timeGuard, 1000);
const activityKey = params.get('demo') === '1' ? 'echo-active-ms-demo' : 'echo-active-ms';
let activeMs = Number(localStorage.getItem(activityKey) ?? 0) || 0;
let lastInputAt = Date.now(), lastTickAt = Date.now();
addEventListener('pointerdown', () => { lastInputAt = Date.now(); });
addEventListener('keydown', () => { lastInputAt = Date.now(); });
function restGuard() {
  const now = Date.now(), delta = Math.min(1000, Math.max(0, now - lastTickAt));
  lastTickAt = now;
  if (!document.hidden && !state.resting && !document.querySelector('#rest').open && now - lastInputAt < 60000) {
    activeMs += delta; localStorage.setItem(activityKey, String(activeMs));
  }
  if (activeMs >= 30 * 60 * 1000 && !state.resting && !busy && !document.querySelector('#rest').open) {
    stopSpeech(); stopClip(); document.querySelector('#rest').showModal();
  }
}
setInterval(restGuard, 1000);
function enterRest() {
  state.resting = true;
  stopSpeech(); stopClip(); save(); render();
}
function continueLearning() {
  state.resting = false;
  activeMs = 0; localStorage.setItem(activityKey, '0');
  save(); render();
}
const recentActions = new Map();
document.addEventListener('click', event => {
  const control = event.target.closest('button');
  if (!control) return;
  const action = control.id === 'parent-confirm' ? `${control.id}:${control.textContent}` : control.id || control.dataset.word || control.dataset.replayLine;
  if (!action) return;
  const key = `${state.stage}:${action}`;
  const now = performance.now();
  if (now - (recentActions.get(key) ?? -Infinity) < 300) { event.stopImmediatePropagation(); event.preventDefault(); }
  else recentActions.set(key, now);
}, true);

function home() {
  const descriptions = { 'U-001':'向医生说清哪里不舒服。', 'U-002':'点餐并回应服务员。', 'U-003':'聊聊周末想做的事。', 'U-004':'问路并确认怎么走。' };
  const inProgress = state.startedAt && !['home','wrap','share'].includes(state.stage);
  const lastAt = item => Math.max(0, ...state.recordings.filter(record => record.unitId === item.id).map(record => record.createdAt ?? 0),
    ...state.sessions.filter(session => session.unitId === item.id).map(session => new Date(`${session.date}T12:00:00`).getTime() || 0));
  const recommended = inProgress ? unit : [...units].sort((a,b) => lastAt(a) - lastAt(b))[0];
  homeRecommendation = recommended;
  const art = { 'U-001':'clinic', 'U-002':'dining', 'U-003':'weekend', 'U-004':'asking-the-way' };
  const image = item => `./assets/illo/echo-illo-unit-${art[item.id]}.png`;
  const cards = units.map(item => `<button class="unit-card" data-unit="${item.id}" aria-label="选择${item.label}"><span class="unit-card-art unit-${item.id}"><img src="${image(item)}" alt=""></span><span class="unit-card-copy"><strong>${item.label}</strong><small>${descriptions[item.id]}</small><small lang="en">${esc(item.title)}</small></span><span class="unit-card-arrow" aria-hidden="true">›</span></button>`).join('');
  return `<section class="screen home-screen"><div class="home-feature"><div class="home-feature-copy"><span class="micro-label">今天练这个</span><h2>${recommended.label}</h2><p lang="en">${esc(recommended.title)}</p><p class="quiet">${descriptions[recommended.id]}</p><p class="home-meta">约 15 分钟 · 建议戴耳机</p><div class="actions"><button class="primary" id="start">${inProgress ? '继续上次' : '开始今天'}</button></div></div><div class="home-feature-art"><img src="${image(recommended)}" alt="${recommended.label}插画"></div></div><h1 class="home-options-title">或者另选一个情景开口说</h1><div class="unit-options" id="unit-options" aria-label="选择情境">${cards}</div><div class="home-links"><button id="open-progress" class="secondary">我的进步</button><button id="open-lines" class="secondary">我的句子本</button></div></section>`;
}

async function refreshSavedLines() {
  const candidates = state.recordings.filter(item => state.savedLines.includes(item.recordingId))
    .sort((a,b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  verifiedSaved = new Set();
  try { for (const item of candidates) if (await loadClip(item.recordingId)) {
    verifiedSaved.add(item.recordingId);
  } } catch { verifiedSaved.clear(); }
  if (showHome || state.stage === 'home' || overlayPage === 'lines') render();
}

function beginUnit(item) {
  unit = item;
  state = { ...state, unitId:unit.id, sessionId:crypto.randomUUID(), stage:'listen', startedAt:Date.now(),
    listenIndex:0, listenAudioUnavailable:false, sentenceIndex:0, chatIndex:0, chatHelp:0, chatHidden:false, chatDone:false, chatFeedback:null, sectionHighlight:null, sectionSelected:false, shared:false, heard:false };
  latestResult = null; showHome = false; save(); render();
}

function listen() {
  const lines = unit.script.map((sentence,index) => `<div class="dialogue-line ${sentence.speaker === 'B' ? 'is-user' : ''}" data-line="${index}">
    <div class="dialogue-line-head"><span class="line-avatar">${sentence.speaker === 'A' ? '<img src="./assets/mascot/echo-mascot-parrot-macaw-A.png" alt="">' : '你'}</span><span class="line-number">${sentence.speaker === 'A' ? '机器' : '你'} · 第 ${index+1} 句${sentence.speaker === 'B' ? ' · 轮到你开口' : ''}</span><button class="secondary line-play" data-replay-line="${index}" aria-label="重听第 ${index+1} 句">听</button></div>
    <div class="line-content"><div class="line-words">${(sentence.text.match(/[A-Za-z']+|[.,?!]/g) ?? []).map(token => /^[A-Za-z']+$/.test(token) ? buttons([token]) : `<span>${token}</span>`).join('')}</div><p class="line-translation">${esc(sentence.translation)}</p></div></div>`).join('');
  return `<section class="screen listen-screen"><div class="split listen-top"><div><p class="eyebrow">听 · ${unit.script.length} 句对话</p>
    <h1>先听，再练自己的句子</h1><p class="quiet">${unit.label} · 可以听对话，也可以直接跟读。</p><div class="listen-scene"><img src="./assets/illo/echo-illo-unit-${{'U-001':'clinic','U-002':'dining','U-003':'weekend','U-004':'asking-the-way'}[unit.id]}.png" alt="${unit.label}插画"></div>
    <div class="actions"><button id="play-script" class="primary">${state.listenAudioUnavailable ? '重试播放' : state.heard ? '再听一遍' : state.listenIndex ? '继续播放' : '播放对话'}</button>
      <button id="replay-script" class="secondary">从头重听</button></div>
    <p id="listen-progress" class="quiet">${state.listenAudioUnavailable ? '示范音暂时不可用' : state.heard ? '对话已听完' : `待播放 · 共 ${unit.script.length} 句`}</p>
    <p id="listen-status" class="quiet">${state.listenAudioUnavailable ? '英文示范音暂时没有播出。可以看文字后开始跟读。' : state.heard ? '可以进入跟读。' : '点播放对话，当前句会跟着切换。'}</p></div>
    <div class="listen-dialogue"><div class="listen-dialogue-head"><span class="micro-label">当前对话</span><span class="listen-script-count">共 ${unit.script.length} 句 · 上下滑动查看</span></div><div class="dialogue-list" role="region" aria-label="对话内容" tabindex="0">${lines}</div><div class="listen-follow"><button id="to-speak" class="btn btn-sky">开始跟读</button><p class="listen-follow-hint">开始跟读后可以录下自己的句子</p></div></div></div></section>`;
}
function speakScreen() {
  const sentence = lineById(unit, unit.learn[state.sentenceIndex] ?? unit.learn[0]);
  for (const word of unit.targets) if (sentence.text.toLowerCase().includes(word.text)) markSeen(`speak:${sentence.id}:${word.id}`, word.text);
  const count = failures(state.sessionId, sentence.id);
  const words = sentence.text.match(/[A-Za-z']+|[.,?!]/g) ?? [];
  const recognized = latestResult?.channel === 'webspeech' && Array.isArray(latestResult.signals?.wordHits);
  const hit = recognized ? latestResult.signals.wordHits : [];
  let n = 0;
  const wordMarkup = words.map(word => /^[A-Za-z']+$/.test(word)
    ? `<button class="word word-chip ${recognized ? hit[n++] ? 'hit' : 'miss' : ''}" data-word="${esc(word)}" lang="en" ${recognized && !hit[n-1] ? 'aria-label="这个词机器没听清，点一下听发音"' : ''}>${esc(word)}${recognized && !hit[n-1] ? '<span class="word-tip">这个词机器没听清</span>' : ''}</button>`
    : `<span>${word}</span>`).join('');
  const breath = latestResult ? breathWords({ sentenceId:sentence.id, channel:latestResult.channel, signals:latestResult.signals }, unit) : 0;
  const seconds = Math.round(latestResult?.signals?.durationSec ?? 0), done = state.sentenceIndex + (['pass','force_pass'].includes(latestResult?.verdict) ? 1 : 0);
  const wordTotal = sentence.text.match(/[A-Za-z']+/g).length, targetSec = latestResult?.signals?.targetDurationSec || wordTotal * .45;
  const previous = unit.script[unit.script.findIndex(line => line.id === sentence.id)-1];
  const context = previous ? `<div class="speak-context"><div class="context-head"><span class="micro-label">${previous.speaker === 'A' ? '机器上句' : '你刚才说的上句'}</span>${previous.speaker === 'A' ? '<button id="hear-context" class="secondary">听上句</button>' : ''}</div><p lang="en">${esc(previous.text)}</p><p class="context-cn">${esc(previous.translation)}</p></div>` : `<div class="speak-context"><span class="micro-label">情境提示 · ${unit.label}</span><p>这段对话从你开口开始。</p></div>`;
  return `<section class="screen speak-screen"><p class="eyebrow">说 · 第 ${state.sentenceIndex+1} / ${unit.learn.length} 句</p><div class="split"><div class="panel">${context}<div class="speak-target-head"><h1>读出这句话</h1><button id="play-original" class="secondary">原音</button></div><div class="question">${wordMarkup}</div><p class="cn">${sentence.translation}</p><p class="word-help">点词语可听发音。</p><div class="buddy-note">${buddyIdle}<span>${sentence.text.match(/[A-Za-z']+/g).length > 10 ? '这一句有点长，可以先找到自然换气的位置。' : '读这句时，先看清楚要说的意思。'}</span></div></div><div class="panel"><div class="record-heading"><h2>录下自己的声音</h2><button id="need-help" class="text-button">无法录音？查看帮助</button></div><p class="quiet">戴上耳机。录音最长 10 秒，读完会自动停。</p><div id="wave" class="wave">${'<span></span>'.repeat(28)}</div><p id="record-status" class="status">${latestResult ? feedbackText(latestResult) : count >= 2 ? '这次只跟着读。' : '准备好后，点录音。'}</p><div class="actions"><button id="record" class="primary" ${busy ? 'disabled' : ''}>${busy ? '正在录音' : latestResult ? '再读一遍' : '开始录音'}</button></div><div class="actions"><button id="play-mine" class="secondary" ${latestResult?.signals?.peakLevel >= .05 ? '' : 'disabled'}>我的录音</button><button id="stop-audio" class="secondary">停止播放</button></div><p class="small-note">我的录音 → 原音 → 再读一遍，都由你自己点。</p><div class="speak-stats"><div><span>一口气读到</span><strong>${breath ? `约 ${breath} 词` : '待录'}</strong><progress class="stat-bar" value="${breath}" max="${wordTotal}"></progress></div><div><span>出声时长</span><strong>${seconds ? `${seconds} 秒` : '待录'}</strong><progress class="stat-bar" value="${Math.min(seconds,targetSec)}" max="${targetSec}"></progress></div></div><div class="goal-line"><span>今日句子 ${done}/${unit.learn.length} · 还剩 ${unit.learn.length-done} 句</span><progress class="goal-track" value="${done}" max="${unit.learn.length}"></progress></div><div class="actions"><button id="next-sentence" class="secondary" ${latestResult && ['pass','force_pass'].includes(latestResult.verdict) ? '' : 'disabled'}>${state.sentenceIndex+1 === unit.learn.length ? '进入小节回顾' : '下一句'}</button></div></div></div>${debug ? debugPanel() : ''}</section>`;
}
function microphoneErrorText(error) {
  if (error.name === 'TimeoutError') return '还没收到麦克风回应，需要家长协助检查。';
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') return '麦克风还没打开，需要家长协助。';
  if (error.name === 'NotReadableError' || error.name === 'AbortError') return '麦克风正被别的程序使用。关掉占用它的程序后再试。';
  if (error.name === 'NotFoundError') return '没找到可用的麦克风，需要家长协助连接设备。';
  return '麦克风暂时不能使用，需要家长协助。';
}
function recap() { return recapScreen(state, unit, esc); }
function chat() { return chatScreen(state, unit, esc); }
function resting() { return `<section class="screen split"><div><p class="eyebrow">休息时间</p><h1>现在休息</h1><p>离开屏幕，看看远处。</p><div class="actions"><button id="rest-continue" class="primary">可以继续学习</button></div></div><div class="panel"><p>这段练习留在本机，之后可以接着说。</p></div></section>`; }

function progress() {
  const facts = progressFacts(state, units, sessionNow());
  const goal = Math.max(unit.learn.length, facts.today.sentences), done = Math.min(goal, facts.today.sentences);
  const ring = 2 * Math.PI * 74, offset = ring * (1 - done / goal);
  const recent = facts.current ?? facts.today, previous = facts.previous;
  const metric = (name, value, suffix, before, approx = false) => `<div class="progress-metric"><span>${name}</span><strong>${approx && value ? '约 ' : ''}${value}${suffix}</strong><small>${before == null ? '暂无上次记录' : value === before ? '与上次相同' : `比上次${value > before ? '多' : '少'} ${Math.abs(value-before)}${suffix}`}</small></div>`;
  const summary = previous ? `最近一次一口气读到${recent.words ? `约 ${recent.words} 词` : '的词数暂未记录'}，${recent.words === previous.words ? '与上次相同。' : recent.words > previous.words ? `比上次多约 ${recent.words-previous.words} 词。` : `比上次少约 ${previous.words-recent.words} 词。`}` :
    facts.completedSessions ? `已完成 ${facts.completedSessions} 次练习，之后可与自己的上一次比较。` : '还没有完成一轮练习。读完后，这里会留下自己的记录。';
  const week = facts.week.map((day,index) => `<div class="week-day ${day.done ? 'done' : ''} ${day.today ? 'today' : ''}"><span>${'一二三四五六日'[index]}</span><small>${day.done ? '已读' : day.today ? '今天' : '未读'}</small></div>`).join('');
  return `<section class="screen progress-screen"><div class="progress-heading"><div><span class="micro-label">只跟自己的上一次比</span><h1>我的进步</h1><p>${summary}</p></div><div class="actions"><button id="open-lines" class="secondary">我的句子本</button>${!facts.completedSessions ? '<button id="progress-start" class="secondary">去练一轮</button>' : ''}</div></div><div class="progress-layout"><div class="progress-left"><section class="panel progress-ring-card"><span class="micro-label">今日句子</span><div class="progress-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="74" fill="none" stroke="var(--sunk)" stroke-width="20"/><circle cx="100" cy="100" r="74" fill="none" stroke="var(--energy)" stroke-width="20" stroke-linecap="round" stroke-dasharray="${ring}" stroke-dashoffset="${offset}" transform="rotate(-90 100 100)"/></svg><div><strong>${done}/${goal}</strong><span>句</span></div></div><p class="quiet">今天有 ${facts.today.sentences} 句自己的录音。</p></section><section class="panel"><span class="micro-label">本周 · 已练 ${facts.weekDays} 天</span><div class="progress-week">${week}</div><p class="quiet">本周平均一口气${facts.weekAverageWords == null ? "还没有录音" : `约 ${facts.weekAverageWords} 词`}</p></section></div><div class="progress-right"><section class="panel"><span class="micro-label">最近一次与上一次</span><div class="progress-metrics">${metric('一口气读到',recent.words,'词',previous?.words,true)}${metric('出声时长',recent.seconds,'秒',previous?.seconds)}${metric('没有长停顿的句子',recent.noLongPause,'句',previous?.noLongPause)}${metric('连续开口',facts.streak,'天',null)}</div></section><section class="panel"><span class="micro-label">今日轨迹</span><p>今天读了 ${facts.today.sentences} 句，一口气最长约 ${facts.today.words} 词，开口 ${facts.today.seconds} 秒，连续开口 ${facts.streak} 天。</p>${facts.yesterday.sentences ? `<p class="quiet">昨天读了 ${facts.yesterday.sentences} 句，一口气最长约 ${facts.yesterday.words} 词，开口 ${facts.yesterday.seconds} 秒，当时连续 ${facts.yesterdayStreak} 天。</p>` : '<p class="quiet">昨天没有可比较的录音记录。</p>'}</section></div></div></section>`;
}

function lines() {
  const saved = state.recordings.filter(item => verifiedSaved.has(item.recordingId)).sort((a,b) => (b.createdAt ?? 0)-(a.createdAt ?? 0));
  if (!saved.length) return `<section class="screen lines-screen"><span class="micro-label">本机保存</span><h1>我的句子本</h1><div class="panel lines-empty"><h2>还没有存下句子</h2><p>完成一节跟读后，自己的录音会自动留在这里。</p><button id="lines-start" class="primary">去练一轮</button></div></section>`;
  const cards = saved.map(item => {
    const source = units.find(unit => unit.id === item.unitId), line = source?.script.find(line => line.id === item.sentenceId);
    if (!line) return '';
    const date = item.createdAt ? dateKey(item.createdAt) : '保存日期未知';
    return `<article class="line-card"><div><span class="micro-label">${date} · ${source.label}</span><p class="english" lang="en">${esc(line.text)}</p><p class="quiet">${esc(line.translation)}</p></div><div class="line-card-actions"><button class="secondary" data-line-play="${esc(item.recordingId)}" aria-label="播放这句录音">播放录音</button><button class="secondary" data-line-delete="${esc(item.recordingId)}" aria-label="删除这句录音">删除这句</button></div></article>`;
  }).join('');
  return `<section class="screen lines-screen"><span class="micro-label">本机保存 · ${saved.length} 句</span><h1>我的句子本</h1><p class="quiet">这些是你自己录下的句子。播放前请戴上耳机。</p><div class="line-list">${cards}</div></section>`;
}

function chooseShowcase() {
  const valid = state.recordings.filter(item => item.unitId === unit.id && item.sessionId === state.sessionId && unit.learn.includes(item.sentenceId) && item.verdict === 'pass' && item.signals?.durationSec >= .3 && item.signals.peakLevel >= .05);
  if (!valid.length) return null;
  const ranked = rankClips(valid);
  return (state.sectionSelected ? ranked.find(item => item.recordingId === state.sectionHighlight) : null) ?? ranked[0] ?? null;
}
async function availableShowcase() {
  let item;
  while ((item = chooseShowcase())) {
    try { if (await loadClip(item.recordingId)) return item; } catch { /* 待录卡兜底。 */ }
    state.recordings = state.recordings.filter(record => record.recordingId !== item.recordingId);
    state.savedLines = state.savedLines.filter(id => id !== item.recordingId);
  }
  return null;
}
function showcaseContent() {
  const best = chooseShowcase();
  const phrase = !best && state.recordings.some(item => item.unitId === unit.id && item.sessionId === state.sessionId && item.signals?.durationSec >= .3 && item.signals.peakLevel >= .05);
  return { best, phrase, sentence: best ? lineById(unit, best.sentenceId) : phrase ? unit.fallbackPhrase : lineById(unit, unit.learn[0]) };
}
function wrap() {
  const { best, phrase, sentence } = showcaseContent();
  const current = state.recordings.filter(item => item.unitId === unit.id && item.sessionId === state.sessionId);
  const drills = current.filter(item => item.sentenceId === sentence.id).length;
  const spoken = current.reduce((sum,item)=>sum+(item.signals?.durationSec ?? 0),0);
  const mastered = unit.targets.filter(item => (state.counts[item.text] ?? 0) >= 6).length;
  return `<section class="screen split"><div><p class="eyebrow">收尾 · ${unit.label}</p><h1>今日一句</h1><p>站起来看窗外 20 秒。</p><p class="quiet">${spoken ? '今天读完了。' : '这一轮已结束。'}本轮开口 ${Math.round(spoken)} 秒 · 今天见过 6 次的词 ${mastered} 个</p><div class="actions"><button id="share" class="primary">给爸妈听</button><button id="repeat-old" class="secondary">重读旧句</button><button id="finish-home" class="secondary">回首页选情境</button></div><p id="share-status" class="quiet">由你自己决定何时播放。</p></div><div class="showcase"><p class="eyebrow">${best ? '今日一句' : phrase ? '待录短语卡 · 播放的是示范音' : '待录句子卡 · 播放的是示范音'}</p><p class="english" lang="en">${esc(sentence.text)}</p><p>${esc(sentence.translation)}</p><button id="play-showcase" class="secondary play" aria-label="${best ? '播放自己的录音' : '播放示范音'}">▶</button><p class="small-note">这句话今天练了 ${drills} 遍</p></div></section>`;
}
function share() {
  const own = !!showcaseContent().best;
  const spokenTurns = new Set(state.recordings.filter(item => item.sessionId === state.sessionId && item.stage === 'chat' && item.signals?.peakLevel >= .05).map(item => item.sentenceId)).size;
  return `<section class="screen split"><div><p class="eyebrow">本轮完成</p><h1>这轮对话已完成</h1><p>${spokenTurns ? `你在对话里接了 ${spokenTurns} 句。` : '这轮对话已经听完。'}${own ? '你留下了一句自己的声音，想听时可以再播。' : '这张待录卡播放的是示范音，之后还可以录下自己的声音。'}</p><div class="actions"><button id="finish-home" class="primary">回首页选情境</button><button id="play-again" class="secondary">再播一次</button><button id="save-line" class="secondary">存进我的句子本</button></div><p id="share-status" class="quiet">今天的练习留在这台设备上。</p></div><div class="showcase">${wrap().match(/<div class="showcase">([\s\S]*?)<\/div>/)?.[1] ?? ''}</div></section>`;
}
function render() {
  timeGuard();
  const view = state.resting ? 'resting' : overlayPage ?? (showHome ? 'home' : state.stage);
  if (view === 'chat') state.chatIndex = childChatIndex(unit, state.chatIndex);
  main.innerHTML = ({ home, listen, speak: speakScreen, recap, chat, resting, wrap, share, progress, lines, parent: parent.screen, selfcheck: selfcheck.screen })[view]?.() ?? home();
  const chipUnit = view === 'home' || (overlayPage && (showHome || state.stage === 'home')) ? homeRecommendation : unit;
  label.textContent = (stageNames[view] ?? '') + (debug && params.get('feedback') ? ' · 调试预览' : '');
  document.querySelector('#unit-chip').innerHTML = `${icon('home')}<span>${chipUnit.label} · <span lang="en">${esc(chipUnit.title)}</span></span>`;
  document.querySelector('#streak-chip').innerHTML = `${icon('flame')}<span>连续开口 ${consecutiveDays(state.completedDays, sessionNow())} 天</span>`;
  for (const id of ['unit-chip','streak-chip','settings-open']) document.getElementById(id).hidden = view === 'parent' || view === 'selfcheck';
  document.querySelector('#back').hidden = view === 'home' || view === 'resting';
  document.querySelector('#parent-open').hidden = view !== 'home';
  document.querySelector('#back').innerHTML = `${icon(overlayPage ? 'back' : 'home')}<span>${overlayPage ? '返回' : '回首页'}</span>`;
  const previousStage = { speak:'listen', recap:'speak', chat:'recap', wrap:'chat', share:'wrap' }[view];
  const stageBack = document.querySelector('#stage-back');
  stageBack.hidden = !previousStage || !!overlayPage || !!showHome;
  if (previousStage) stageBack.innerHTML = `${icon('back')}<span>返回${{listen:'听对话',speak:'跟读',recap:'小节回顾',chat:'对话接龙',wrap:'今日一句'}[previousStage]}</span>`;
  for (const [selector,name] of [['#record','mic'],['#chat-record','mic'],['#play-script','play'],['#play-pair','play'],['#share','share'],['#play-mine','play'],['#play-original','volume']]) {
    const button = main.querySelector(selector); if (button) button.innerHTML = `${icon(name)}<span>${button.textContent}</span>`;
  }
  main.querySelectorAll('[data-line-play]').forEach(button => { button.innerHTML = `${icon('play')}<span>播放录音</span>`; });
  main.querySelectorAll('[data-line-delete]').forEach(button => { button.innerHTML = `${icon('delete')}<span>删除这句</span>`; });
  if (view === 'listen') syncListenButton();
  bind();
  if (debug) updateDebug();
}
function bind() {
  const $ = selector => main.querySelector(selector);
  $('#start')?.addEventListener('click', () => {
    if (state.startedAt && !['home','wrap','share'].includes(state.stage)) { showHome = false; render(); return; }
    beginUnit(homeRecommendation);
  });
  main.querySelectorAll('[data-unit]').forEach(button => button.addEventListener('click', () => {
    // shortcut: 切换情境从听重新开始；需要跨情境续练时再按单元保存阶段进度。
    beginUnit(units.find(item => item.id === button.dataset.unit));
  }));
  $('#open-progress')?.addEventListener('click', () => { overlayPage = 'progress'; render(); });
  $('#progress-start')?.addEventListener('click', () => { overlayPage = null; showHome = true; render(); });
  $('#open-lines')?.addEventListener('click', () => { overlayReturn = overlayPage; overlayPage = 'lines'; render(); });
  $('#lines-start')?.addEventListener('click', () => { overlayPage = null; showHome = true; render(); });
  main.querySelectorAll('[data-line-play]').forEach(button => button.addEventListener('click', () => playClip(button.dataset.linePlay)));
  main.querySelectorAll('[data-line-delete]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.lineDelete; button.disabled = true; stopClip(); stopPair();
    try {
      await deleteClip(id);
      state.recordings = state.recordings.filter(item => item.recordingId !== id);
      state.savedLines = state.savedLines.filter(saved => saved !== id);
      if (state.sectionHighlight === id) { state.sectionHighlight = bestSectionClip(unit, state.recordings, state.sessionId)?.recordingId ?? null; state.sectionSelected = false; }
      if (latestResult?.recordingId === id) latestResult = null;
      save(); render(); refreshSavedLines();
    } catch { button.disabled = false; showToast('这句暂时没删掉，请再点一次。', 'notice'); }
  }));
  $('#play-script')?.addEventListener('click', () => {
    if (scriptPlaying && !scriptPaused) {
      // shortcut: 暂停时停止朗读，继续从当前句首重播；词内续播需可报告播放进度的音频源。
      scriptRunId++; scriptPlaying = false; scriptPaused = true; queuedAudio.length = 0; stopSpeech();
      $('#listen-status').textContent = '已暂停。继续播放会从这句句首重播。';
      syncListenButton();
    } else { scriptPaused = false; playScript(); }
  });
  $('#replay-script')?.addEventListener('click', () => {
    scriptRunId++; scriptPlaying = false; scriptPaused = true; queuedAudio.length = 0; stopSpeech();
    state.listenIndex = 0; state.heard = false; state.listenAudioUnavailable = false; save(); highlightLine(0);
    setTimeout(() => { scriptPaused = false; playScript(); }, 0);
  });
  $('#to-speak')?.addEventListener('click', () => checkpoint('speak'));
  main.querySelectorAll('[data-word]').forEach(button => button.addEventListener('click', () => queueOrSpeak(button.dataset.word, Number(button.closest('[data-line]')?.dataset.line ?? -1), button)));
  main.querySelectorAll('[data-replay-line]').forEach(button => button.addEventListener('click', () => queueOrSpeak(unit.script[Number(button.dataset.replayLine)].text, Number(button.dataset.replayLine))));
  $('#record')?.addEventListener('click', doRecord);
  $('#copy-debug')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(debugText()); $('#debug-copy-status').textContent = '已复制，可以发给我。'; }
    catch { $('#debug-copy-status').textContent = '复制失败，请选中上方文字复制。'; }
  });
  $('#play-mine')?.addEventListener('click', () => playClip(latestResult?.recordingId));
  $('#hear-context')?.addEventListener('click', () => { stopClip(); speak(unit.script[unit.script.findIndex(line => line.id === unit.learn[state.sentenceIndex])-1].text); });
  $('#play-original')?.addEventListener('click', () => speak(lineById(unit, unit.learn[state.sentenceIndex]).text, { cacheDuration: true }));
  $('#stop-audio')?.addEventListener('click', () => { stopSpeech(); stopClip(); });
  $('#need-help')?.addEventListener('click', () => document.querySelector('#help').showModal());
  $('#next-sentence')?.addEventListener('click', () => { latestResult = null; if (++state.sentenceIndex >= unit.learn.length) checkpoint('recap'); else { save(); render(); } });
  $('#play-pair')?.addEventListener('click', playPair);
  main.querySelectorAll('[data-recap-play]').forEach(button => button.addEventListener('click', async () => { stopPair(); try { if (!await playClip(button.dataset.recapPlay)) showToast('这段录音暂时找不到。', 'notice'); } catch { showToast('这段录音暂时找不到。', 'notice'); } }));
  main.querySelectorAll('[data-recap-select]').forEach(button => button.addEventListener('click', async () => {
    const item = sectionCandidates(unit, state.recordings, state.sessionId).find(record => record.recordingId === button.dataset.recapSelect);
    if (!item) return;
    try { if (!await loadClip(item.recordingId)) { showToast('这段录音暂时找不到。', 'notice'); return; } } catch { showToast('这段录音暂时找不到。', 'notice'); return; }
    stopPair(); state.sectionHighlight = item.recordingId; state.sectionSelected = true;
    if (!state.savedLines.includes(item.recordingId)) state.savedLines.push(item.recordingId);
    save(); render(); refreshSavedLines();
  }));
  $('#recap-share')?.addEventListener('click', async () => {
    const item = state.recordings.find(record => record.recordingId === state.sectionHighlight);
    let available = false; try { available = !!(item && await loadClip(item.recordingId)); } catch { /* 待录卡兜底。 */ }
    if (available) { item.sharedAt = sessionNow(); item.sharedByChild = true; state.sectionSelected = true; save(); render(); if (!pairPlaying) playPair(); }
    else { state.sectionHighlight = null; save(); render(); }
  });
  $('#recap-demo')?.addEventListener('click', async () => { if (!await speak(lineById(unit, unit.learn[0]).text) && state.stage === 'recap') { const status = main.querySelector('#recap-status'); if (status) status.textContent = '英文示范音暂时没有播出。'; } });
  $('#recap-next')?.addEventListener('click', () => checkpoint('chat'));
  $('#chat-next')?.addEventListener('click', advanceChat);
  $('#chat-wrap')?.addEventListener('click', () => checkpoint('wrap'));
  $('#chat-exit')?.addEventListener('click', () => { machinePlayId++; chatController?.abort(); stopSpeech(); showHome = true; save(); render(); });
  $('#chat-replay')?.addEventListener('click', playMachineTurn);
  $('#chat-record')?.addEventListener('click', doChatRecord);
  $('#chat-play-mine')?.addEventListener('click', async () => {
    const id = unit.chat[state.chatIndex];
    const item = state.recordings.findLast(record => record.sessionId === state.sessionId && record.stage === 'chat' && record.sentenceId === id && record.signals?.peakLevel >= .05);
    try { if (!await playClip(item?.recordingId)) showToast('这段录音暂时找不到。', 'notice'); } catch { showToast('这段录音暂时找不到。', 'notice'); }
  });
  $('#chat-help')?.addEventListener('click', () => document.querySelector('#help').showModal());
  $('#chat-hide')?.addEventListener('click', () => { state.chatHidden = true; save(); render(); });
  $('#chat-peek')?.addEventListener('click', () => { state.chatHidden = false; state.chatHelp = 1; save(); render(); });
  $('#chat-hear')?.addEventListener('click', async () => { const index = state.chatIndex; state.chatHelp = 2; save(); render(); if (!await speak(lineById(unit, unit.chat[index]).text) && state.stage === 'chat' && state.chatIndex === index) { const status = main.querySelector('#chat-status'); if (status) status.textContent = '英文示范音暂时没有播出。'; } });
  $('#rest-continue')?.addEventListener('click', continueLearning);
  $('#play-showcase')?.addEventListener('click', playShowcase);
  $('#repeat-old')?.addEventListener('click', () => { state.sentenceIndex = 0; latestResult = null; checkpoint('speak'); });
  $('#share')?.addEventListener('click', async () => { const best = await availableShowcase(); state.shared = true; const session = state.sessions.find(item => item.sessionId === state.sessionId); if (session) session.shared = true; if (best) { best.sharedAt = sessionNow(); best.sharedByChild = true; } checkpoint('share'); playShowcase(); });
  $('#play-again')?.addEventListener('click', playShowcase);
  $('#save-line')?.addEventListener('click', () => { const best = chooseShowcase(); const id = best?.recordingId ?? 'pending'; if (!state.savedLines.includes(id)) state.savedLines.push(id); save(); $('#share-status').textContent='已存进本机句子本。'; });
  $('#finish-home')?.addEventListener('click', () => document.querySelector('#back').click());
}
function syncListenButton() {
  const button = main.querySelector('#play-script');
  if (!button) return;
  const label = scriptPaused ? '继续播放' : scriptPlaying ? '暂停播放' : state.listenAudioUnavailable ? '重试播放' : state.heard ? '再听一遍' : state.listenIndex ? '继续播放' : '播放对话';
  button.innerHTML = `${icon(scriptPlaying && !scriptPaused ? 'pause' : 'play')}<span>${label}</span>`;
}
async function playScript() {
  if (scriptPlaying || state.stage !== 'listen' || showHome) return;
  if (state.listenIndex >= unit.script.length) state.listenIndex = 0;
  scriptPlaying = true; scriptPaused = false; state.listenAudioUnavailable = false; syncListenButton();
  let played = true, interrupted = false;
  const sessionId = state.sessionId, runId = ++scriptRunId;
  while (state.listenIndex < unit.script.length && state.stage === 'listen' && !showHome) {
    const index = state.listenIndex;
    highlightLine(index);
    main.querySelector('#listen-progress').textContent = `第 ${index+1} / ${unit.script.length} 句`;
    main.querySelector('#listen-status').textContent = '正在播放对话。';
    played = await speak(unit.script[index].text, { cacheDuration:true });
    if (runId !== scriptRunId || scriptPaused || showHome || state.stage !== 'listen' || state.sessionId !== sessionId) { interrupted = true; break; }
    if (!played) break;
    state.listenIndex = index + 1; save();
    while (queuedAudio.length && state.stage === 'listen') {
      const replay = queuedAudio.shift();
      highlightLine(replay.index);
      played = await speak(replay.text);
      if (runId !== scriptRunId || scriptPaused || showHome || state.stage !== 'listen' || state.sessionId !== sessionId) { interrupted = true; break; }
      if (!played) break;
    }
    if (interrupted || !played) break;
  }
  if (runId !== scriptRunId) return;
  scriptPlaying = false; queuedAudio.length = 0;
  if (interrupted || state.stage !== 'listen' || showHome || state.sessionId !== sessionId) { syncListenButton(); return; }
  if (!played) {
    state.listenAudioUnavailable = true;
    main.querySelector('#listen-progress').textContent = '示范音暂时不可用';
    main.querySelector('#listen-status').textContent = '英文示范音暂时没有播出。可以看文字后开始跟读。';
  } else {
    state.listenAudioUnavailable = false;
    main.querySelector('#listen-status').textContent = '对话已听完，可以进入跟读。';
    main.querySelector('#listen-progress').textContent = `已听 ${unit.script.length} / ${unit.script.length} 句`;
    for (const word of unit.targets) if (unit.script.some(line => line.text.toLowerCase().includes(word.text))) markSeen(`listen:${word.id}`, word.text);
  }
  state.heard = true; save();
  highlightLine(-1); syncListenButton();
}
function highlightLine(index) {
  main.querySelectorAll('.dialogue-line').forEach(line => {
    const number = Number(line.dataset.line), active = number === index;
    line.classList.toggle('active', active);
    if (active) { line.setAttribute('aria-current', 'true'); line.scrollIntoView({ block:'nearest' }); }
    else line.removeAttribute('aria-current');
  });
}
async function queueOrSpeak(text, index, button) {
  if (scriptPlaying && state.stage === 'listen') {
    queuedAudio.push({ text, index });
    document.querySelector('#listen-status').textContent = `已加入重听：第 ${index+1} 句。`;
    return;
  }
  if (state.stage === 'listen') highlightLine(index);
  main.querySelectorAll('.word.is-active').forEach(word => word.classList.remove('is-active'));
  button?.classList.add('is-active'); await speak(text); button?.classList.remove('is-active');
}
function advanceChat() {
  machinePlayId++;
  stopSpeech(); stopClip();
  state.chatIndex = childChatIndex(unit, state.chatIndex + 1);
  state.chatHelp = 0; state.chatHidden = false; state.chatDone = false; state.chatFeedback = null;
  save(); render();
  playMachineTurn();
}
async function playMachineTurn() {
  const line = previousMachine(unit, unit.chat[state.chatIndex]);
  if (state.stage !== 'chat' || !line) return;
  const index = state.chatIndex, playId = ++machinePlayId;
  const played = await speak(line.text);
  if (playId !== machinePlayId || state.stage !== 'chat' || state.chatIndex !== index) return;
  if (!played) main.querySelector('#chat-status').textContent = '英文示范音暂时没有播出。可以点录音。';
}
async function doChatRecord() {
  if (chatController) { chatController.abort(); return; }
  if (busy) return;
  const line = lineById(unit, unit.chat[state.chatIndex]);
  if (line?.speaker !== 'B') return;
  busy = true; machinePlayId++; stopSpeech(); stopClip();
  const index = state.chatIndex, sessionId = state.sessionId, epoch = recordingEpoch();
  const controller = new AbortController(); chatController = controller;
  const button = main.querySelector('#chat-record'); button.textContent = '准备中'; button.disabled = true;
  main.querySelector('#chat-status').textContent = '正在准备麦克风，看到“现在开始读”后再开口。';
  try {
    const id = crypto.randomUUID();
    const bars = [...main.querySelectorAll('#chat-wave span')];
    const { blob, signals } = await recordSentence(targetDuration(line.text), rms => {
      if (!document.hidden) bars.forEach((bar, i) => { bar.style.transform = `scaleY(${Math.max(.12, Math.min(1, rms * (4 + i%6)))})`; });
    }, controller.signal, () => {
      if (state.stage !== 'chat' || state.chatIndex !== index) return;
      main.querySelector('#chat-wave')?.classList.add('is-recording');
      button.disabled = false; button.textContent = '好了';
      main.querySelector('#chat-status').textContent = '现在开始读。读完会自动停，也可以点“好了”。';
    });
    if (state.stage !== 'chat' || state.chatIndex !== index || state.sessionId !== sessionId) return;
    const prior = failures(sessionId, line.id);
    const result = completionResult(assess({ recordingId:id, signals,
      wordCount:line.text.match(/[A-Za-z']+/g).length, priorFailures:prior }));
    if (!await saveClip(id, blob, epoch)) return;
    state.recordings.push({ recordingId:id, sentenceId:line.id, unitId:unit.id, sessionId, stage:'chat', sectionIndex:0,
      createdAt:sessionNow(), signals, channel:'none', verdict:result.verdict });
    const passed = ['pass','force_pass'].includes(result.verdict);
    setFailures(sessionId, line.id, passed ? 0 : prior+1);
    state.chatDone = passed; state.chatFeedback = feedbackText(result);
    save(); render();
    showToast(passed ? `第 ${index+1} 句读完了 · 今天还剩 ${unit.chat.slice(index+1).filter(id => lineById(unit, id).speaker === 'B').length} 句` : '机器没听清这句。', passed ? 'success' : 'notice');
  } catch (error) {
    if (state.stage !== 'chat' || state.chatIndex !== index) return;
    state.chatFeedback = microphoneErrorText(error);
    save(); render();
  } finally { if (chatController === controller) chatController = null; busy = false; }
}
async function doRecord() {
  if (busy) return;
  busy = true;
  if (debug) { debugSnapshot = { frames:0, maxRms:0, peak:0, samples:0, recognition:'待录音' }; updateDebug(); }
  const sentence = lineById(unit, unit.learn[state.sentenceIndex]);
  const button = document.querySelector('#record'); button.disabled = true;
  const statusNode = document.querySelector('#record-status');
  let readyCue = document.querySelector('#record-ready');
  if (!readyCue) {
    readyCue = document.createElement('p'); readyCue.id = 'record-ready'; readyCue.className = 'record-ready';
    readyCue.setAttribute('role', 'status'); readyCue.textContent = '现在开始读'; statusNode.before(readyCue);
  }
  readyCue.hidden = true;
  statusNode.textContent = '正在准备麦克风，看到“现在开始读”后再开口。';
  const id = crypto.randomUUID();
  let recognition;
  try {
    stopSpeech(); stopClip();
    // shortcut: 本地识别与部分麦克风能否共存待真机对照；确认前默认保留纯录音通道。
    recognition = debug && params.get('asr') === 'on' ? await startLocalRecognition(id) : null;
    if (debug) console.info('识别对照', recognition ? '本地识别已启动' : '纯音频通道', '请求', params.get('asr') ?? 'off');
    if (debug) { debugSnapshot.recognition = recognition ? '本地识别已启动' : '纯音频通道'; updateDebug(); }
    const bars = [...document.querySelectorAll('#wave span')];
    const epoch = recordingEpoch();
    recordController = new AbortController();
    const { blob, signals } = await recordSentence(targetDuration(sentence.text), (rms, issue, data) => {
      if (debug && issue === 'track') { debugSnapshot.track = data; updateDebug(); return; }
      if (debug && data) {
        debugSnapshot.frames++;
        debugSnapshot.first ??= data;
        debugSnapshot.last = data;
        debugSnapshot.samples = data.samples;
        debugSnapshot.maxRms = Math.max(debugSnapshot.maxRms, data.rms);
        debugSnapshot.peak = Math.max(debugSnapshot.peak, data.peak);
        if (debugSnapshot.frames % 20 === 0) updateDebug();
      }
      if (debug && issue) { debugSnapshot.issue = issue; updateDebug(); }
      if (!document.hidden) bars.forEach((bar,index) => { bar.style.transform = `scaleY(${Math.max(.12, Math.min(1, rms * (8 + index%6)))})`; });
      if (issue === 'low_input') statusNode.textContent = '现在可以开口，机器暂时还没听到声音。';
      else if (issue) statusNode.textContent = '麦克风好像没有声音进来，可以查看录音帮助。';
      else if (issue === null) document.querySelector('#record-status').textContent = '正在录音，读完后会自动停。';
    }, recordController.signal, () => {
      if (state.stage !== 'speak' || !document.querySelector('#record-status')) return;
      readyCue.hidden = false;
      document.querySelector('#wave')?.classList.add('is-recording');
      statusNode.textContent = '读完会自动停。';
    });
    readyCue.hidden = true;
    const heard = await recognition?.stop();
    const channel = heard?.recordingId === id ? 'webspeech' : 'none';
    if (channel === 'webspeech') Object.assign(signals, heard, alignWords(sentence.text, heard.transcript));
    const prior = failures(state.sessionId, sentence.id);
    const result = completionResult(assess({ recordingId: id, signals, wordCount: sentence.text.match(/[A-Za-z']+/g).length, priorFailures: prior, channel }));
    debugResult(result);
    if (debug) Object.assign(debugSnapshot, { signals, verdict:result.verdict, channel });
    if (!await saveClip(id, blob, epoch)) { busy = false; render(); return; }
    state.recordings.push({ recordingId:id, sentenceId:sentence.id, unitId:unit.id, sessionId:state.sessionId, stage:'speak', sectionIndex:0, createdAt:sessionNow(), signals, channel, verdict:result.verdict });
    setFailures(state.sessionId, sentence.id, ['pass','force_pass'].includes(result.verdict) ? 0 : prior+1);
    latestResult = result;
    save();
    const passed = ['pass','force_pass'].includes(result.verdict);
    busy = false;
    render();
    if (passed && signals.peakLevel >= .05 && main.querySelector('.speak-screen')) {
      main.insertAdjacentHTML('beforeend', resultNotice(state, unit, result, buddyIdle));
      const notice = main.querySelector('.result-notice');
      setTimeout(() => notice.remove(), 2000);
    } else showToast(passed ? `第 ${state.sentenceIndex+1} 句读完了` : '机器没听清这句。', passed ? 'success' : 'notice');
  } catch (error) {
    readyCue.hidden = true;
    recognition?.abort();
    if (debug) { debugSnapshot.issue = error.name; debugSnapshot.verdict = 'device_error'; updateDebug(); }
    document.querySelector('#record-status').textContent = microphoneErrorText(error);
    document.querySelector('#need-help').hidden = false;
    document.querySelector('#next-sentence').hidden = true;
    if (!document.querySelector('#skip-device')) {
      const skip = document.createElement('button');
      skip.id = 'skip-device'; skip.className = 'secondary'; skip.textContent = '先看下一句';
      skip.addEventListener('click', () => { latestResult = null; if (++state.sentenceIndex >= unit.learn.length) checkpoint('recap'); else { save(); render(); } });
      document.querySelector('#record-status').after(skip);
    }
    button.disabled = false;
  } finally { document.querySelector('#wave')?.classList.remove('is-recording'); recordController = null; busy = false; }
}
async function playClip(id, requirePair = false) {
  if (!id) return false;
  const blob = await loadClip(id);
  if (!blob || (requirePair && !pairPlaying)) return false;
  stopSpeech();
  stopClip();
  const url = URL.createObjectURL(blob);
  clipUrl = url;
  audioPlayback = new Audio(url);
  const audio = audioPlayback;
  audio.onended = () => { if (audioPlayback === audio) { audioPlayback = null; clipUrl = null; } URL.revokeObjectURL(url); if (pairPlaying) finishPair(); };
  audio.onerror = audio.onended;
  try { await audio.play(); return true; } catch { stopClip(); return false; }
}
function stopClip() {
  audioPlayback?.pause();
  if (clipUrl) URL.revokeObjectURL(clipUrl);
  audioPlayback = null; clipUrl = null;
}
function finishPair() {
  pairPlaying = false;
  const button = main.querySelector('#play-pair');
  if (button) button.textContent = '播放';
}
function stopPair() {
  pairPlaying = false;
  if (pairTimer) clearTimeout(pairTimer);
  pairTimer = null;
  pairWait?.(); pairWait = null;
  stopSpeech(); stopClip(); finishPair();
}
async function playPair() {
  if (pairPlaying) { stopPair(); return; }
  const best = state.recordings.find(item => item.recordingId === state.sectionHighlight);
  const machine = best && previousMachine(unit, best.sentenceId);
  if (!machine) return;
  pairPlaying = true;
  main.querySelector('#play-pair').textContent = '停止播放';
  const spoken = await speak(machine.text);
  if (!pairPlaying) return;
  if (!spoken) { stopPair(); main.querySelector('#recap-status').textContent = '英文示范音暂时没有播出。'; return; }
  await new Promise(resolve => { pairWait = resolve; pairTimer = setTimeout(() => { pairTimer = null; pairWait = null; resolve(); }, 300); });
  if (!pairPlaying) return;
  if (!await playClip(best.recordingId, true) && pairPlaying) { stopPair(); main.querySelector('#recap-status').textContent = '这段录音暂时找不到。'; }
}
async function playShowcase() {
  const { best, sentence } = showcaseContent();
  if (best) {
    if (!await playClip(best.recordingId)) document.querySelector('#share-status').textContent = '这段录音暂时找不到。';
    return;
  }
  if (!await speak(sentence.text)) document.querySelector('#share-status').textContent = '英文示范音暂时没有播出。';
}

document.querySelector('#close-help').addEventListener('click', () => document.querySelector('#help').close());
const settings = document.querySelector('#settings');
const restDialog = document.querySelector('#rest');
document.querySelector('#rest-now').addEventListener('click', () => { restDialog.close(); enterRest(); });
document.querySelector('#rest-continue-dialog').addEventListener('click', () => { restDialog.close(); continueLearning(); });
document.querySelector('#settings-open').innerHTML = `${icon('settings')}<span>设置</span>`;
document.querySelector('#parent-open').innerHTML = icon('parent');
document.querySelector('#parent-open').addEventListener('click', parent.open);
document.querySelector('#settings-open').addEventListener('click', () => settings.showModal());
document.querySelector('#selfcheck-open').addEventListener('click', () => { settings.close(); overlayReturn = overlayPage; overlayPage = 'selfcheck'; render(); });
document.querySelector('#settings-close').addEventListener('click', () => settings.close());
document.querySelector('#delete-recordings').addEventListener('click', () => { document.querySelector('#demo-reset-confirm').hidden = true; document.querySelector('#delete-confirm').hidden = false; });
document.querySelector('#delete-cancel').addEventListener('click', () => { document.querySelector('#delete-confirm').hidden = true; });
document.querySelector('#delete-all').addEventListener('click', async () => {
  const button = document.querySelector('#delete-all'); button.disabled = true;
  stopPair(); stopClip(); stopSpeech(); chatController?.abort(); recordController?.abort();
  try {
    await deleteAllClips();
    state.recordings = []; state.savedLines = state.savedLines.filter(id => id === 'pending');
    state.sectionHighlight = null; state.shared = false; latestResult = null;
    verifiedSaved.clear();
    parent.refresh();
    save(); render();
    document.querySelector('#delete-confirm').hidden = true;
    document.querySelector('#delete-status').textContent = '这台设备保存的录音已删除。';
  } catch {
    document.querySelector('#delete-status').textContent = '这次没有删完，请再点一次。';
  } finally { button.disabled = false; }
});
document.querySelector('#demo-reset').addEventListener('click', () => { document.querySelector('#delete-confirm').hidden = true; document.querySelector('#demo-reset-confirm').hidden = false; });
document.querySelector('#demo-reset-cancel').addEventListener('click', () => { document.querySelector('#demo-reset-confirm').hidden = true; });
document.querySelector('#demo-reset-all').addEventListener('click', async () => {
  if (params.get('demo') !== '1') return;
  if (busy) { document.querySelector('#delete-status').textContent = '正在录音，请等这句结束后再重置。'; return; }
  const button = document.querySelector('#demo-reset-all'); button.disabled = true;
  stopPair(); stopClip(); stopSpeech(); chatController?.abort(); recordController?.abort();
  try {
    await deleteAllClips(); clearDemoProgress();
    state = newProgress(); state.unitId = firstUnit.id; state.savedLines = []; state.sessions = []; state.completedDays = [];
    unit = firstUnit; latestResult = null; verifiedSaved.clear(); parent.refresh();
    showHome = true; overlayPage = null; activeMs = 0; save(); render();
    document.querySelector('#demo-reset-confirm').hidden = true;
    document.querySelector('#delete-status').textContent = '演示记录已重置。日常记录已保留。';
  } catch { document.querySelector('#delete-status').textContent = '这次没有重置完，请再点一次。'; }
  finally { button.disabled = false; }
});
document.querySelector('#back').addEventListener('click', () => {
  if (busy) return;
  if (overlayPage) { if (overlayPage === 'selfcheck') selfcheck.stop(); overlayPage = overlayReturn; overlayReturn = null; render(); return; }
  machinePlayId++; chatController?.abort(); stopPair(); stopClip(); stopSpeech();
  scriptRunId++; scriptPlaying = false; queuedAudio.length = 0; scriptPaused = false;
  showHome = true; save(); render(); refreshSavedLines();
});
document.querySelector('#stage-back').addEventListener('click', () => {
  if (busy || overlayPage || showHome) return;
  const previous = { speak:'listen', recap:'speak', chat:'recap', wrap:'chat', share:'wrap' }[state.stage];
  if (!previous) return;
  if (state.stage === 'recap') {
    state.sentenceIndex = Math.min(state.sentenceIndex, unit.learn.length - 1);
    const item = state.recordings.findLast(record => record.unitId === unit.id && record.sessionId === state.sessionId && record.stage === 'speak' && record.sentenceId === unit.learn[state.sentenceIndex]);
    latestResult = item ? { recordingId:item.recordingId, signals:item.signals, verdict:item.verdict, channel:item.channel } : null;
  }
  if (state.stage === 'wrap') {
    state.chatIndex = unit.chat.findLastIndex(id => lineById(unit, id)?.speaker === 'B');
    state.chatDone = state.recordings.some(record => record.sessionId === state.sessionId && record.stage === 'chat' && record.sentenceId === unit.chat[state.chatIndex] && record.signals?.peakLevel >= .05);
  }
  stopSpeech(); stopClip(); stopPair(); queuedAudio.length = 0; scriptPaused = false;
  checkpoint(previous);
});
document.querySelector('#help').addEventListener('click', event => { if (event.target.id === 'help') event.target.close(); });
document.querySelector('#copy-help').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText('帮我打开电脑的麦克风权限'); document.querySelector('#copy-status').textContent='求助句已复制。'; }
  catch { document.querySelector('#copy-status').textContent='复制失败，请告诉家长：帮我打开电脑的麦克风权限。'; }
});
initVoices();
const offlineBanner = document.querySelector('#offline-banner');
function updateConnection() { offlineBanner.hidden = navigator.onLine; }
addEventListener('online', updateConnection); addEventListener('offline', updateConnection); updateConnection();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
if (['home','listen','speak','recap','chat','wrap','share'].includes(preview)) {
  state.stage = preview;
  if (!debug) {
    params.delete('page');
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  }
}
if (params.has('launch')) {
  params.delete('launch');
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
}
if (debug && params.get('feedback') === 'retry') latestResult = { recordingId: null, verdict: 'retry', channel: 'none', signals: { wordHits: [] } };
render();
refreshSavedLines();
