const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('PandyBridge', {
    sendEvent: (type, data) => {
        ipcRenderer.send('tiktok-event', { type, data });
    }
});
