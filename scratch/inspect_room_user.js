async function test() {
    const module = await import('tiktok-live-connector');
    const TikTokLiveConnection = module.TikTokLiveConnection;
    
    const tiktokConnect = new TikTokLiveConnection('youngdjxwhc', {});
    tiktokConnect.connect();

    tiktokConnect.on('roomUser', data => {
        console.log("--- ROOM USER SEQ MESSAGE ---");
        console.log("Keys:", Object.keys(data));
        console.log("Stringified:", JSON.stringify(data, null, 2));
        process.exit(0);
    });
}

test().catch(console.error);
