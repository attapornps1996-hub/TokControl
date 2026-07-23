(function() {
    console.log("Pandy App Browser Connector active!");
    
    // แสดงข้อความยืนยันการเชื่อมต่อสำเร็จ
    const notifyEl = document.createElement("div");
    notifyEl.style.cssText = "position:fixed; top:20px; right:20px; z-index:999999; background:linear-gradient(45deg, #bc13fe, #ff0050); color:#fff; padding:15px 25px; border-radius:12px; font-family:'Kanit', sans-serif; font-weight:bold; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:2px solid #fff; font-size:16px; animation: slideIn 0.3s ease-out;";
    notifyEl.innerHTML = "⚡ Pandy App Browser Connector: เชื่อมต่อสำเร็จ! ระบบกำลังดักจับแชทและของขวัญ...";
    document.body.appendChild(notifyEl);
    setTimeout(() => { notifyEl.remove(); }, 5000);

    function sendEvent(type, data) {
        fetch("http://127.0.0.1:3000/api/browser/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, data })
        }).catch(err => console.error("Pandy App connection error:", err));
    }

    // ติดตามแชทและการส่งของขวัญในหน้าเบราว์เซอร์
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;

                try {
                    const text = node.innerText || "";
                    
                    // วิเคราะห์ว่าเป็นของขวัญหรือไม่
                    // ตัวอย่าง: "Username ส่ง Rose x5" หรือ "Username sent Rose x5"
                    const giftMatch = text.match(/(.+?)\s+(ส่ง|sent)\s+(.+?)\s*[xX]?\s*(\d+)/i) || text.match(/(.+?)\s+(ส่งของขวัญ|sent gift)\s+(.+?)/i);
                    
                    if (giftMatch) {
                        const uniqueId = giftMatch[1].trim().replace(/^@/, "");
                        const giftName = giftMatch[3].trim();
                        const repeatCount = giftMatch[4] ? parseInt(giftMatch[4]) : 1;
                        
                        sendEvent("gift", {
                            uniqueId,
                            nickname: uniqueId,
                            giftName,
                            repeatCount,
                            profilePictureUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${uniqueId}`
                        });
                    } else {
                        // แชทปกติ
                        const parts = text.split(":");
                        if (parts.length >= 2) {
                            const nickname = parts[0].trim().replace(/^@/, "");
                            const comment = parts.slice(1).join(":").trim();
                            sendEvent("chat", { uniqueId: nickname, nickname, comment });
                        }
                    }
                } catch (e) {
                    console.error("Error parsing chat node:", e);
                }
            });
        });
    });

    // ค้นหากล่องแชทของ TikTok Live
    const chatContainer = document.querySelector('[class*="chat-list"]') || 
                          document.querySelector('[class*="ChatList"]') || 
                          document.querySelector('.webcast-chat-list') || 
                          document.querySelector('[class*="message-container"]') ||
                          document.body;

    observer.observe(chatContainer, { childList: true, subtree: true });
    
    // ยิงอีเวนต์เชื่อมต่อเริ่มทำงาน
    sendEvent("browser_connected", { status: "connected" });
})();