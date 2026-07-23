async function test() {
    const module = await import('tiktok-live-connector');
    const TikTokLiveConnection = module.TikTokLiveConnection;
    
    const tiktokConnect = new TikTokLiveConnection('youngdjxwhc', {});
    tiktokConnect.connect();

    tiktokConnect.on('chat', data => {
        console.log("User object keys:", Object.keys(data.user));
        console.log("User displayId:", data.user.displayId);
        console.log("User uniqueId:", data.user.uniqueId);
        console.log("User idStr:", data.user.idStr);
        console.log("User secUid:", data.user.secUid);
        process.exit(0);
    });
}

test().catch(console.error);
