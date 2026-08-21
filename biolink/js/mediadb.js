// mediadb.js - Manages large file storage (Videos, Audio, Images) using IndexedDB
// This prevents localStorage quota limits (5MB) from being exceeded.

const MediaDB = (function() {
    const DB_NAME = 'BioLinkMediaDB';
    const STORE_NAME = 'media';
    const DB_VERSION = 4;
    let dbInstance = null;

    function init() {
        return new Promise((resolve, reject) => {
            if (dbInstance) return resolve(dbInstance);

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (e) => reject("IndexedDB Error: " + e.target.error);

            request.onsuccess = (e) => {
                dbInstance = e.target.result;
                resolve(dbInstance);
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME); // Key-Value store
                }
            };
        });
    }

    // Save a file (Blob/File) to IndexedDB, returns a unique key like 'indexeddb://media_12345'
    async function saveMedia(file) {
        const db = await init();
        let ext = '';
        if (file.name && file.name.includes('.')) {
            ext = '.' + file.name.split('.').pop().toLowerCase();
        }
        const key = 'indexeddb://' + Date.now() + '_' + Math.random().toString(36).substr(2, 5) + ext;
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            const request = store.put({
                blob: file,
                type: file.type,
                name: file.name
            }, key);

            request.onsuccess = () => resolve(key);
            request.onerror = (e) => reject("Failed to save media: " + e.target.error);
        });
    }

    // Load media from a key and return an Object URL
    async function getMediaUrl(key) {
        if (!key || !key.startsWith('indexeddb://')) return { url: key }; // Return original if not our protocol

        try {
            const db = await init();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(key);

                request.onsuccess = (e) => {
                    const data = e.target.result;
                    if (data && data.blob) {
                        const objUrl = URL.createObjectURL(data.blob);
                        resolve({ url: objUrl, type: data.type });
                    } else {
                        resolve({ url: key }); // Fallback
                    }
                };
                request.onerror = () => resolve({ url: key });
            });
        } catch (e) {
            console.error("Error getting media from IndexedDB:", e);
            return { url: key }; // Fallback
        }
    }

    // Clean up memory
    function revokeMediaUrl(url) {
        if (url && url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
        }
    }

    // Pre-process a DOM element containing indexeddb:// links and replace with blob URLs
    // Useful for rendering public view
    async function resolveAllMediaUrls(container) {
        const elements = container.querySelectorAll('[data-idb-src]');
        for (let el of elements) {
            const key = el.getAttribute('data-idb-src');
            const media = await getMediaUrl(key);
            if (media) {
                if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'AUDIO' || el.tagName === 'IFRAME') {
                    el.src = media.url;
                } else {
                    // background image
                    el.style.backgroundImage = `url('${media.url}')`;
                }
                el.removeAttribute('data-idb-src'); // Prevent re-processing
            }
        }
    }

    return {
        init,
        saveMedia,
        getMediaUrl,
        revokeMediaUrl,
        resolveAllMediaUrls
    };
})();
window.MediaDB = MediaDB;
