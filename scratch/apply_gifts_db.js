const fs = require('fs');

let file = fs.readFileSync('index.html', 'utf8');

// Normalize line endings to LF
const originalLineEndings = file.includes('\r\n') ? '\r\n' : '\n';
file = file.replace(/\r\n/g, '\n');

// 1. Add sidebar menu item
const sidebarTarget = `            <a href="#" class="nav-item" id="nav-gacha" onclick="switchMainTab('gacha')">
                <span class="nav-icon">🎛️</span> Widgets
            </a>
            <a href="#" class="nav-item" id="nav-settings" onclick="openOBSModal()">`;

const sidebarReplacement = `            <a href="#" class="nav-item" id="nav-gacha" onclick="switchMainTab('gacha')">
                <span class="nav-icon">🎛️</span> Widgets
            </a>
            <a href="#" class="nav-item" id="nav-gifts" onclick="switchMainTab('gifts')">
                <span class="nav-icon">🎁</span> ของขวัญ
            </a>
            <a href="#" class="nav-item" id="nav-settings" onclick="openOBSModal()">`;

if (file.includes(sidebarTarget)) {
    file = file.replace(sidebarTarget, sidebarReplacement);
    console.log("1. Sidebar menu updated successfully!");
} else {
    console.log("1. Sidebar target block not found!");
}

// 2. Add giftsView container inside main content wrapper
const containerTarget = `    </div> <!-- Close ttsView -->`;

const containerReplacement = `    </div> <!-- Close ttsView -->

    <!-- View 6: Gifts Database (คลังของขวัญ) -->
    <div class="app-view" id="giftsView">
        <div style="display: flex; flex-direction: column; gap: 20px; padding: 24px 28px; box-sizing: border-box; width: 100%; height: 100%; overflow-y: auto; background: radial-gradient(circle at center, #18142c 0%, #050507 100%); margin: 0; min-height: 100%;">
            
            <!-- HEADER -->
            <div style="flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 10px;">
                <div>
                    <h2 style="margin: 0; font-size: 1.6rem; font-weight: 800; color: #fff; font-family: 'Kanit'; text-shadow: 0 0 15px rgba(255,159,67,0.3);">🎁 คลังของขวัญ (Gifts Database)</h2>
                    <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: #888; font-family: 'Kanit';">ฐานข้อมูลของขวัญทั้งหมดที่ระบบตรวจพบจากไลฟ์ TikTok เพื่อใช้กำหนดรางวัลในวงล้อกาชาและระบบอื่นๆ</p>
                </div>
            </div>

            <!-- CONTENT CARD -->
            <div class="glass-card" style="padding: 25px; flex: 1; min-height: 450px; text-align: left; display: flex; flex-direction: column; gap: 15px;">
                <!-- Toolbar with search and bulk actions -->
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 15px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 10px; flex: 1; max-width: 400px;">
                        <span style="color:#aaa; font-size: 0.9rem;">🔍</span>
                        <input type="text" id="giftDatabaseSearchInput" placeholder="ค้นหาชื่อของขวัญ หรือ ID..." class="field-ui" style="margin: 0; padding: 8px 12px; font-size: 0.85rem;" oninput="filterGiftDatabaseList(this.value)">
                    </div>
                    
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.8rem; color:#ccc; font-weight:800; user-select:none; margin:0; background:rgba(255,255,255,0.03); padding:8px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
                            <input type="checkbox" id="selectAllGiftsDbCheckbox" onchange="toggleSelectAllGiftsDb(this.checked)" style="width:18px; height:18px; cursor:pointer; margin:0;">
                            เลือกทั้งหมด
                        </label>
                        <button id="btnDeleteSelectedGiftsDb" onclick="deleteSelectedGiftsDb()" style="background:rgba(255,71,87,0.15); border:1px solid #ff4757; color:#ff4757; border-radius:8px; padding:8px 16px; font-size:0.75rem; font-weight:bold; cursor:pointer; opacity: 0.6; pointer-events: none; transition: all 0.2s;" disabled>
                            🗑️ ลบที่เลือก (0)
                        </button>
                    </div>
                </div>

                <!-- Automatic Catcher Alert Banner -->
                <div style="background: rgba(46,204,113,0.08); border: 1px solid rgba(46,204,113,0.3); border-radius: 12px; padding: 12px 15px; font-size: 0.8rem; color: #ccc; line-height: 1.5; display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.2rem;">🟢</span>
                    <div>
                        <b style="color:#2ecc71;">ระบบจับของขวัญอัตโนมัติเปิดใช้งานอยู่ (Auto-Catcher Active):</b> เมื่อมีคนส่งของขวัญใหม่เข้ามาในไลฟ์ TikTok ของคุณที่ไม่อยู่ในคลัง ระบบจะบันทึกรูปภาพ ราคาเหรียญ และชื่อของขวัญเข้าฐานข้อมูลนี้โดยอัตโนมัติ เพื่อให้คุณสามารถนำไปเลือกใช้งานในระบบกาชาและการตั้งค่าอื่นๆ ได้ทันที!
                    </div>
                </div>

                <!-- Gifts list container -->
                <div id="discoveredGiftsListContainer" style="display:flex; flex-direction:column; gap:8px; overflow-y:auto; flex: 1; max-height: 500px; padding-right: 5px;">
                    <!-- List loaded from DB -->
                </div>
            </div>
            
        </div>
    </div>`;

if (file.includes(containerTarget)) {
    file = file.replace(containerTarget, containerReplacement);
    console.log("2. giftsView container added successfully!");
} else {
    console.log("2. container target block not found!");
}

// 3. Remove gifts tab button from Gacha Widgets settings popup
const tabBtnTarget = `                                 <button class="gacha-grid-btn" id="gachaTab-gifts" onclick="switchGachaSettingsTab('gifts')">
                                     <span style="font-size:1.1rem; color:#ff9f43;">🎁</span>
                                     <span style="font-size:0.7rem; font-weight:800; font-family:'Kanit';">Gifts</span>
                                 </button>`;

if (file.includes(tabBtnTarget)) {
    file = file.replace(tabBtnTarget, '');
    console.log("3. Gifts tab button removed successfully!");
} else {
    console.log("3. Gifts tab button target not found!");
}

// 4. Remove TAB 8 gifts settings section
const settingsSecTarget = `                                 <!-- TAB 8: GIFTS -->
                                 <div class="gacha-settings-section" id="gachaSec-gifts" style="display: none;">
                                     <div class="rule-card" style="margin: 0 0 15px 0;">
                                         <span class="field-label" style="color:var(--accent); font-weight:bold; font-size:0.85rem;">🎁 จัดการข้อมูลของขวัญระบบที่ตรวจพบ (Gifts Database)</span>
                                         
                                         <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; margin-bottom:12px; background:rgba(0,0,0,0.4); padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
                                             <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.8rem; color:#ccc; font-weight:800; user-select:none; margin:0;">
                                                 <input type="checkbox" id="selectAllGiftsCheckbox" onchange="toggleSelectAllGifts(this.checked)" style="width:18px; height:18px; cursor:pointer; margin:0;">
                                                 เลือกทั้งหมด (Select All)
                                             </label>
                                             <button id="btnDeleteSelectedGifts" onclick="deleteSelectedGifts()" style="background:rgba(255,71,87,0.15); border:1px solid #ff4757; color:#ff4757; border-radius:8px; padding:6px 14px; font-size:0.75rem; font-weight:bold; cursor:pointer; opacity: 0.6; pointer-events: none; transition: all 0.2s;" disabled>
                                                 🗑️ ลบที่เลือก (0)
                                             </button>
                                         </div>

                                         <div id="adminDiscoveredGiftsList" style="display:flex; flex-direction:column; gap:8px;">
                                             <!-- รายชื่อของขวัญที่แก้ไข/ลบได้ -->
                                         </div>
                                     </div>
                                 </div>`;

if (file.includes(settingsSecTarget)) {
    file = file.replace(settingsSecTarget, '');
    console.log("4. Gifts settings section removed successfully!");
} else {
    console.log("4. Gifts settings section target not found!");
}

// 5. Update switchMainTab implementation
const switchTabTarget = `            // Toggle active class on view panels
            document.querySelectorAll('.app-view').forEach(el => el.classList.remove('active'));
            const targetView = document.getElementById(viewName + 'View');
            if (targetView) targetView.classList.add('active');`;

const switchTabReplacement = `            // Toggle active class on view panels
            document.querySelectorAll('.app-view').forEach(el => el.classList.remove('active'));
            const targetView = document.getElementById(viewName + 'View');
            if (targetView) targetView.classList.add('active');
            
            if (viewName === 'gifts') {
                renderGiftDashboard();
            }`;

if (file.includes(switchTabTarget)) {
    file = file.replace(switchTabTarget, switchTabReplacement);
    console.log("5. switchMainTab updated successfully!");
} else {
    console.log("5. switchMainTab target not found!");
}

// Write file back
if (originalLineEndings === '\r\n') {
    file = file.replace(/\n/g, '\r\n');
}
fs.writeFileSync('index.html', file, 'utf8');
console.log("File index.html updated successfully!");
