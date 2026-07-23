async function test() {
    const module = await import('tiktok-live-connector');
    const TikTokLiveConnection = module.TikTokLiveConnection;
    
    const tiktokConnect = new TikTokLiveConnection('youngdjxwhc', {});
    tiktokConnect.connect();

    tiktokConnect.on('chat', data => {
        console.log("--- CHAT USER STRUCTURE ---");
        console.log("User uniqueId:", data.user?.uniqueId);
        console.log("User nickname:", data.user?.nickname);
        console.log("User avatar keys:", data.user?.avatarThumb ? Object.keys(data.user.avatarThumb) : null);
        console.log("User avatar urlList:", data.user?.avatarThumb?.urlList);
        console.log("Comment content:", data.content);
        process.exit(0);
    });
}

test().catch(console.error);
