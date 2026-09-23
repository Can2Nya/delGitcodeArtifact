const { app, BrowserWindow, ipcMain, safeStorage, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const configFile = () => path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configFile(), 'utf-8'));
    let accessToken = '';
    if (raw.accessTokenEnc && safeStorage.isEncryptionAvailable()) {
      try {
        accessToken = safeStorage.decryptString(Buffer.from(raw.accessTokenEnc, 'base64'));
      } catch {
        accessToken = raw.accessToken || '';
      }
    } else {
      accessToken = raw.accessToken || '';
    }
    return {
      baseUrl: raw.baseUrl || '',
      owner: raw.owner || '',
      repo: raw.repo || '',
      accessToken
    };
  } catch {
    return null;
  }
}

function writeConfig(config) {
  const out = {
    baseUrl: config.baseUrl || '',
    owner: config.owner || '',
    repo: config.repo || ''
  };
  if (config.accessToken) {
    if (safeStorage.isEncryptionAvailable()) {
      try {
        out.accessTokenEnc = safeStorage.encryptString(config.accessToken).toString('base64');
      } catch {
        out.accessToken = config.accessToken;
      }
    } else {
      out.accessToken = config.accessToken;
    }
  }
  fs.writeFileSync(configFile(), JSON.stringify(out, null, 2));
}

const DEFAULT_CONFIG = {
  baseUrl: 'https://api.atomgit.com',
  owner: 'BitFun-Platform',
  repo: 'bitfun_build',
  accessToken: ''
};

function loadSeedToken() {
  if (process.env.GITCODE_ACCESS_TOKEN) return process.env.GITCODE_ACCESS_TOKEN;
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const line = fs.readFileSync(envPath, 'utf-8')
        .split(/\r?\n/)
        .find((l) => l.startsWith('GITCODE_ACCESS_TOKEN='));
      if (line) {
        return line.slice('GITCODE_ACCESS_TOKEN='.length).trim().replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    /* ignore */
  }
  return '';
}

function seedDefaultConfig() {
  if (!fs.existsSync(configFile())) {
    writeConfig({ ...DEFAULT_CONFIG, accessToken: loadSeedToken() });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    title: 'GitCode Artifact 清理工具',
    autoHideMenuBar: true,
    icon: nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
}

async function request(config, method, urlPath) {
  const base = (config.baseUrl || 'https://api.atomgit.com').replace(/\/+$/, '');
  const sep = urlPath.includes('?') ? '&' : '?';
  let url = `${base}${urlPath}${sep}access_token=${encodeURIComponent(config.accessToken || '')}`;

  for (let i = 0; i < 10; i++) {
    const res = await fetch(url, {
      method,
      headers: { Accept: 'application/json' },
      redirect: 'manual'
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url).toString();
      continue;
    }
    return res;
  }
  throw new Error('重定向次数过多');
}

async function handleList(config, runId) {
  const owner = encodeURIComponent(config.owner || '');
  const repo = encodeURIComponent(config.repo || '');
  let urlPath;
  if (runId) {
    urlPath = `/api/v8/repos/${owner}/${repo}/actions/runs/${encodeURIComponent(runId)}/artifacts`;
  } else {
    urlPath = `/api/v8/repos/${owner}/${repo}/actions/artifacts`;
  }
  const res = await request(config, 'GET', urlPath);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(typeof data === 'string' ? `HTTP ${res.status}: ${data}` : `HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function handleDelete(config, artifactId) {
  const owner = encodeURIComponent(config.owner || '');
  const repo = encodeURIComponent(config.repo || '');
  const res = await request(config, 'DELETE', `/api/v8/repos/${owner}/${repo}/actions/artifacts/${encodeURIComponent(artifactId)}`);
  if (res.ok || res.status === 204) {
    return { ok: true };
  }
  const text = await res.text();
  return { ok: false, status: res.status, error: text || res.statusText };
}

ipcMain.handle('api:listArtifacts', async (_e, config, runId) => {
  try {
    const data = await handleList(config, runId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('api:deleteArtifact', async (_e, config, artifactId) => {
  try {
    return await handleDelete(config, artifactId);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('config:get', async () => readConfig());
ipcMain.handle('config:save', async (_e, config) => {
  writeConfig(config);
  return { ok: true };
});

app.whenReady().then(() => {
  seedDefaultConfig();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
