async function test() {
    console.log("Testing connection to @k2j999zx...");
    const module = await import('tiktok-live-connector');
    const TikTokLiveConnection = module.TikTokLiveConnection;
    
    const tiktokConnect = new TikTokLiveConnection('k2j999zx', {});
    
    tiktokConnect.connect().then(state => {
        console.log(`Connected! Room ID: ${state.roomId}`);
        console.log("Room Info keys:", Object.keys(state.roomInfo || {}));
        if (state.roomInfo?.data) {
            console.log("Owner nickname:", state.roomInfo.data.owner?.nickname);
        }
        process.exit(0);
    }).catch(err => {
        console.error(`Connection failed:`, err.message);
        process.exit(1);
    });
}

test().catch(console.error);
