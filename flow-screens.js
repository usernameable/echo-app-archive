import { lineById, previousMachine, sectionCandidates, clipSelectionBasis } from './dialogue.js';
import { breathWords } from './progress.js';

export function feedbackText(result) {
  return ({ pass:'机器听到了声音，这句话已录下。', retry:'机器没听清这句话。', no_sound:'机器还没听到声音。', degrade:'机器还没听到声音，这次先看示范。', force_pass:'这句话已经记录。', device_error:'麦克风暂时不能使用，需要家长协助。' })[result.verdict] ?? '准备录音';
}

export function resultNotice(state, unit, result, mascot) {
  const sentence = lineById(unit, unit.learn[state.sentenceIndex]);
  const signals = result?.signals ?? {};
  const breath = breathWords({ sentenceId:sentence.id, channel:result?.channel, signals }, unit);
  const seconds = Math.round(signals.durationSec ?? 0);
  return `<div class="result-notice" role="status" aria-live="polite"><div class="result-notice-card"><span class="micro-label">本句反馈</span>${mascot}<h2>这句话已录下</h2><p>${feedbackText(result)}</p><div class="speak-stats"><div><span>一口气读到</span><strong>${breath ? `约 ${breath} 词` : '暂无数据'}</strong></div><div><span>出声时长</span><strong>${seconds} 秒</strong></div></div><p class="quiet">暂不能判断每个词的发音。</p></div></div>`;
}

export function recapScreen(state, unit, esc) {
  const candidates = sectionCandidates(unit, state.recordings, state.sessionId);
  const best = candidates.find(item => item.recordingId === state.sectionHighlight) ?? candidates[0];
  if (!best) {
    const pending = lineById(unit, unit.learn[0]);
    return `<section class="screen split"><div><p class="eyebrow">小节回顾 · ${unit.label}</p><h1>这一节结束了</h1><p>这一节还没有适合合播的录音。</p><div class="actions"><button id="recap-next" class="primary">先继续</button></div><p id="recap-status" class="quiet"></p></div><div class="panel"><p class="eyebrow">待录句子卡 · 播放的是示范音</p><p class="english" lang="en">${esc(pending.text)}</p><p>${esc(pending.translation)}</p><button id="recap-demo" class="secondary">播放示范音</button></div></section>`;
  }
  const line = lineById(unit, best.sentenceId), machine = previousMachine(unit, best.sentenceId);
  const count = state.recordings.filter(item => item.sessionId === state.sessionId && item.sentenceId === best.sentenceId).length;
  const basis = state.sectionSelected ? '这段由你试听后选出。' : candidates.length === 1 ? '这节只有这一段可供合播的录音。' : clipSelectionBasis(best);
  const choices = candidates.map(item => {
    const sentence = lineById(unit, item.sentenceId);
    return `<div class="recap-choice"><div><p lang="en">${esc(sentence.text)}</p><small>${esc(sentence.translation)}</small></div><div class="actions"><button class="secondary" data-recap-play="${esc(item.recordingId)}">听这段</button><button class="secondary" data-recap-select="${esc(item.recordingId)}" ${state.sectionSelected && item.recordingId === best.recordingId ? 'disabled' : ''}>${state.sectionSelected && item.recordingId === best.recordingId ? '已留下' : '留下这段'}</button></div></div>`;
  }).join('');
  return `<section class="screen split"><div><p class="eyebrow">小节回顾 · ${unit.label}</p><h1>${state.sectionSelected ? '你留下了这一句' : '先听听这一句'}</h1><p>这句录了 ${count} 次，你有一段自己的录音。</p><p class="small-note">${basis}</p><p class="quiet">机器说上句，停一小会儿，再放你的录音。播放前请戴耳机。</p><p id="recap-status" class="quiet"></p><div class="actions"><button id="recap-share" class="secondary">现在给爸妈听</button><button id="recap-next" class="secondary">先继续</button></div></div><div class="panel recap-panel"><div class="recap-dialogue"><p class="eyebrow">机器上句</p><p class="english" lang="en">${esc(machine.text)}</p><p>${esc(machine.translation)}</p><p class="eyebrow">我的下一句</p><p class="english" lang="en">${esc(line.text)}</p><p>${esc(line.translation)}</p><div class="recap-play-row"><button id="play-pair" class="primary">播放</button></div></div><div class="recap-guidance"><p class="small-note">${state.sectionSelected ? '这段由你自己选出，留在本机。' : '机器先按录音完整度推荐。听过后，可以改选自己想留下的录音。'}</p><p class="small-note">下方录音可上下滑动试听。</p></div><div class="recap-candidates">${choices}</div></div></section>`;
}

export function chatScreen(state, unit, esc) {
  const id = unit.chat[state.chatIndex];
  if (!id) {
    const recorded = new Set(state.recordings.filter(item => item.sessionId === state.sessionId && item.stage === 'chat' && item.signals?.peakLevel >= .05).map(item => item.sentenceId)).size;
    return `<section class="screen split"><div><p class="eyebrow">对话接龙 · ${unit.label}</p><h1>这一段对话接完了</h1><p>${recorded ? `已录下 ${recorded} 句，留在本机。` : '这一段还没有自己的录音。'}</p><div class="actions"><button id="chat-wrap" class="primary">查看今日一句</button></div></div><div class="panel"><p>机器和你轮流接完了这段对话。你练过 ${unit.learn.length} 句，这里共有 ${unit.chat.length} 句。</p></div></section>`;
  }
  const line = lineById(unit, id);
  const previous = state.chatIndex ? lineById(unit, unit.chat[state.chatIndex-1]) : null;
  const own = state.recordings.findLast(item => item.sessionId === state.sessionId && item.stage === 'chat' && item.sentenceId === id && item.signals?.peakLevel >= .05);
  const context = previous ? `<div class="speak-context"><div class="context-head"><span class="micro-label">机器刚才说的上句</span><button id="chat-replay" class="secondary">重听上句</button></div><p lang="en">${esc(previous.text)}</p><p class="context-cn">${esc(previous.translation)}</p></div>` : `<div class="speak-context"><span class="micro-label">情境提示 · ${esc(unit.label)}</span><p>这段对话由你先开口。</p></div>`;
  return `<section class="screen split"><div><p class="eyebrow">对话接龙 · 第 ${state.chatIndex+1} / ${unit.chat.length} 句</p><h1>${previous ? '接住上句' : '这段由你先开口'}</h1><p>听完机器上句，接着说你的句子。</p><p class="small-note">可以看着句子说；熟悉后，也可以隐藏再试。</p><div id="chat-wave" class="wave" aria-hidden="true">${'<span></span>'.repeat(18)}</div><p id="chat-status" class="quiet">${esc(state.chatFeedback ?? (state.chatDone ? '这句话已经录下了。' : '准备好后，点录音。'))}</p><div class="actions"><button id="chat-record" class="primary">${state.chatDone ? '再录一次' : '开始录音'}</button>${state.chatDone ? '<button id="chat-next" class="secondary">下一句</button>' : ''}<button id="chat-exit" class="secondary">先退出</button></div><div class="actions">${own ? `<button id="chat-play-mine" class="secondary">听我的录音</button>` : ''}${!state.chatDone && state.chatHelp === 1 ? '<button id="chat-hear" class="secondary">听一遍</button>' : ''}${!state.chatDone && state.chatHelp >= 2 ? '<button id="chat-next" class="secondary">先看下一句</button>' : ''}${state.chatFeedback?.includes('麦克风') ? '<button id="chat-help" class="secondary">给爸爸妈妈看</button>' : ''}</div></div><div class="panel chat-bubble mine">${context}<div class="chat-line-heading"><p class="eyebrow">我的下一句</p>${state.chatHidden ? '<button id="chat-peek" class="secondary">看一眼句子</button>' : '<button id="chat-hide" class="secondary">隐藏句子</button>'}</div>${state.chatHidden ? '<div class="chat-line-card chat-hidden" aria-label="句子暂时隐藏"><i></i><i></i><i></i></div><p class="chat-hint">句子已隐藏。点「看一眼句子」可重新显示。</p>' : `<div class="chat-line-card"><p class="english" lang="en">${esc(line.text)}</p><p>${esc(line.translation)}</p></div>`}</div></section>`;
}
