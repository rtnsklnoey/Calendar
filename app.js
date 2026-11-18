/* Project Timeline Calendar — static app, data stored in localStorage. */
(function () {
  'use strict';

  const STORE_KEY = 'ptc.data.v1';
  const VIEW_KEY = 'ptc.view.v1';
  const PHASES = ['Plan', 'Develop', 'Update', 'Test', 'Launch'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const FONT = '"Noto Sans Thai", "Sarabun", system-ui, sans-serif';

  // Layout constants (px)
  const MONTH_W = 150;
  const LANE_H = 42;
  const ROW_PAD = 10;
  const MIN_ROW_H = 90;
  const FLAG_LEVEL_H = 52;
  const MONTHS_H = 40;

  // ---------- State ----------
  let data = loadData();
  let view = loadView();

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.projects) && Array.isArray(d.items)) return d;
      }
    } catch (e) { /* ignore */ }
    return sampleData();
  }
  function saveData() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }
  function loadView() {
    try {
      const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
      if (v && /^\d{4}-\d{2}$/.test(v.start) && v.months > 0) return v;
    } catch (e) { /* ignore */ }
    return defaultView();
  }
  function saveView() {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (e) { /* ignore */ }
  }
  function defaultView() {
    const t = new Date();
    const s = new Date(t.getFullYear(), t.getMonth() - 4, 1);
    return { start: ymKey(s), months: 8 };
  }

  // ---------- Date helpers ----------
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d || 1);
  }
  function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function shortDate(d) { return MONTHS[d.getMonth()] + ' ' + d.getDate(); }
  function rangeLabel(s, e) {
    if (isoDate(s) === isoDate(e)) return shortDate(s);
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
      return shortDate(s) + '-' + e.getDate();
    }
    return shortDate(s) + ' - ' + shortDate(e);
  }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

  // ---------- Colour helpers ----------
  function textColorFor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#fff';
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.62 ? '#1f2937' : '#ffffff';
  }

  // ---------- Text measuring ----------
  const measureCtx = document.createElement('canvas').getContext('2d');
  function textW(text, size, weight) {
    measureCtx.font = (weight || 400) + ' ' + size + 'px ' + FONT;
    return measureCtx.measureText(text).width;
  }

  // ---------- DOM helper ----------
  function el(tag, cls, style, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (style) Object.assign(e.style, style);
    if (text != null) e.textContent = text;
    return e;
  }
  const px = (n) => n + 'px';

  // ---------- Render ----------
  const chart = document.getElementById('chart');
  const legend = document.getElementById('legend');
  const labelW = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--label-w'), 10) || 104;

  function render() {
    renderChart();
    renderLegend();
    syncToolbar();
  }

  function projectById(id) { return data.projects.find((p) => p.id === id); }

  function renderChart() {
    chart.textContent = '';
    const LW = labelW();
    const vs = parseDate(view.start + '-01');
    const nMonths = view.months;
    const months = [];
    for (let i = 0; i < nMonths; i++) {
      const d = new Date(vs.getFullYear(), vs.getMonth() + i, 1);
      months.push({ y: d.getFullYear(), m: d.getMonth() });
    }
    const viewEnd = new Date(vs.getFullYear(), vs.getMonth() + nMonths, 1);
    const totalW = LW + nMonths * MONTH_W + 20;

    // date -> x (clamped to view)
    function xOf(d) {
      if (d < vs) return LW;
      if (d >= viewEnd) return LW + nMonths * MONTH_W;
      const idx = (d.getFullYear() - vs.getFullYear()) * 12 + d.getMonth() - vs.getMonth();
      const frac = (d.getDate() - 1) / daysIn(d.getFullYear(), d.getMonth());
      return LW + (idx + frac) * MONTH_W;
    }

    // ---- Flags (project start dates) ----
    const flagProjects = data.projects
      .filter((p) => p.start)
      .map((p) => ({ p, d: parseDate(p.start) }))
      .filter((f) => f.d >= vs && f.d < viewEnd)
      .sort((a, b) => a.d - b.d);
    const levelRight = [];
    flagProjects.forEach((f) => {
      f.x = xOf(f.d);
      const w = 30 + Math.max(textW(f.p.name, 17, 700), textW('Start ' + shortDate(f.d), 14)) + 14;
      let lvl = 0;
      while (levelRight[lvl] != null && levelRight[lvl] > f.x) lvl++;
      levelRight[lvl] = f.x + w;
      f.level = lvl;
    });
    const nLevels = Math.max(1, levelRight.length);
    const yearRowH = 30;
    const flagsH = nLevels * FLAG_LEVEL_H + 12;
    const monthsTop = Math.max(flagsH, yearRowH + 10);

    // ---- Phase rows: lane packing ----
    const rows = PHASES.map((phase) => {
      const its = data.items
        .filter((it) => it.phase === phase && projectById(it.projectId))
        .map((it) => ({ it, s: parseDate(it.start), e: parseDate(it.end) }))
        .filter((o) => o.e >= vs && o.s < viewEnd)
        .sort((a, b) => a.s - b.s || b.e - a.e);
      const lanes = [];
      its.forEach((o) => {
        o.x = xOf(o.s);
        o.w = Math.max(xOf(addDays(o.e, 1)) - o.x, 18);
        o.dateLabel = rangeLabel(o.s, o.e);
        const extent = Math.max(o.w, textW(o.it.label, 13.5) + 14, textW(o.dateLabel, 12) + 4);
        let lane = 0;
        while (lanes[lane] != null && lanes[lane] > o.x - 2) lane++;
        lanes[lane] = o.x + extent + 4;
        o.lane = lane;
      });
      const h = Math.max(MIN_ROW_H, lanes.length * LANE_H + ROW_PAD * 2);
      return { phase, its, h };
    });

    const rowsTop = monthsTop + MONTHS_H + 4;
    const rowsH = rows.reduce((s, r) => s + r.h, 0);
    const totalH = rowsTop + rowsH + 4;
    chart.style.width = px(totalW);
    chart.style.height = px(totalH);

    // Month bar
    const bar = el('div', 'months', { left: px(LW - 10), top: px(monthsTop), width: px(nMonths * MONTH_W + 20) });
    months.forEach((mo, i) => {
      bar.appendChild(el('div', 'month-label', { left: px(10 + i * MONTH_W), width: px(MONTH_W) }, MONTHS[mo.m]));
    });
    chart.appendChild(bar);

    // Rows
    let y = rowsTop;
    rows.forEach((r) => {
      const row = el('div', 'phase-row', { top: px(y), width: px(totalW - 20), height: px(r.h) });
      const area = el('div', 'phase-area', { left: px(LW), width: px(nMonths * MONTH_W) });
      // shade alternate months for readability
      months.forEach((mo, i) => {
        if (i % 2 === 1) area.appendChild(el('div', 'month-shade', { left: px(i * MONTH_W), width: px(MONTH_W) }));
      });
      r.its.forEach((o) => {
        const p = projectById(o.it.projectId);
        const item = el('div', 'item', { left: px(o.x - LW), top: px(ROW_PAD + o.lane * LANE_H) });
        item.title = p.name + ' · ' + o.it.label + ' (' + o.dateLabel + ')';
        item.appendChild(el('div', 'item-date', null, o.dateLabel));
        const b = el('div', 'item-bar', {
          background: p.color, color: textColorFor(p.color),
          minWidth: px(o.w), width: px(Math.max(o.w, textW(o.it.label, 13.5) + 14)),
        }, o.it.label);
        item.appendChild(b);
        item.addEventListener('click', () => openItemDialog(o.it));
        area.appendChild(item);
      });
      row.appendChild(area);
      row.appendChild(el('div', 'phase-label', { height: px(r.h) }, r.phase));
      chart.appendChild(row);
      y += r.h;
    });

    if (!data.projects.length) {
      chart.appendChild(el('div', 'empty-state', { top: px(rowsTop + 30) }, 'ยังไม่มีโปรเจ็ค — กด “+ เพิ่มโปรเจ็ค” เพื่อเริ่มต้น'));
    }

    // Year dividers (Jan 1 inside the range, not the first month)
    months.forEach((mo, i) => {
      if (mo.m !== 0 || i === 0) return;
      const x = LW + i * MONTH_W;
      chart.appendChild(el('div', 'vline', { left: px(x - 1), top: px(monthsTop - yearRowH), height: px(totalH - monthsTop + yearRowH) }));
      const prev = el('div', 'year-label', { top: px(monthsTop - yearRowH + 2), left: px(x - 50) }, String(mo.y - 1));
      chart.appendChild(prev);
      chart.appendChild(el('div', 'year-label', { top: px(monthsTop - yearRowH + 2), left: px(x + 8) }, String(mo.y)));
    });

    // Flags
    flagProjects.forEach((f) => {
      const top = monthsTop - 8 - (f.level + 1) * FLAG_LEVEL_H + 14;
      // lower flags sit above higher ones so their text covers poles passing behind
      const flag = el('div', 'flag', { left: px(f.x), top: px(top), zIndex: String(10 + nLevels - f.level) });
      flag.appendChild(el('div', 'flag-pole', { left: '0', top: '0', height: px(monthsTop - top), background: f.p.color }));
      flag.appendChild(el('div', 'flag-head', { background: f.p.color }));
      const txt = el('div', 'flag-text');
      txt.appendChild(el('div', 'flag-name', null, f.p.name));
      txt.appendChild(el('div', 'flag-date', null, 'Start ' + shortDate(f.d)));
      flag.appendChild(txt);
      flag.title = 'แก้ไขโปรเจ็ค ' + f.p.name;
      flag.addEventListener('click', () => openProjectDialog(f.p));
      chart.appendChild(flag);
    });

    // Today marker
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (today >= vs && today < viewEnd) {
      const x = xOf(today);
      chart.appendChild(el('div', 'vline today', { left: px(x - 1), top: px(monthsTop), height: px(totalH - monthsTop) }));
      chart.appendChild(el('div', 'today-badge', { left: px(x), top: px(monthsTop + 5) }, shortDate(today)));
    }
  }

  function renderLegend() {
    legend.textContent = '';
    const cols = [
      ['Project', (p) => p.name, true],
      ['SE', (p) => (p.se || []).join(' ')],
      ['BA', (p) => (p.ba || []).join(' ')],
      ['PM', (p) => (p.pm || []).join(' ')],
      ['In Progress', (p) => p.progress || ''],
      ['Task', (p) => p.task || ''],
    ];
    const projects = [...data.projects].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    cols.forEach(([title, get, isProj]) => {
      const col = el('div');
      col.appendChild(el('h3', null, null, title));
      const ul = el('ul');
      projects.forEach((p) => {
        const v = get(p);
        const li = el('li', isProj ? 'proj' : '', { '--bullet': p.color }, v || '-');
        li.style.setProperty('--bullet', p.color);
        if (!v) li.classList.add('dim');
        if (isProj) li.addEventListener('click', () => openProjectDialog(p));
        ul.appendChild(li);
      });
      col.appendChild(ul);
      legend.appendChild(col);
    });
  }

  // ---------- Toolbar ----------
  const rangeStart = document.getElementById('range-start');
  const rangeMonths = document.getElementById('range-months');
  function syncToolbar() {
    rangeStart.value = view.start;
    rangeMonths.value = String(view.months);
  }
  rangeStart.addEventListener('change', () => {
    if (/^\d{4}-\d{2}$/.test(rangeStart.value)) { view.start = rangeStart.value; saveView(); render(); }
  });
  rangeMonths.addEventListener('change', () => { view.months = Number(rangeMonths.value); saveView(); render(); });
  document.getElementById('btn-today').addEventListener('click', () => {
    view = Object.assign(defaultView(), { months: view.months });
    saveView(); render();
  });
  document.getElementById('btn-add-project').addEventListener('click', () => openProjectDialog(null));
  document.getElementById('btn-add-item').addEventListener('click', () => {
    if (!data.projects.length) { alert('กรุณาเพิ่มโปรเจ็คก่อน'); openProjectDialog(null); return; }
    openItemDialog(null);
  });
  document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'project-timeline-' + isoDate(new Date()) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  document.getElementById('file-import').addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    f.text().then((txt) => {
      const d = JSON.parse(txt);
      if (!d || !Array.isArray(d.projects) || !Array.isArray(d.items)) throw new Error('bad');
      if (!confirm('นำเข้าข้อมูลนี้แทนที่ข้อมูลปัจจุบันทั้งหมด?')) return;
      data = d; saveData(); render();
    }).catch(() => alert('ไฟล์ไม่ถูกต้อง')).finally(() => { ev.target.value = ''; });
  });

  // ---------- Dialogs ----------
  const dlgProject = document.getElementById('dlg-project');
  const formProject = document.getElementById('form-project');
  const dlgItem = document.getElementById('dlg-item');
  const formItem = document.getElementById('form-item');
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

  const splitList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const PALETTE = ['#4a7ab5', '#3d7a3a', '#e08a4c', '#e53e3e', '#ed64a6', '#1a1aa8', '#7b68c4', '#f6d55c', '#38a3a5', '#8d6e63'];

  function openProjectDialog(p) {
    formProject.reset();
    const f = formProject.elements;
    document.getElementById('dlg-project-title').textContent = p ? 'แก้ไขโปรเจ็ค' : 'เพิ่มโปรเจ็ค';
    document.getElementById('btn-delete-project').hidden = !p;
    f.id.value = p ? p.id : '';
    f.name.value = p ? p.name : '';
    f.color.value = p ? p.color : PALETTE[data.projects.length % PALETTE.length];
    f.start.value = p ? p.start : isoDate(new Date());
    f.se.value = p ? (p.se || []).join(', ') : '';
    f.ba.value = p ? (p.ba || []).join(', ') : '';
    f.pm.value = p ? (p.pm || []).join(', ') : '';
    f.progress.value = p ? p.progress || '' : '';
    f.task.value = p ? p.task || '' : '';
    dlgProject.showModal();
  }

  formProject.addEventListener('submit', () => {
    const f = formProject.elements;
    const obj = {
      id: f.id.value || uid(),
      name: f.name.value.trim(),
      color: f.color.value,
      start: f.start.value,
      se: splitList(f.se.value),
      ba: splitList(f.ba.value),
      pm: splitList(f.pm.value),
      progress: f.progress.value.trim(),
      task: f.task.value.trim(),
    };
    const i = data.projects.findIndex((p) => p.id === obj.id);
    if (i >= 0) data.projects[i] = obj; else data.projects.push(obj);
    saveData(); render();
  });

  document.getElementById('btn-delete-project').addEventListener('click', () => {
    const id = formProject.elements.id.value;
    const p = projectById(id);
    if (!p) return;
    const n = data.items.filter((it) => it.projectId === id).length;
    if (!confirm('ลบโปรเจ็ค "' + p.name + '"' + (n ? ' และไทม์ไลน์ ' + n + ' รายการ' : '') + '?')) return;
    data.projects = data.projects.filter((x) => x.id !== id);
    data.items = data.items.filter((it) => it.projectId !== id);
    saveData(); dlgProject.close(); render();
  });

  function openItemDialog(it) {
    formItem.reset();
    const f = formItem.elements;
    document.getElementById('item-error').textContent = '';
    document.getElementById('dlg-item-title').textContent = it ? 'แก้ไขไทม์ไลน์' : 'เพิ่มไทม์ไลน์';
    document.getElementById('btn-delete-item').hidden = !it;
    f.projectId.textContent = '';
    data.projects.forEach((p) => {
      const o = el('option', null, null, p.name);
      o.value = p.id;
      f.projectId.appendChild(o);
    });
    const today = isoDate(new Date());
    f.id.value = it ? it.id : '';
    f.projectId.value = it ? it.projectId : data.projects[data.projects.length - 1].id;
    f.phase.value = it ? it.phase : 'Plan';
    f.label.value = it ? it.label : '';
    f.start.value = it ? it.start : today;
    f.end.value = it ? it.end : today;
    dlgItem.showModal();
  }

  formItem.addEventListener('submit', (ev) => {
    const f = formItem.elements;
    if (f.end.value < f.start.value) {
      ev.preventDefault();
      document.getElementById('item-error').textContent = 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม';
      return;
    }
    const obj = {
      id: f.id.value || uid(),
      projectId: f.projectId.value,
      phase: f.phase.value,
      label: f.label.value.trim(),
      start: f.start.value,
      end: f.end.value,
    };
    const i = data.items.findIndex((x) => x.id === obj.id);
    if (i >= 0) data.items[i] = obj; else data.items.push(obj);
    saveData(); render();
  });

  document.getElementById('btn-delete-item').addEventListener('click', () => {
    const id = formItem.elements.id.value;
    if (!confirm('ลบรายการนี้?')) return;
    data.items = data.items.filter((x) => x.id !== id);
    saveData(); dlgItem.close(); render();
  });

  // ---------- Sample data (shown on first visit) ----------
  function sampleData() {
    const t = new Date();
    const base = new Date(t.getFullYear(), t.getMonth() - 3, 1);
    const d = (mo, day) => isoDate(new Date(base.getFullYear(), base.getMonth() + mo, day));
    const P = [
      { id: 'p1', name: 'ก่อสร้าง', color: '#4a7ab5', start: d(0, 20), se: ['Tar'], ba: ['Noey'], pm: ['Peat EN'], progress: 'Dev', task: 'JetX' },
      { id: 'p2', name: 'แจ้งซ่อม & PM', color: '#3d7a3a', start: d(1, 2), se: ['Mic'], ba: ['Noey'], pm: ['Fluke EN'], progress: 'Dev', task: 'JetX' },
      { id: 'p3', name: 'DRT x mini web', color: '#e08a4c', start: d(1, 18), se: ['Tar', 'Mic'], ba: ['Noey'], pm: ['Pea BD'], progress: 'Dev', task: 'API specification' },
      { id: 'p4', name: 'Backend', color: '#e53e3e', start: d(2, 1), se: ['Tar', 'Mic'], ba: ['Noey'], pm: ['Pea BD'], progress: 'preparing start Backend', task: '' },
      { id: 'p5', name: 'Workshop', color: '#ed64a6', start: d(2, 3), se: ['Tar', 'Mic'], ba: ['Noey'], pm: ['Noey'], progress: 'create content', task: 'PoC' },
      { id: 'p6', name: 'API', color: '#1a1aa8', start: d(2, 12), se: ['Mark'], ba: ['Noey'], pm: ['Pea BD'], progress: 'waiting for API', task: 'Requirement' },
      { id: 'p7', name: 'MKT x นกเหลือง', color: '#f6d55c', start: d(3, 5), se: ['Tar', 'Mic'], ba: ['Noey'], pm: ['Bright MKT'], progress: 'preparing start', task: '' },
    ];
    const I = [
      ['p1', 'Plan', 'requirement', d(0, 20), d(1, 10)],
      ['p1', 'Develop', 'Dev V1', d(1, 1), d(1, 15)],
      ['p1', 'Update', 'meeting 1', d(1, 5), d(1, 20)],
      ['p1', 'Test', 'Test 1', d(1, 24), d(2, 5)],
      ['p1', 'Launch', 'on Prod', d(3, 1), d(3, 15)],
      ['p2', 'Plan', 'requirement', d(1, 2), d(1, 22)],
      ['p2', 'Develop', 'Dev V1', d(1, 21), d(2, 12)],
      ['p2', 'Update', 'meeting 1', d(1, 29), d(2, 15)],
      ['p2', 'Test', 'Test 2', d(2, 8), d(2, 20)],
      ['p2', 'Launch', 'on Prod', d(3, 1), d(3, 18)],
      ['p3', 'Plan', 'requirement', d(1, 18), d(2, 25)],
      ['p3', 'Develop', 'Dev 1', d(2, 12), d(3, 10)],
      ['p4', 'Plan', 'setting domain', d(2, 1), d(2, 18)],
      ['p4', 'Develop', 'API Backend', d(3, 16), d(4, 5)],
      ['p5', 'Plan', 'Content planning', d(2, 3), d(2, 25)],
      ['p5', 'Develop', 'create content', d(2, 20), d(3, 15)],
      ['p6', 'Plan', 'Study system & waiting for API', d(2, 12), d(3, 20)],
      ['p7', 'Plan', 'requirement', d(3, 5), d(4, 10)],
      ['p7', 'Develop', 'Dev 1', d(4, 1), d(4, 20)],
    ].map(([projectId, phase, label, start, end], i) => ({ id: 'i' + i, projectId, phase, label, start, end }));
    return { projects: P, items: I };
  }

  // Re-render once web fonts are ready so text measurements are accurate.
  render();
  // Scroll so that today is visible on first load
  (function () {
    const sc = document.getElementById('chart-scroll');
    const badge = chart.querySelector('.today-badge');
    if (badge && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = Math.max(0, badge.offsetLeft - sc.clientWidth / 2);
  })();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 150); });
})();
