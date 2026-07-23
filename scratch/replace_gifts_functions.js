const fs = require('fs');

let file = fs.readFileSync('index.html', 'utf8');

// Normalize line endings to LF
const originalLineEndings = file.includes('\r\n') ? '\r\n' : '\n';
file = file.replace(/\r\n/g, '\n');

const target = `        async function renderGiftDashboard() {
            updateStatUI();
            const listContainer = document.getElementById('adminDiscoveredGiftsList');
            if (!listContainer) return;
            listContainer.innerHTML = '<div style="color:#aaa; text-align:center; padding:10px;">⏳ กำลังโหลดของขวัญที่ตรวจพบล่าสุด...</div>';
            
            try {
                const res = await fetch('/api/gifts');
                const data = await res.json();
                if (res.ok && data.list) {
                    listContainer.innerHTML = '';
                    
                    const selectAllCb = document.getElementById('selectAllGiftsCheckbox');
                    if (selectAllCb) selectAllCb.checked = false;
                    updateDeleteSelectedButtonState();

                    if (data.list.length === 0) {
                        listContainer.innerHTML = '<div style="color:#666; text-align:center; padding:15px; font-size:0.8rem;">ยังไม่ตรวจพบของขวัญใดๆ ในฐานข้อมูล</div>';
                        return;
                    }
                    
                    // อัปเดตรายการ popularGifts แบบไดนามิกด้วยของขวัญที่ดึงมาจากฐานข้อมูลและขูดจากไลฟ์จริง!
                    popularGifts = [];
                    data.list.forEach(dbGift => {
                        const numericId = parseInt(dbGift.giftId);
                        popularGifts.push({
                            giftId: numericId,
                            giftName: dbGift.giftName,
                            cost: dbGift.diamondCount,
                            icon: dbGift.giftIcon || ""
                        });
                    });

                    // อัปเดตกล่องเลือกของขวัญในหน้าตั้งค่าหากเปิดใช้งานอยู่
                    if (document.getElementById('giftSearchInput')) {
                        const searchQuery = document.getElementById('giftSearchInput').value || '';
                        if (searchQuery) {
                            searchGiftCatalog(searchQuery);
                        } else {
                            renderGiftCatalog(popularGifts);
                        }
                    }

                    listContainer.innerHTML = ''; // เคลียร์ข้อความและแสดงรายการทั้งหมด
                    data.list.forEach(g => {
                        const iconUrl = g.giftIcon && g.giftIcon.trim() !== '' ? g.giftIcon : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                        listContainer.innerHTML += \`
                            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.15); padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.03);">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <input type="checkbox" class="gift-select-checkbox" data-id="\${g.giftId}" onchange="updateDeleteSelectedButtonState()" style="width:18px; height:18px; cursor:pointer;">
                                    <img src="\${iconUrl}" onerror="this.style.display='none'" style="width:25px; height:25px; object-fit:contain; \${iconUrl.startsWith('data:') ? 'display:none;' : ''}">
                                    <span style="color:#fff; font-weight:800; font-size:0.8rem;">\${g.giftName}</span>
                                    <span style="color:#aaa; font-size:0.7rem;">(ID: \${g.giftId})</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:12px;">
                                    <span style="color:#f1c40f; font-weight:800; font-size:0.8rem;">\${g.diamondCount} 🪙</span>
                                    <button onclick="editDiscoveredGift('\${g.giftId}')" style="background:rgba(188,19,254,0.15); border:1px solid #bc13fe; color:#bc13fe; font-size:0.65rem; padding:3px 6px; border-radius:4px; cursor:pointer; font-weight:bold; outline:none; transition: all 0.2s;">✏️ แก้ไข</button>
                                    <button onclick="deleteDiscoveredGift('\${g.giftId}')" style="background:rgba(255,71,87,0.15); border:1px solid #ff4757; color:#ff4757; font-size:0.65rem; padding:3px 6px; border-radius:4px; cursor:pointer; font-weight:bold; outline:none; transition: all 0.2s;">🗑️ ลบ</button>
                                </div>
                            </div>
                        \`;
                    });
                }
            } catch (e) {
                listContainer.innerHTML = '<div style="color:#ff4757; text-align:center; padding:10px;">ดึงข้อมูลล้มเหลว</div>';
            }
        }`;

const replacement = `        let databaseGiftsCache = [];

        async function renderGiftDashboard() {
            updateStatUI();
            const listContainer = document.getElementById('discoveredGiftsListContainer');
            if (!listContainer) return;
            listContainer.innerHTML = '<div style="color:#aaa; text-align:center; padding:10px;">⏳ กำลังโหลดของขวัญที่ตรวจพบล่าสุด...</div>';
            
            try {
                const res = await fetch('/api/gifts');
                const data = await res.json();
                if (res.ok && data.list) {
                    databaseGiftsCache = data.list;
                    
                    // Populate popularGifts dynamically
                    popularGifts = [];
                    data.list.forEach(dbGift => {
                        const numericId = parseInt(dbGift.giftId);
                        popularGifts.push({
                            giftId: numericId,
                            giftName: dbGift.giftName,
                            cost: dbGift.diamondCount,
                            icon: dbGift.giftIcon || ""
                        });
                    });

                    // Update Gacha Catalog search/render dropdowns
                    if (document.getElementById('giftSearchInput')) {
                        const searchQuery = document.getElementById('giftSearchInput').value || '';
                        if (searchQuery) {
                            searchGiftCatalog(searchQuery);
                        } else {
                            renderGiftCatalog(popularGifts);
                        }
                    }

                    renderDatabaseGiftsList(databaseGiftsCache);
                }
            } catch (e) {
                listContainer.innerHTML = '<div style="color:#ff4757; text-align:center; padding:10px;">ดึงข้อมูลล้มเหลว</div>';
            }
        }

        function renderDatabaseGiftsList(list) {
            const listContainer = document.getElementById('discoveredGiftsListContainer');
            if (!listContainer) return;

            const selectAllCb = document.getElementById('selectAllGiftsDbCheckbox');
            if (selectAllCb) selectAllCb.checked = false;
            updateDeleteSelectedButtonStateDb();

            if (list.length === 0) {
                listContainer.innerHTML = '<div style="color:#666; text-align:center; padding:15px; font-size:0.8rem;">ไม่พบของขวัญใดๆ</div>';
                return;
            }

            listContainer.innerHTML = '';
            list.forEach(g => {
                const iconUrl = g.giftIcon && g.giftIcon.trim() !== '' ? g.giftIcon : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                listContainer.innerHTML += \`
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:10px 15px; border-radius:10px; border:1px solid rgba(255,255,255,0.04); margin-bottom: 5px;">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <input type="checkbox" class="gift-db-select-checkbox" data-id="\${g.giftId}" onchange="updateDeleteSelectedButtonStateDb()" style="width:18px; height:18px; cursor:pointer;">
                            <img src="\${iconUrl}" onerror="this.style.display='none'" style="width:30px; height:30px; object-fit:contain; \${iconUrl.startsWith('data:') ? 'display:none;' : ''}">
                            <div style="display:flex; flex-direction:column; gap:2px;">
                                <span style="color:#fff; font-weight:800; font-size:0.85rem;">\${g.giftName}</span>
                                <span style="color:#666; font-size:0.7rem; font-weight: bold;">ID: \${g.giftId}</span>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:12px;">
                            <span style="color:#f1c40f; font-weight:800; font-size:0.85rem; background: rgba(241,196,15,0.1); padding: 4px 10px; border-radius: 20px; border: 1px solid rgba(241,196,15,0.25);">\${g.diamondCount} 🪙</span>
                            <button onclick="editDiscoveredGift('\${g.giftId}')" style="background:rgba(188,19,254,0.15); border:1px solid #bc13fe; color:#bc13fe; font-size:0.75rem; padding:5px 10px; border-radius:6px; cursor:pointer; font-weight:bold; outline:none; transition: all 0.2s;">✏️ แก้ไข</button>
                            <button onclick="deleteDiscoveredGift('\${g.giftId}')" style="background:rgba(255,71,87,0.15); border:1px solid #ff4757; color:#ff4757; font-size:0.75rem; padding:5px 10px; border-radius:6px; cursor:pointer; font-weight:bold; outline:none; transition: all 0.2s;">🗑️ ลบ</button>
                        </div>
                    </div>
                \`;
            });
        }

        function filterGiftDatabaseList(query) {
            if (!query.trim()) {
                renderDatabaseGiftsList(databaseGiftsCache);
                return;
            }
            const q = query.toLowerCase().trim();
            const filtered = databaseGiftsCache.filter(g => 
                g.giftName.toLowerCase().includes(q) || 
                String(g.giftId).includes(q)
            );
            renderDatabaseGiftsList(filtered);
        }

        function toggleSelectAllGiftsDb(checked) {
            const checkboxes = document.querySelectorAll('.gift-db-select-checkbox');
            checkboxes.forEach(cb => cb.checked = checked);
            updateDeleteSelectedButtonStateDb();
        }

        function updateDeleteSelectedButtonStateDb() {
            const checkboxes = document.querySelectorAll('.gift-db-select-checkbox:checked');
            const btn = document.getElementById('btnDeleteSelectedGiftsDb');
            if (!btn) return;
            
            const count = checkboxes.length;
            btn.innerText = \`🗑️ ลบที่เลือก (\${count})\`;
            if (count > 0) {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
                btn.disabled = false;
            } else {
                btn.style.opacity = '0.6';
                btn.style.pointerEvents = 'none';
                btn.disabled = true;
            }
        }

        async function deleteSelectedGiftsDb() {
            const checkboxes = document.querySelectorAll('.gift-db-select-checkbox:checked');
            if (checkboxes.length === 0) return;
            
            const giftIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-id'));
            if (!confirm(\`คุณแน่ใจว่าต้องการลบของขวัญที่เลือกทั้ง \${giftIds.length} ชิ้นใช่หรือไม่?\`)) return;
            
            try {
                const res = await fetch('/api/gifts/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ giftIds })
                });
                if (res.ok) {
                    const selectAllCb = document.getElementById('selectAllGiftsDbCheckbox');
                    if (selectAllCb) selectAllCb.checked = false;
                    renderGiftDashboard();
                } else {
                    const resData = await res.json();
                    alert("เกิดข้อผิดพลาดในการลบ: " + resData.error);
                }
            } catch (e) {
                alert("เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว");
            }
        }`;

if (file.includes(target)) {
    file = file.replace(target, replacement);
    console.log("Gifts rendering/filtering functions replaced successfully!");
} else {
    console.log("Gifts rendering/filtering target block not found!");
}

// Restore line endings
if (originalLineEndings === '\r\n') {
    file = file.replace(/\n/g, '\r\n');
}
fs.writeFileSync('index.html', file, 'utf8');
console.log("File index.html updated successfully!");
