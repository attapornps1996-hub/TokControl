async function test() {
    const module = await import('tiktok-live-connector');
    const TikTokLiveConnection = module.TikTokLiveConnection;
    
    const tiktokConnect = new TikTokLiveConnection('youngdjxwhc', {});
    
    tiktokConnect.connect().then(state => {
        console.log("--- ROOM OWNER AVATAR ---");
        const owner = state.roomInfo?.data?.owner || {};
        console.log("avatar_large:", JSON.stringify(owner.avatar_large, null, 2));
        process.exit(0);
    }).catch(err => {
        console.error("Connection failed:", err);
        process.exit(1);
    });
}

test().catch(console.error);
