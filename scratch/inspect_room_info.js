async function test() {
    const module = await import('tiktok-live-connector');
    const TikTokLiveConnection = module.TikTokLiveConnection;
    
    const tiktokConnect = new TikTokLiveConnection('youngdjxwhc', {});
    
    tiktokConnect.connect().then(state => {
        console.log("--- ROOM INFO DATA STRUCTURE ---");
        const data = state.roomInfo?.data || {};
        console.log("Room Info data keys:", Object.keys(data));
        console.log("Room Info data owner keys:", data.owner ? Object.keys(data.owner) : null);
        console.log("Room Info data owner nickname:", data.owner?.nickname);
        console.log("Room Info data owner avatarLarge:", data.owner?.avatarLarge);
        process.exit(0);
    }).catch(err => {
        console.error("Connection failed:", err);
        process.exit(1);
    });
}

test().catch(console.error);
