const { io } = require('socket.io-client');

const socket = io('http://127.0.0.1:3000');
const token = '80cb265d882d88901b9acb69e9fb8cd1';

socket.on('connect', () => {
    console.log('Client connected to local server!');
    socket.emit('join_panel', token);
    
    // Simulate gacha sequence
    setTimeout(() => {
        console.log('Emitting send_reveal_card...');
        socket.emit('send_reveal_card', {
            token: token,
            res: {
                rule: { tier: 'ssr', type: 'plus', val: '100' },
                asset: { name: 'Item Test', src: 'data:image/png;base64,...' }
            },
            shadowImg: 'data:image/png;base64,...'
        });
    }, 1000);

    setTimeout(() => {
        console.log('Emitting send_result...');
        socket.emit('send_result', {
            token: token,
            results: [{
                tier: 'ssr',
                type: 'plus',
                val: '100',
                name: 'Item Test',
                src: 'data:image/png;base64,...',
                isVideo: false,
                count: 1,
                category: 'SSR'
            }],
            sponsor: 'Sponsor A',
            shadowImg: 'data:image/png;base64,...',
            tierBackgrounds: { ssr: 'data:image/png;base64,...' },
            tierBackgroundsIsVideo: { ssr: false }
        });
    }, 2000);

    setTimeout(() => {
        console.log('Emitting send_total...');
        socket.emit('send_total', { token, sum: 100 });
    }, 3500);

    setTimeout(() => {
        console.log('Emitting send_hide_result...');
        socket.emit('send_hide_result', token);
    }, 5000);
});

socket.on('overlay_reveal_card', (data) => {
    console.log('Overlay received overlay_reveal_card:', Object.keys(data));
});

socket.on('overlay_show_result', (data) => {
    console.log('Overlay received overlay_show_result:', Object.keys(data));
});

socket.on('disconnect', () => {
    console.log('Client disconnected! Server probably crashed!');
    process.exit(1);
});

// Exit after 7 seconds if all went well
setTimeout(() => {
    console.log('Simulation complete! No crashes detected.');
    process.exit(0);
}, 7000);
