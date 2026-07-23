(function() {
    console.log("TokControl Browser Connector active!");
    
    if (window.PandyObserver) {
        try {
            window.PandyObserver.disconnect();
            console.log("TokControl: Old observer disconnected.");
        } catch(e) {}
    }
    
    // แสดงข้อความยืนยันการเชื่อมต่อสำเร็จ
    const notifyEl = document.createElement("div");
    notifyEl.style.cssText = "position:fixed; top:20px; right:20px; z-index:999999; background:linear-gradient(45deg, #bc13fe, #ff0050); color:#fff; padding:15px 25px; border-radius:12px; font-family:'Kanit', sans-serif; font-weight:bold; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:2px solid #fff; font-size:16px; animation: slideIn 0.3s ease-out;";
    notifyEl.innerHTML = "⚡ TokControl Browser Connector: เชื่อมต่อสำเร็จ! ระบบกำลังดักจับแชทและของขวัญ...";
    document.body.appendChild(notifyEl);
    setTimeout(() => { notifyEl.remove(); }, 5000);

    let streamerUsername = "";
    if (typeof window.injectedUsername !== 'undefined' && window.injectedUsername) {
        streamerUsername = window.injectedUsername;
    } else if (typeof injectedUsername !== 'undefined') {
        streamerUsername = injectedUsername;
    } else {
        const urlMatch = window.location.pathname.match(/@([a-zA-Z0-9_\.]+)/) || window.location.hostname.match(/([a-zA-Z0-9_\.]+)\.tiktok/);
        streamerUsername = urlMatch ? urlMatch[1] : "";
    }


    function sendEvent(type, data) {
        data.username = streamerUsername;
        if (window.PandyBridge && typeof window.PandyBridge.sendEvent === 'function') {
            window.PandyBridge.sendEvent(type, data);
        } else {
            fetch("http://127.0.0.1:3000/api/browser/event", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type, data })
            }).catch(err => console.error("TokControl connection error:", err));
        }
    }

    // ฟังก์ชั่นช่วยวิเคราะห์และแยกแยะแชทแบบทนทาน (Robust Chat Parser)
    function parseChatText(text) {
        let lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) {
            // ลองแยกด้วยโคลอนปกติ
            let colonParts = text.split(":");
            if (colonParts.length >= 2) {
                return {
                    nickname: colonParts[0].trim().replace(/^@/, ""),
                    comment: colonParts.slice(1).join(":").trim()
                };
            }
            return null;
        }
        
        // กรองตราสัญลักษณ์หรือเลเวลออกไปเพื่อไม่ให้ดึงผิดพลาด
        const badgePatterns = [
            /^\d+$/,                  // ตัวเลขเดี่ยว (เลเวล)
            /^No\.\s*\d+$/i,          // "No. 1", "No. 3"
            /^Lv\.\s*\d+$/i,          // "Lv. 4"
            /^sent$/i,                // ภาษาอังกฤษส่ง
            /^ส่ง$/,
            /^joined$/i,
            /^เข้าร่วม$/
        ];
        
        let cleanLines = lines.filter(line => {
            return !badgePatterns.some(pattern => pattern.test(line));
        });
        
        if (cleanLines.length >= 2) {
            const comment = cleanLines[cleanLines.length - 1];
            const nickname = cleanLines[0].replace(/^@/, "");
            return { nickname, comment };
        }
        
        return null;
    }

    // ฟังก์ชั่นขูดข้อมูลของขวัญจากแถบด้านล่างหน้าจอโดยตรง
    function scanBottomGiftPanel() {
        try {
            const elementsToScan = Array.from(document.querySelectorAll('div, button, li')).filter(el => {
                const text = el.innerText || "";
                if (text.length === 0 || text.length > 50) return false;
                
                const hasNumber = /\d+/.test(text);
                const hasImage = el.querySelector('img') !== null;
                if (!hasImage || !hasNumber) return false;

                let parent = el.parentElement;
                while (parent) {
                    const className = parent.className || "";
                    if (typeof className === 'string') {
                        const classLower = className.toLowerCase();
                        if (classLower.includes("chat") || 
                            classLower.includes("message") || 
                            classLower.includes("guest") || 
                            classLower.includes("speaker") || 
                            classLower.includes("header") || 
                            classLower.includes("sidebar") || 
                            classLower.includes("video") || 
                            classLower.includes("player") || 
                            classLower.includes("cohost") || 
                            classLower.includes("stream") || 
                            classLower.includes("multi-live")) {
                            return false;
                        }
                    }
                    parent = parent.parentElement;
                }
                return true;
            });

            if (elementsToScan.length === 0) return false;
            let successCount = 0;

            elementsToScan.forEach(el => {
                try {
                    const imgEl = el.querySelector('img');
                    if (!imgEl || !imgEl.src || !imgEl.src.startsWith('http')) return;
                    
                    const srcLower = imgEl.src.toLowerCase();
                    if (srcLower.includes("-avt-") || srcLower.includes("avatar") || srcLower.includes("/avt/")) return;

                    const text = el.innerText || "";
                    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    if (lines.length >= 2) {
                        let giftName = "";
                        let cost = 0;
                        
                        const isPureNumber0 = /^\d+$/.test(lines[0]);
                        const isPureNumber1 = /^\d+$/.test(lines[1]);
                        
                        if (isPureNumber1 && !isPureNumber0) {
                            giftName = lines[0];
                            cost = parseInt(lines[1]);
                        } else if (isPureNumber0 && !isPureNumber1) {
                            giftName = lines[1];
                            cost = parseInt(lines[0]);
                        }
                        
                        if (giftName && cost > 0 && giftName.length < 35) {
                            const nameLower = giftName.toLowerCase();
                            if (nameLower.includes("more") || nameLower.includes("เพิ่มเติม") || nameLower.includes("recharge") || nameLower.includes("เติมเงิน") || nameLower.includes("กลับ") || nameLower.includes("back")) {
                                return;
                            }

                            let pseudoGiftId = 0;
                            for (let i = 0; i < giftName.length; i++) {
                                pseudoGiftId = (pseudoGiftId << 5) - pseudoGiftId + giftName.charCodeAt(i);
                                pseudoGiftId |= 0;
                            }
                            pseudoGiftId = Math.abs(pseudoGiftId);
                            
                            sendEvent("gift_discovered_from_panel", {
                                giftId: pseudoGiftId,
                                giftName: giftName,
                                diamondCount: cost,
                                giftIcon: imgEl.src
                            });
                            successCount++;
                        }
                    }
                } catch (e) {}
            });
            return successCount > 0;
        } catch (e) {
            return false;
        }
    }

    // ติดตามแชทและการส่งของขวัญในหน้าเบราว์เซอร์
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;

                try {
                    const text = node.innerText || "";
                    if (!text) return;

                    const imgs = Array.from(node.querySelectorAll('img')).map(img => img.src);
                    let userAvatar = "";

                    // แปลงข้อความบรรทัดใหม่ทั้งหมดให้เป็นวรรค
                    const singleLineText = text.replace(/\r?\n/g, ' ').trim();

                    // วิเคราะห์ของขวัญ
                    const giftMatch = singleLineText.match(/(.+?)\s+(ส่ง|sent)\s+(.+?)\s*[xX]?\s*(\d+)/i);
                    const isGiftMsg = giftMatch && (imgs.length >= 1 || singleLineText.includes("sent") || singleLineText.includes("ส่ง"));
                    
                    if (isGiftMsg) {
                        let uniqueId = giftMatch[1].trim().replace(/^@/, "");
                        let giftName = giftMatch[3].trim();
                        if (giftName.toLowerCase() === 'x' || giftName === '') {
                            giftName = "Gift";
                        }
                        const repeatCount = parseInt(giftMatch[4]) || 1;

                        // ค้นหารูปของขวัญ
                        let giftIcon = "";
                        for (let i = imgs.length - 1; i >= 0; i--) {
                            const url = imgs[i].toLowerCase();
                            if (!url.includes("-avt-") && 
                                !url.includes("avatar") && 
                                !url.includes("/avt/") && 
                                !url.includes("level") && 
                                !url.includes("badge") && 
                                !url.includes("fans") && 
                                !url.includes("rank")) {
                                giftIcon = imgs[i];
                                break;
                            }
                        }

                        if (!giftIcon) {
                            giftIcon = "https://api.dicebear.com/7.x/bottts/svg?seed=" + encodeURIComponent(giftName);
                        }

                        // ค้นหารูปโปรไฟล์ของคนส่ง
                        let userAvatar = "";
                        for (let i = 0; i < imgs.length; i++) {
                            const url = imgs[i].toLowerCase();
                            if (url.includes("-avt-") || url.includes("avatar") || url.includes("/avt/")) {
                                userAvatar = imgs[i];
                                break;
                            }
                        }
                        if (!userAvatar) {
                            userAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${uniqueId}`;
                        }

                        let pseudoGiftId = 0;
                        for (let i = 0; i < giftName.length; i++) {
                            pseudoGiftId = (pseudoGiftId << 5) - pseudoGiftId + giftName.charCodeAt(i);
                            pseudoGiftId |= 0;
                        }
                        pseudoGiftId = Math.abs(pseudoGiftId);

                        sendEvent("gift", {
                            uniqueId,
                            nickname: uniqueId,
                            giftName,
                            giftId: pseudoGiftId,
                            repeatCount,
                            profilePictureUrl: userAvatar,
                            giftIcon: giftIcon
                        });
                    } else {
                        // แชทปกติ หรือ เหตุการณ์ระบบ
                        if (imgs.length > 0) {
                            userAvatar = imgs[0];
                        } else {
                            userAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(text.substring(0, 5))}`;
                        }

                        if (singleLineText.includes("liked") || singleLineText.includes("ถูกใจ") || singleLineText.includes("ส่งไล")) {
                            const nickname = singleLineText.split(/\s+(liked|ถูกใจ|ส่งไล)/i)[0].trim().replace(/^@/, "");
                            if (nickname && nickname.length > 0 && nickname.length < 30) {
                                sendEvent("like", {
                                    uniqueId: nickname,
                                    nickname: nickname,
                                    profilePictureUrl: userAvatar,
                                    likeCount: 1
                                });
                                return;
                            }
                        }

                        if (singleLineText.includes("followed") || singleLineText.includes("ติดตาม") || singleLineText.includes("กดติดตาม")) {
                            const nickname = singleLineText.split(/\s+(followed|ติดตาม|กดติดตาม)/i)[0].trim().replace(/^@/, "");
                            if (nickname && nickname.length > 0 && nickname.length < 30) {
                                sendEvent("follow", {
                                    uniqueId: nickname,
                                    nickname: nickname,
                                    profilePictureUrl: userAvatar
                                });
                                return;
                            }
                        }

                        if (singleLineText.includes("joined") || singleLineText.includes("เข้าร่วม") || singleLineText.includes("เข้ามาแล้ว")) {
                            const nickname = singleLineText.split(/\s+(joined|เข้าร่วม|เข้ามาแล้ว)/i)[0].trim().replace(/^@/, "");
                            if (nickname && nickname.length > 0 && nickname.length < 30) {
                                sendEvent("join", {
                                    uniqueId: nickname,
                                    nickname: nickname,
                                    profilePictureUrl: userAvatar
                                });
                                return;
                            }
                        }

                        const parsedChat = parseChatText(text);
                        if (parsedChat) {
                            sendEvent("chat", { 
                                uniqueId: parsedChat.nickname, 
                                nickname: parsedChat.nickname, 
                                comment: parsedChat.comment,
                                profilePictureUrl: userAvatar
                            });
                        }
                    }
                } catch (e) {
                    console.error("Error parsing chat node:", e);
                }
            });
        });
    });

    const chatContainer = document.querySelector('[class*="chat-list"]') || 
                           document.querySelector('[class*="ChatList"]') || 
                           document.querySelector('.webcast-chat-list') || 
                           document.querySelector('[class*="message-container"]') ||
                           document.body;

    observer.observe(chatContainer, { childList: true, subtree: true });
    window.PandyObserver = observer;
    
    sendEvent("browser_connected", { status: "connected", avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${streamerUsername}` });

    let avatarFound = false;
    const findAvatarInterval = setInterval(() => {
        try {
            const isLiveNow = window.location.pathname.includes('/live');
            let hostDisplayName = streamerUsername;
            const nameEl = document.querySelector('[data-e2e="live-host-nickname"]') ||
                           document.querySelector('[data-e2e="user-title"]') ||
                           document.querySelector('h1[class*="ShareTitle"]') ||
                           document.querySelector('span[class*="SpanHostName"]');
                           
            if (nameEl && nameEl.innerText && nameEl.innerText.trim().length > 0) {
                hostDisplayName = nameEl.innerText.trim();
            } else {
                const ogTitle = document.querySelector('meta[property="og:title"]');
                const rawTitle = ogTitle ? ogTitle.content : document.title;
                if (rawTitle) {
                    let cleanTitle = rawTitle.replace(' is LIVE', '').replace(' กำลังไลฟ์', '').split('|')[0].split('(@')[0].trim();
                    if (cleanTitle.length > 0 && !cleanTitle.includes('TikTok')) {
                        hostDisplayName = cleanTitle;
                    }
                }
            }

            let avatarImg = document.querySelector('[data-e2e="live-host-avatar"]') ||
                            document.querySelector('[data-e2e="user-avatar"] img') || 
                            document.querySelector('img[class*="avatar"]') || 
                            document.querySelector('img[class*="Avatar"]');
                            
            if (avatarImg && avatarImg.src && avatarImg.src.startsWith('http')) {
                avatarFound = true;
                clearInterval(findAvatarInterval);
                sendEvent("browser_connected", { status: "connected", avatar: avatarImg.src, nickname: hostDisplayName, isLive: isLiveNow });
                return;
            }

            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage && ogImage.content && ogImage.content.startsWith('http')) {
                avatarFound = true;
                clearInterval(findAvatarInterval);
                sendEvent("browser_connected", { status: "connected", avatar: ogImage.content, nickname: hostDisplayName, isLive: isLiveNow });
                return;
            }

            const imgs = Array.from(document.querySelectorAll('img'));
            let fallbackImg = imgs.find(img => img.src && 
                (img.src.includes('tiktokcdn') || img.src.includes('byteoversea') || img.src.includes('ibytedtos') || img.src.includes('avatar') || img.className.includes('avatar')) && 
                img.width >= 40
            );
            
            if (fallbackImg && fallbackImg.src) {
                avatarFound = true;
                clearInterval(findAvatarInterval);
                sendEvent("browser_connected", { status: "connected", avatar: fallbackImg.src, nickname: hostDisplayName, isLive: isLiveNow });
            }
        } catch (e) {}
    }, 2000);
    
    setTimeout(() => { clearInterval(findAvatarInterval); }, 30000);

    setInterval(() => {
        try {
            let isLiveNow = window.location.pathname.includes('/live');
            if (isLiveNow) {
                const pageText = document.body.innerText || "";
                if (pageText.includes("LIVE has ended") || pageText.includes("Live ended") || pageText.includes("การถ่ายทอดสดสิ้นสุดลงแล้ว") || pageText.includes("ไลฟ์สิ้นสุดแล้ว")) {
                    isLiveNow = false;
                }
            }
            sendEvent("browser_live_status", { isLive: isLiveNow });
        } catch (e) {}
    }, 4000);

    let bottomScanInterval = setInterval(() => {
        if (scanBottomGiftPanel()) {
            clearInterval(bottomScanInterval);
            console.log("TokControl: Bottom gift panel scanned successfully.");
        }
    }, 3000);
    
    setTimeout(() => {
        if (scanBottomGiftPanel()) {
            if (typeof bottomScanInterval !== 'undefined') clearInterval(bottomScanInterval);
        }
    }, 1000);
})();
