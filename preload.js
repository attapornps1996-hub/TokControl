const { contextBridge, ipcRenderer } = require('electron');

function wrapIpcListener(listener) {
    return (_event, ...args) => listener({}, ...args);
}

const electronBridge = {
    ipcRenderer: {
        send: (channel, ...args) => ipcRenderer.send(channel, ...args),
        invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
        on: (channel, listener) => {
            const wrapped = wrapIpcListener(listener);
            ipcRenderer.on(channel, wrapped);
            return () => ipcRenderer.removeListener(channel, wrapped);
        },
        once: (channel, listener) => {
            ipcRenderer.once(channel, wrapIpcListener(listener));
        },
        removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener)
    },
    shell: {
        openExternal: (url) => ipcRenderer.invoke('open-external-url', url),
        openPath: (folder) => ipcRenderer.invoke('shell-open-path', folder)
    }
};

contextBridge.exposeInMainWorld('electron', electronBridge);

contextBridge.exposeInMainWorld('PandyBridge', {
    sendEvent: (type, data) => {
        ipcRenderer.send('tiktok-event', { type, data });
    },
    openDanceClubGame: () => {
        ipcRenderer.send('open-dance-club-game');
    },
    openDanceClubControl: () => {
        ipcRenderer.send('open-dance-club-control');
    },
    openOAuthWindow: (url) => {
        ipcRenderer.send('open-oauth-window', url);
    },
    getAuthToken: () => ipcRenderer.invoke('get-pandy-token'),
    askMicrophoneAccess: () => ipcRenderer.invoke('media-ask-microphone'),
    captureWindow: () => ipcRenderer.invoke('app-capture-window'),
    logRendererError: (log) => ipcRenderer.send('renderer-error-log', String(log || ''))
});
