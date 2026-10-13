function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDays(baseStr, n) {
  const d = new Date(baseStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return fmt(d);
}

const WEEK_CN = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };

function extractDate(text) {
  const base = new Date();
  const today = fmt(base);
  let m;
  if ((m = text.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) {
    return { date: `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`, matched: m[0] };
  }
  if ((m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/))) {
    return { date: `${base.getFullYear()}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`, matched: m[0] };
  }
  if ((m = text.match(/(\d{1,2})[.\/](\d{1,2})/))) {
    return { date: `${base.getFullYear()}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`, matched: m[0] };
  }
  if ((m = text.match(/(\d+)\s*天[后後]/))) {
    return { date: addDays(today, parseInt(m[1], 10)), matched: m[0] };
  }
  if (text.includes('大后天')) return { date: addDays(today, 3), matched: '大后天' };
  if (text.includes('后天')) return { date: addDays(today, 2), matched: '后天' };
  if (text.includes('明天') || text.includes('明晚')) return { date: addDays(today, 1), matched: '明天' };
  if (text.includes('今天') || text.includes('今晚')) return { date: today, matched: '今天' };
  if (text.includes('昨天')) return { date: addDays(today, -1), matched: '昨天' };
  if ((m = text.match(/(本|这|下)?\s*周\s*([一二三四五六日天])/))) {
    const target = WEEK_CN[m[2]];
    const cur = base.getDay();
    let diff = (target - cur + 7) % 7;
    if (diff === 0) diff = 7;
    if (m[1] === '下' && target > cur) diff += 7;
    return { date: addDays(today, diff), matched: m[0] };
  }
  return null;
}

function extractTime(text) {
  let m = text.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上)?\s*(\d{1,2})\s*[点时:：]\s*(\d{2})?/);
  if (!m) return null;
  let h = parseInt(m[2], 10);
  const min = m[3] ? parseInt(m[3], 10) : 0;
  const ap = m[1] || '';
  if ((ap === '下午' || ap === '傍晚' || ap === '晚上') && h < 12) h += 12;
  if (h > 23 || min > 59) return null;
  return { time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`, matched: m[0] };
}

function parseTaskText(raw) {
  const segments = String(raw).split(/[\n;；]+/).map(s => s.trim()).filter(Boolean);
  const tasks = [];
  for (const seg of segments) {
    let text = seg;
    let date = null;
    let time = null;
    const d = extractDate(text);
    if (d) { date = d.date; text = text.replace(d.matched, ' '); }
    const t = extractTime(text);
    if (t) { time = t.time; text = text.replace(t.matched, ' '); }
    let title = text.replace(/[，,。！!？?\s]+/g, ' ').trim();
    if (!title || /^(我)?(要|想).{0,8}(干什么|做什么|啥|任务)$/.test(title)) title = '新任务';

    const dm = title.match(/(\d+)\s*天/);
    if (dm && date) {
      const n = Math.min(parseInt(dm[1], 10) || 1, 14);
      const baseTitle = title.replace(dm[0], ' ').trim() || '任务';
      for (let i = 0; i < n; i++) {
        tasks.push({ title: `${baseTitle}（第${i + 1}/${n}天）`, date: addDays(date, i), time: i === 0 ? time : null });
      }
    } else {
      tasks.push({ title, date: date || fmt(new Date()), time });
    }
  }
  return { tasks, reply: `已解析 ${tasks.length} 个任务` };
}

module.exports = { fmt, addDays, extractDate, extractTime, parseTaskText };
