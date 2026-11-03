import { parentPinKey, loadClip, dateKey, consecutiveDays } from './storage.js';
import { breathWords } from './progress.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function createParent({ main, units, getState, now, onOpen, playClip, playDemo, stopAudio, openDelete }) {
  const gate = document.createElement('dialog');
  gate.className = 'help-modal parent-gate';
  gate.setAttribute('aria-labelledby', 'parent-gate-title');
  gate.innerHTML = `<div class="help"><div class="help-head"><h2 id="parent-gate-title">家长查看</h2><button id="parent-gate-close" class="secondary">关闭</button></div><p id="parent-gate-prompt"></p><p id="parent-gate-dots" class="parent-gate-dots" aria-live="polite"></p><div class="number-pad" id="parent-number-pad" aria-label="输入四位口令">${[...'123456789'].map(digit => `<button type="button" data-parent-digit="${digit}">${digit}</button>`).join('')}<button type="button" id="parent-clear">清除</button><button type="button" data-parent-digit="0">0</button><button type="button" id="parent-backspace">退一位</button></div><div class="actions"><button id="parent-confirm" class="primary">确认</button><button id="parent-forgot" class="secondary">忘记口令</button></div><p id="parent-gate-status">这是界面访问门槛，不是安全加密。</p></div><div id="parent-gate-toast" class="toast" role="status" aria-live="polite" hidden></div>`;
  document.body.append(gate);
  let phase = 'verify', entry = '', first = '', unlocked = false, section = 'summary', clips = new Set(), feedbackTimer;
  const $ = selector => gate.querySelector(selector);
  const redrawGate = message => {
    const prompts = {
      setup:'首次查看，请设置四位口令。', confirm:'再输入一次刚设置的四位口令。',
      verify:'输入四位口令，查看本机练习记录。',
      resetFirst:'只重置家长口令。孩子的录音和练习记录会保留。'
    };
    $('#parent-gate-prompt').textContent = prompts[phase];
    $('#parent-gate-dots').textContent = '●'.repeat(entry.length) + '○'.repeat(4-entry.length);
    $('#parent-number-pad').hidden = phase.startsWith('reset');
    $('#parent-confirm').textContent = ({setup:'设置口令',confirm:'确认设置',verify:'进入',resetFirst:'重置口令'})[phase];
    $('#parent-forgot').hidden = phase !== 'verify';
    const feedback = $('#parent-gate-toast');
    clearTimeout(feedbackTimer);
    feedback.hidden = !message;
    if (message) { feedback.textContent = message; feedbackTimer = setTimeout(() => { feedback.hidden = true; }, 2800); }
  };
  const open = () => { phase = localStorage.getItem(parentPinKey) ? 'verify' : 'setup'; entry = ''; first = ''; redrawGate(); gate.showModal(); };
  const authorize = async () => {
    clips = new Set();
    for (const item of getState().recordings) {
      try { if (await loadClip(item.recordingId)) clips.add(item.recordingId); } catch { /* IndexedDB 不可用时只展示待录卡。 */ }
    }
    unlocked = true; section = 'summary'; gate.close(); onOpen();
  };
  $('#parent-gate-close').addEventListener('click', () => gate.close());
  $('#parent-number-pad').addEventListener('click', event => {
    const digit = event.target.closest('[data-parent-digit]')?.dataset.parentDigit;
    if (digit != null && entry.length < 4) entry += digit;
    if (event.target.id === 'parent-clear') entry = '';
    if (event.target.id === 'parent-backspace') entry = entry.slice(0, -1);
    redrawGate();
  });
  $('#parent-forgot').addEventListener('click', () => { phase = 'resetFirst'; entry = ''; redrawGate(); });
  $('#parent-confirm').addEventListener('click', async () => {
    if (phase === 'resetFirst') {
      localStorage.removeItem(parentPinKey);
      unlocked = false; phase = 'setup'; entry = ''; first = '';
      redrawGate('口令已重置，请设置新的四位口令。孩子的记录已保留。');
      return;
    }
    if (entry.length !== 4) { redrawGate('请输入四位数字。'); return; }
    if (phase === 'setup') { first = entry; entry = ''; phase = 'confirm'; redrawGate(); return; }
    if (phase === 'confirm') {
      if (entry !== first) { phase = 'setup'; entry = ''; redrawGate('两次输入不一样，请重新设置。'); return; }
      localStorage.setItem(parentPinKey, entry);
    } else if (entry !== localStorage.getItem(parentPinKey)) { entry = ''; redrawGate('口令未匹配，请再输入。'); return; }
    await authorize();
  });
  gate.addEventListener('click', event => { if (event.target === gate) gate.close(); });
  const screen = () => {
    if (!unlocked) return '';
    if (section === 'manage') return `<section class="screen parent-screen"><div class="parent-heading"><div><span class="micro-label">家长查看</span><h1>隐私与管理</h1></div><button id="parent-summary" class="secondary">返回概览</button></div><div class="parent-manage"><section class="parent-panel"><h2>录音只留在这台设备</h2><p>孩子的录音保存在本机，不会自动发给别人。云端语音识别默认关闭。</p><p>清除浏览器数据或换一台设备后，这里的录音和练习记录不会自动恢复。</p></section><section class="parent-panel"><h2>清理录音</h2><p>删除后不能恢复。练习日期仍会保留在这台设备上。</p><button id="parent-delete" class="secondary">一键删除全部录音</button></section></div></section>`;
    const state = getState(), at = now();
    const weekStart = new Date(at); weekStart.setHours(12,0,0,0); weekStart.setDate(weekStart.getDate() - (weekStart.getDay()+6)%7);
    const firstDay = dateKey(weekStart);
    const weekSessions = state.sessions.filter(item => item.date >= firstDay && item.date <= dateKey(at)).length;
    const recordings = state.recordings.filter(item => clips.has(item.recordingId) && item.signals?.peakLevel >= .05).sort((a,b) => (b.createdAt ?? 0)-(a.createdAt ?? 0));
    const ranked = recordings.map(item => ({ item, source:units.find(unit => unit.id === item.unitId) }))
      .map(row => ({...row, words:breathWords(row.item, row.source)})).sort((a,b) => b.words-a.words);
    const longest = ranked.find(row => row.words > 0), line = longest?.source?.script.find(item => item.id === longest.item.sentenceId);
    const collection = recordings.map(item => {
      const source = units.find(unit => unit.id === item.unitId), sentence = source?.script.find(line => line.id === item.sentenceId);
      return sentence ? `<article class="parent-line"><div><span class="micro-label">${escape(source.label)} · ${dateKey(item.createdAt)}</span><p lang="en">${escape(sentence.text)}</p><small>${escape(sentence.translation)}</small></div><button class="secondary" data-parent-play="${escape(item.recordingId)}">播放录音</button></article>` : '';
    }).join('');
    const sample = units[0].script.find(item => item.id === units[0].learn[0]);
    const empty = `<article class="parent-line parent-empty"><div><span class="micro-label">待录句子卡 · 来源：${escape(units[0].label)}示范音</span><p lang="en">${escape(sample.text)}</p><small>${escape(sample.translation)}。这里还没有孩子的录音。</small></div><button id="parent-demo-play" class="secondary">听示范音</button></article>`;
    return `<section class="screen parent-screen"><div class="parent-heading"><div><span class="micro-label">本机记录</span><h1>家长查看</h1><p>这里记下孩子愿意开口的时刻。</p></div><button id="parent-manage" class="secondary">隐私与管理</button></div><div class="parent-layout"><div class="parent-facts"><section class="parent-panel"><span class="micro-label">本周练了几次</span><p><strong>${weekSessions}</strong> 次</p><small>按完成的练习轮次统计。</small></section><section class="parent-panel"><span class="micro-label">连续几天</span><p><strong>${consecutiveDays(state.completedDays, at)}</strong> 天</p><small>只看这台设备上的完成记录。</small></section><section class="parent-panel"><span class="micro-label">一口气读到的最长句</span>${line ? `<p lang="en" class="parent-longest">${escape(line.text)}</p><small>约 ${longest.words} 词，按录音中的连续出声时长估算。</small>` : '<p>还没有可回放的句子</p><small>录下一句后，这里会显示。</small>'}</section></div><section class="parent-panel parent-collection"><span class="micro-label">句子合集 · ${collection ? recordings.length : 0} 句</span><h2>听听孩子的声音</h2><p>播放前建议戴耳机。</p><div class="parent-lines">${collection || empty}</div><p id="parent-play-status" class="quiet" aria-live="polite"></p></section></div></section>`;
  };
  main.addEventListener('click', async event => {
    if (!unlocked) return;
    if (event.target.closest('#parent-manage')) { section = 'manage'; onOpen(); }
    if (event.target.closest('#parent-summary')) { section = 'summary'; onOpen(); }
    if (event.target.closest('#parent-delete')) openDelete();
    if (event.target.closest('#parent-demo-play')) {
      stopAudio();
      const sample = units[0].script.find(item => item.id === units[0].learn[0]);
      const played = await playDemo(sample.text);
      const status = main.querySelector('#parent-play-status');
      if (status && !played) status.textContent = '这台设备没有可用的英文示范音。';
    }
    const button = event.target.closest('[data-parent-play]');
    if (button) {
      stopAudio();
      if (!await playClip(button.dataset.parentPlay)) {
        clips.delete(button.dataset.parentPlay); onOpen();
      }
    }
  });
  return { open, screen, refresh: () => { clips.clear(); } };
}
