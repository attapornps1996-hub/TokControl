const { TikTokLiveConnection } = require('tiktok-live-connector');

async function test() {
    const username = 'youngdjxwhc'; 
    console.log(`Connecting to @${username}...`);
    const conn = new TikTokLiveConnection(username, {});
    
    try {
        const roomId = await conn.fetchRoomId();
        conn.roomId = roomId;
        const res = await conn.webClient.getJsonObjectFromWebcastApi("gift/list/", {
            ...conn.webClient.clientParams,
            room_id: roomId
        }, false);
        
        if (res.data && res.data.gifts) {
            console.log('Total gifts:', res.data.gifts.length);
            const heartMe = res.data.gifts.find(g => g.id === 7934 || String(g.id) === '7934');
            const pop = res.data.gifts.find(g => g.id === 19438 || String(g.id) === '19438');
            const rose = res.data.gifts.find(g => g.id === 5655 || String(g.id) === '5655');
            
            console.log('Heart Me:', heartMe ? JSON.stringify(heartMe) : 'NOT FOUND');
            console.log('Pop:', pop ? JSON.stringify(pop) : 'NOT FOUND');
            console.log('Rose:', rose ? JSON.stringify(rose) : 'NOT FOUND');
        }
    } catch (e) {
        console.error(e);
    }
}

test();
