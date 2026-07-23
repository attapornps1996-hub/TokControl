async function test() {
    console.log("Starting test connection with options={} to prevent crash...");
    const module = await import('tiktok-live-connector');
    const TikTokLiveConnection = module.TikTokLiveConnection;
    
    // Pass empty object as options to prevent undefined property read crash
    const tiktokConnect = new TikTokLiveConnection('youngdjxwhc', {});
    
    tiktokConnect.connect().then(state => {
        console.log(`Connected successfully! Room ID: ${state.roomId}`);
        console.log("Connection state keys:", Object.keys(state));
    }).catch(err => {
        console.error(`Connection failed:`, err);
    });

    tiktokConnect.on('chat', data => {
        console.log(`[Chat] ${data.uniqueId}: ${data.comment}`);
    });

    tiktokConnect.on('gift', data => {
        console.log(`[Gift] ${data.uniqueId} sent ${data.giftName} x${data.repeatCount}`);
    });

    tiktokConnect.on('like', data => {
        console.log(`[Like] ${data.uniqueId} liked`);
    });

    tiktokConnect.on('member', data => {
        console.log(`[Join] ${data.uniqueId} joined`);
    });

    tiktokConnect.on('roomUser', data => {
        console.log(`[ViewerCount] Viewers: ${data.viewerCount}`);
    });
}

test().catch(console.error);
