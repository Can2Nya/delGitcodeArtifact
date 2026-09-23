const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listArtifacts: (config, runId) => ipcRenderer.invoke('api:listArtifacts', config, runId),
  deleteArtifact: (config, artifactId) => ipcRenderer.invoke('api:deleteArtifact', config, artifactId),
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config)
});
