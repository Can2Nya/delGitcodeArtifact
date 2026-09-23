const els = {
  baseUrl: document.getElementById('baseUrl'),
  owner: document.getElementById('owner'),
  repo: document.getElementById('repo'),
  accessToken: document.getElementById('accessToken'),
  runId: document.getElementById('runId'),
  btnQuery: document.getElementById('btnQuery'),
  btnSelectAll: document.getElementById('btnSelectAll'),
  btnInvert: document.getElementById('btnInvert'),
  btnDelete: document.getElementById('btnDelete'),
  checkHeader: document.getElementById('checkHeader'),
  artifactBody: document.getElementById('artifactBody'),
  summary: document.getElementById('summary'),
  statusBar: document.getElementById('statusBar')
};

let artifacts = [];

function readConfig() {
  return {
    baseUrl: els.baseUrl.value.trim(),
    owner: els.owner.value.trim(),
    repo: els.repo.value.trim(),
    accessToken: els.accessToken.value.trim()
  };
}

function persistConfig() {
  window.api.saveConfig(readConfig()).catch(() => {});
}

function setStatus(text, type = '') {
  els.statusBar.textContent = text;
  els.statusBar.className = 'status-bar' + (type ? ' ' + type : '');
}

function formatBytes(bytes) {
  if (bytes == null) return '-';
  const n = Number(bytes);
  if (isNaN(n) || n < 0) return '-';
  if (n < 1024) return n + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return v.toFixed(v >= 100 ? 0 : 1) + ' ' + units[i];
}

function formatTime(v) {
  if (!v) return '-';
  let d;
  if (typeof v === 'string' && /^\d{10,13}$/.test(v)) {
    d = new Date(Number(v));
  } else {
    d = new Date(v);
  }
  if (isNaN(d.getTime()) || d.getTime() === 0) return '-';
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function updateSummary() {
  const selected = artifacts.filter((a) => a._selected);
  els.summary.textContent = artifacts.length
    ? `共 ${artifacts.length} 个 Artifact，已选中 ${selected.length} 个`
    : '尚无 Artifact';
  els.btnDelete.disabled = selected.length === 0;
}

function renderTable() {
  els.artifactBody.innerHTML = '';
  if (!artifacts.length) {
    els.artifactBody.innerHTML = '<tr class="empty-row"><td colspan="8">未查询到 Artifact</td></tr>';
  }
  artifacts.forEach((a) => {
    const tr = document.createElement('tr');
    if (a._selected) tr.classList.add('selected');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!a._selected;
    cb.addEventListener('change', () => {
      a._selected = cb.checked;
      tr.classList.toggle('selected', a._selected);
      updateSummary();
    });

    const tdCheck = document.createElement('td');
    tdCheck.className = 'col-check';
    tdCheck.appendChild(cb);

    const tdId = document.createElement('td');
    tdId.className = 'col-id';
    tdId.textContent = a.id;
    tdId.title = a.id;

    const tdName = document.createElement('td');
    tdName.textContent = a.name || '-';
    tdName.title = a.name || '';

    const tdSize = document.createElement('td');
    tdSize.className = 'col-size';
    tdSize.textContent = formatBytes(a.size_bytes);

    const tdRun = document.createElement('td');
    tdRun.className = 'col-run';
    tdRun.textContent = a.workflow_run_id || '-';
    tdRun.title = a.workflow_run_id || '';

    const tdCreated = document.createElement('td');
    tdCreated.className = 'col-time';
    tdCreated.textContent = formatTime(a.created_at);

    const tdExpires = document.createElement('td');
    tdExpires.className = 'col-time';
    tdExpires.textContent = formatTime(a.expires_at);

    const tdOp = document.createElement('td');
    tdOp.className = 'col-op';
    const delBtn = document.createElement('button');
    delBtn.className = 'row-del';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => deleteArtifacts([a]));
    tdOp.appendChild(delBtn);

    tr.append(tdCheck, tdId, tdName, tdSize, tdRun, tdCreated, tdExpires, tdOp);
    els.artifactBody.appendChild(tr);
  });
  els.checkHeader.checked = artifacts.length > 0 && artifacts.every((a) => a._selected);
  updateSummary();
}

async function query() {
  const config = readConfig();
  const runId = els.runId.value.trim();
  persistConfig();
  setStatus(runId ? `正在查询流水线 ${runId} 的 Artifacts...` : '正在查询全部 Artifacts...', 'loading');
  els.btnQuery.disabled = true;
  try {
    const res = await window.api.listArtifacts(config, runId);
    if (!res.ok) {
      setStatus('查询失败: ' + res.error, 'err');
      return;
    }
    const list = Array.isArray(res.data.artifacts) ? res.data.artifacts : [];
    artifacts = list.map((a) => ({ ...a, _selected: false }));
    renderTable();
    setStatus(`查询成功，共 ${res.data.total_count ?? artifacts.length} 个 Artifact`, 'ok');
  } catch (err) {
    setStatus('查询异常: ' + err.message, 'err');
  } finally {
    els.btnQuery.disabled = false;
  }
}

async function deleteArtifacts(targets) {
  const config = readConfig();
  const list = targets.length ? targets : artifacts.filter((a) => a._selected);
  if (!list.length) return;
  const names = list.map((a) => a.name || a.id).join('\n');
  const ok = window.confirm(`确定删除以下 ${list.length} 个 Artifact 吗？\n\n${names}`);
  if (!ok) return;

  let okCount = 0;
  let failMsgs = [];
  setStatus(`正在删除... 0/${list.length}`, 'loading');
  els.btnDelete.disabled = true;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const res = await window.api.deleteArtifact(config, a.id);
    if (res.ok) {
      okCount++;
      const idx = artifacts.indexOf(a);
      if (idx >= 0) artifacts.splice(idx, 1);
    } else {
      failMsgs.push(`${a.name || a.id}: ${res.error || res.status}`);
    }
    setStatus(`正在删除... ${i + 1}/${list.length}`, 'loading');
  }

  if (failMsgs.length) {
    window.alert('部分删除失败:\n' + failMsgs.join('\n'));
  }
  renderTable();
  setStatus(failMsgs.length
    ? `删除完成: 成功 ${okCount} 个，失败 ${failMsgs.length} 个`
    : `删除成功，共 ${okCount} 个 Artifact`, okCount ? 'ok' : 'err');
}

function toggleAll() {
  const check = els.checkHeader.checked;
  artifacts.forEach((a) => (a._selected = check));
  renderTable();
}

function invertAll() {
  artifacts.forEach((a) => (a._selected = !a._selected));
  renderTable();
}

els.btnQuery.addEventListener('click', query);
els.runId.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') query();
});
els.checkHeader.addEventListener('change', toggleAll);
els.btnSelectAll.addEventListener('click', () => {
  els.checkHeader.checked = true;
  toggleAll();
});
els.btnInvert.addEventListener('click', invertAll);
els.btnDelete.addEventListener('click', () => deleteArtifacts([]));

[
  els.baseUrl,
  els.owner,
  els.repo,
  els.accessToken
].forEach((el) => el.addEventListener('change', persistConfig));

(async () => {
  const cfg = await window.api.getConfig();
  if (cfg) {
    if (cfg.baseUrl) els.baseUrl.value = cfg.baseUrl;
    if (cfg.owner) els.owner.value = cfg.owner;
    if (cfg.repo) els.repo.value = cfg.repo;
    if (cfg.accessToken) els.accessToken.value = cfg.accessToken;
  }
})();
