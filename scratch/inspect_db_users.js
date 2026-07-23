const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('database.sqlite');

db.all('SELECT id, username, streamToken, isPro FROM users', (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log("--- DB USERS ---");
        console.log(rows);
    }
    db.close();
});
