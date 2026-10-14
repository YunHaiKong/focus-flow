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

function daysDiff(d1, d2) {
  if (!d1 || !d2) return 0;
  const dt1 = new Date(d1 + 'T00:00:00');
  const dt2 = new Date(d2 + 'T00:00:00');
  const diffTime = dt2.getTime() - dt1.getTime();
  return Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)));
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
  if (text.includes('大大后天') || text.includes('大大後天')) return { date: addDays(today, 4), matched: text.includes('大大后天') ? '大大后天' : '大大後天' };
  if (text.includes('大后天') || text.includes('大後天')) return { date: addDays(today, 3), matched: text.includes('大后天') ? '大后天' : '大後天' };
  if (text.includes('后天') || text.includes('後天')) return { date: addDays(today, 2), matched: text.includes('后天') ? '后天' : '後天' };
  
  if ((m = text.match(/(明晚|明早|明天|次日)/))) {
    return { date: addDays(today, 1), matched: m[0], modifier: m[0].includes('晚') ? '晚上' : (m[0].includes('早') ? '早上' : null) };
  }
  if ((m = text.match(/(今晚|今早|今天|今日|当日)/))) {
    return { date: today, matched: m[0], modifier: m[0].includes('晚') ? '晚上' : (m[0].includes('早') ? '早上' : null) };
  }
  if ((m = text.match(/(昨晚|昨早|昨天|昨日)/))) {
    return { date: addDays(today, -1), matched: m[0], modifier: m[0].includes('晚') ? '晚上' : (m[0].includes('早') ? '早上' : null) };
  }

  if ((m = text.match(/(本|这|下下|下个|下)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/))) {
    const target = WEEK_CN[m[2]];
    const cur = base.getDay();
    const prefix = m[1] || '';
    let diff = (target - cur + 7) % 7;
    if (prefix === '本' || prefix === '这') {
      if (diff === 0 && target !== cur) diff = 7;
    } else if (prefix === '下下') {
      diff = (diff === 0 ? 7 : diff) + 7;
    } else if (prefix === '下' || prefix === '下个') {
      if (target > cur) {
        diff += 7;
      } else if (target === cur) {
        diff = 7;
      }
    } else {
      if (diff === 0) diff = 7;
    }
    return { date: addDays(today, diff), matched: m[0] };
  }
  return null;
}

function extractTime(text, defaultModifier) {
  let m = text.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上|早|晚)?\s*(\d{1,2})\s*(?:点半|[点时:：]\s*(\d{2})?)/);
  if (!m) {
    if (defaultModifier) {
      let m2 = text.match(/(\d{1,2})\s*(?:点半|[点时:：]\s*(\d{2})?)/);
      if (m2) {
        m = [m2[0], defaultModifier, m2[1], m2[2]];
      }
    }
    if (!m) return null;
  }
  let h = parseInt(m[2], 10);
  let min = 0;
  if (m[0].includes('点半')) {
    min = 30;
  } else if (m[3]) {
    min = parseInt(m[3], 10);
  }
  const ap = m[1] || defaultModifier || '';
  if ((ap === '下午' || ap === '傍晚' || ap === '晚上' || ap === '晚') && h < 12) h += 12;
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
    let modifier = null;
    const d = extractDate(text);
    if (d) {
      date = d.date;
      modifier = d.modifier;
      text = text.replace(d.matched, ' ');
    }
    const t = extractTime(text, modifier);
    if (t) {
      time = t.time;
      text = text.replace(t.matched, ' ');
    }
    let title = text.replace(/[，,。！!？?\s]+/g, ' ').trim();
    // strip leftover schedule keywords so titles stay clean
    title = title.replace(/(?:^|\s)(?:从|于|自)?(?:今天|明天|后天|当天)(?:起|开始)?(?:$|\s)/g, ' ');
    title = title.replace(/(?:^|\s)(?:从|自)?开始(?:起)?(?:$|\s)/g, ' ').replace(/\s+/g, ' ').trim();
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

module.exports = { fmt, addDays, daysDiff, extractDate, extractTime, parseTaskText };
