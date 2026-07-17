/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("printxDesktop", {
  getVersion: () => ipcRenderer.invoke("printx:get-version"),
  getUserDataPath: () => ipcRenderer.invoke("printx:get-user-data-path"),
  selectFolder: () => ipcRenderer.invoke("printx:select-folder"),
  openPath: (value) => ipcRenderer.invoke("printx:open-path", value),
  showItemInFolder: (value) => ipcRenderer.invoke("printx:show-item-in-folder", value),
  openLogsFolder: () => ipcRenderer.invoke("printx:open-logs"),
  restart: () => ipcRenderer.invoke("printx:restart"),
});
