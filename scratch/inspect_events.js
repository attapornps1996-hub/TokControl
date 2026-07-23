async function test() {
    console.log("Starting test connection to inspect event structures...");
    const module = await import('tiktok-live-connector');
    const TikTokLiveConnection = module.TikTokLiveConnection;
    
    const tiktokConnect = new TikTokLiveConnection('youngdjxwhc', {});
    
    tiktokConnect.connect().then(state => {
        console.log(`Connected! Room ID: ${state.roomId}`);
    }).catch(err => {
        console.error(`Connection failed:`, err);
    });

    tiktokConnect.on('chat', data => {
        console.log("--- CHAT EVENT DATA ---");
        console.log("Keys:", Object.keys(data));
        console.log("Stringified:", JSON.stringify(data, null, 2));
        process.exit(0);
    });
}

test().catch(console.error);
