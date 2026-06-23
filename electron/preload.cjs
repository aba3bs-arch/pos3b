const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('posDesktop', {
  plataforma: process.platform,
  esElectron: true,
});
