const { writeFile, existsSync, mkdirSync } = require('fs');
const { default: axios } = require('axios');
const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const isDev = !app.isPackaged;

process.env.TIKFINITY_HOST = isDev ? 'http://localhost:8081' : 'https://tikfinity.zerody.one';
process.env.TIKFINITY_HOST_FALLBACK = 'http://tikfinity-origin.zerody.one';

// Update main.js
let loadMain = (isRetry) => {
    axios.get(`${process.env.TIKFINITY_HOST}/electron/main.js?v=${new Date().getTime()}`, { timeout: 8000 }).then(mainJsResponse => {
        if (mainJsResponse.status !== 200) {
            dialog.showErrorBox('Server Error', 'Failed to load TikFinity Web Components.\nPlease try again later.\n\nStatus code: ' + mainJsResponse.status);
            return app.quit();
        }

        const RES_DIR = path.join(app.getPath('userData'), 'res');

        if (!existsSync(RES_DIR)) {
            mkdirSync(RES_DIR);
        }

        writeFile(path.join(RES_DIR, 'main.js'), mainJsResponse.data, (err) => {
            try {
                if (err) throw err;
                require(path.join(RES_DIR, 'main.js'))();
            } catch (err) {
                dialog.showErrorBox('JS Error', 'Failed to initialize TikFinity Web Components.\nPlease try again later.\n\n' + err.toString());
                app.quit();
            }
        });
    }).catch(err => {
        if (isRetry) {
            dialog.showErrorBox('Server not available', 'Failed to load TikFinity Web Components.\nPlease check your internet connection and try again.\n\nHost: ' + process.env.TIKFINITY_HOST + '\n' + (err?.toString() || 'Unknown Error'));
            app.quit();
        } else {
            process.env.TIKFINITY_HOST = process.env.TIKFINITY_HOST_FALLBACK;
            loadMain(true);
        }
    })
}

app.whenReady().then(() => {
    autoUpdater.forceDevUpdateConfig = isDev;

    autoUpdater.autoDownload = false;

    loadMain();
});