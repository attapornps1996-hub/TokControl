// dashboard.js - Super Bio Builder PRO Controller















let session = null;







let profile = null;







let activeTab = 'blocks';







let viewsChart = null;







let dragSrcEl = null;















document.addEventListener('DOMContentLoaded', () => {







    try {







        // 1. Auth Guard







        session = window.DB.getCurrentSession();







        if (!session) {







            window.location.href = 'login.html';







            return;







        }















        // 2. Load User Profile & Migrate if old structure







        profile = window.DB.getProfile(session.username);







        if (!profile) {







            if (window.DB && typeof window.DB.ensureTokControlUser === 'function') {
                const boot = window.DB.ensureTokControlUser(session.username, {
                    email: session.email,
                    token: session.token,
                    source: session.source || 'tokcontrol'
                });
                if (boot && boot.success) {
                    session = boot.session || session;
                    profile = window.DB.getProfile(session.username);
                }
            }
            if (!profile) {
                handleLogout();
                return;
            }








        }







        migrateOldProfileIfNeeded();







        if (!profile.widgets) {







            profile.widgets = [];







        }















        // 3. Set User Details







        document.getElementById('mini-username').textContent = `@${session.username}`;







        updateMiniAvatar();















        // 4. Set Iframe preview (src is also set in HTML as fallback)







        const previewFrame = document.getElementById('preview-frame');







        if (previewFrame && !previewFrame.src.includes('mode=preview')) {







            previewFrame.src = `index.html?mode=preview`;







        }















        // 5. Populate Form Settings & Load blocks







        initFormValues();







        initProfileEditor();







        renderBlocks();







        renderWidgets();







        initAnalytics();















        // 6. Sync on Iframe load / handshake







        previewFrame.addEventListener('load', () => {







            sendConfigToPreview();







        });







        window.addEventListener('message', (event) => {







            if (event.data && event.data.type === 'PREVIEW_READY') {







                console.log("Handshake received from preview frame, syncing config...");







                sendConfigToPreview();







            }







        });







        // Also trigger an immediate initial sync in case iframe loaded already







        sendConfigToPreview();







    } catch (err) {







        console.error('Dashboard init error:', err);







        // Still try to load preview even if other things fail







        const previewFrame = document.getElementById('preview-frame');







        if (previewFrame && !previewFrame.src.includes('mode=preview')) {







            previewFrame.src = `index.html?mode=preview`;







        }







    }







});















function handleLogout() {







    window.DB.logout();







    window.location.href = 'login.html';







}















function updateMiniAvatar() {







    const miniAvatar = document.getElementById('mini-avatar');







    const initials = session.username.slice(0, 2).toUpperCase();















    if (profile.profileInfo && profile.profileInfo.avatar) {







        miniAvatar.innerHTML = `<img src="${profile.profileInfo.avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;







    } else {







        const profileBlock = profile.blocks.find(b => b.type === 'profile');







        if (profileBlock && profileBlock.avatar) {







            miniAvatar.innerHTML = `<img src="${profileBlock.avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;







        } else {







            miniAvatar.textContent = initials;







        }







    }







}















// Migrate older profiles that used fixed Links/Socials format







function migrateOldProfileIfNeeded() {







    if (!profile.theme) {







        profile.theme = { preset: 'cyber', custom: {} };







    }







    if (!profile.theme.custom) {







        profile.theme.custom = {};







    }







    if (!profile.blocks) {







        profile.blocks = [];







        // 1. Add Profile block







        profile.blocks.push({







            id: 'block-prof-' + Date.now(),







            type: 'profile',







            displayName: profile.profile?.displayName || session.username,







                        bio: profile.profile?.bio || 'ยินดีต้อนรับสู่หน้า Bio Link ของฉัน!',







            avatar: profile.profile?.avatar || ''







        });















        // 2. Add Social block







        if (profile.socials) {







            profile.blocks.push({







                id: 'block-social-' + Date.now(),







                type: 'social',







                ...profile.socials







            });







        }















        // 3. Add Links







        if (profile.links && profile.links.length > 0) {







            profile.links.forEach((l, idx) => {







                profile.blocks.push({







                    id: `block-link-${idx}-${Date.now()}`,







                    type: 'link',







                    title: l.title,







                    url: l.url,







                    icon: l.icon || 'globe',







                    animation: l.animation || 'none',







                    enabled: l.enabled







                });







            });







        }















        // Save migrated structure







        window.DB.saveProfile(session.username, { blocks: profile.blocks });







    }







}















function switchTab(tabName) {







    activeTab = tabName;















    // Update top-tab active state (used in current HTML)







    document.querySelectorAll('.top-tab').forEach(tab => {







        if (tab.getAttribute('data-tab-header') === tabName || tab.getAttribute('data-tab') === tabName) {







            tab.classList.add('active');







        } else {







            tab.classList.remove('active');







        }







    });







    // Also update sidebar-tab if it exists







    document.querySelectorAll('.sidebar-tab').forEach(tab => {







        if (tab.getAttribute('data-tab') === tabName) {







            tab.classList.add('active');







        } else {







            tab.classList.remove('active');







        }







    });















    document.querySelectorAll('.tab-panel').forEach(panel => {







        if (panel.id === `panel-${tabName}`) {







            panel.classList.add('active');







        } else {







            panel.classList.remove('active');







        }







    });















    if (tabName === 'stats') {







        renderAnalyticsCharts();







    }















    // Re-render blocks every time we switch to blocks tab to ensure it's always fresh







    if (tabName === 'blocks') {







        renderBlocks();







    }







}















function setPreviewDevice(device) {







    const wrapper = document.getElementById('preview-viewport');







    const btnMobile = document.getElementById('btn-view-mobile');







    const btnPc = document.getElementById('btn-view-pc');















    if (device === 'mobile') {







        wrapper.className = 'viewport-mobile';







        btnMobile.classList.add('active');







        btnPc.classList.remove('active');







    } else {







        wrapper.className = 'viewport-pc';







        btnPc.classList.add('active');







        btnMobile.classList.remove('active');







    }







}















// ==========================================







// FORM MANAGEMENT & DESIGN SYNC







// ==========================================















function setElementValue(id, val, prop = 'value') {







    const el = document.getElementById(id);







    if (el) {







        if (prop === 'checked') el.checked = !!val;







        else if (prop === 'textContent') el.textContent = val;







        else el.value = val;







    }







}















function initFormValues() {







    const custom = profile.theme.custom;







    if (!custom) return;















    // Background Panel







    setElementValue('bg-type', custom.backgroundType || 'solid');







    setElementValue('bg-solid-color', custom.backgroundColor || '#0c081e');







    setElementValue('bg-solid-hex', (custom.backgroundColor || '#0c081e').toUpperCase(), 'textContent');







    setElementValue('bg-gradient-select', custom.backgroundGradient || 'linear-gradient(135deg, #0c081e 0%, #170d37 100%)');







    setElementValue('bg-animated-select', custom.backgroundAnimation || 'particles');







    setElementValue('bg-media-url', custom.backgroundImage || '');















    // Style Panel







    setElementValue('btn-color', custom.buttonColor || '#ffffff');







    setElementValue('btn-color-hex', (custom.buttonColor || '#ffffff').toUpperCase(), 'textContent');







    setElementValue('btn-text-color', custom.buttonTextColor || '#000000');







    setElementValue('btn-text-hex', (custom.buttonTextColor || '#000000').toUpperCase(), 'textContent');







    







    setElementValue('btn-radius', custom.buttonBorderRadius || '8');







    setElementValue('btn-radius-val', custom.buttonBorderRadius || '8', 'textContent');







    setElementValue('btn-shadow', custom.buttonShadow || 'none');







    







    setElementValue('font-select', custom.fontFamily || 'Inter');







    setElementValue('custom-css-area', custom.customCss || '');















    // Premium Fusions PRO







    setElementValue('title-effect', custom.titleEffect || 'none');







    setElementValue('verified-badge', custom.verifiedBadge || 'none');







    setElementValue('cursor-effect', custom.cursorEffect || 'none');







    setElementValue('neko-enabled', custom.nekoEnabled || false, 'checked');







    setElementValue('custom-cursor-url', custom.customCursorUrl || '');







    setElementValue('hide-watermark', custom.hideWatermark || false, 'checked');







    setElementValue('global-audio-url', custom.globalAudioUrl || '');







    setElementValue('page-overlay', custom.pageOverlay || 'none');







    setElementValue('tilt-effect', custom.tiltEffect || 'off');







    setElementValue('frame-border', custom.frameBorder || 'none');







    setElementValue('entrance-anim', custom.entranceAnim || 'slide-up');















    // Background Music







    const bgmTitleEl = document.getElementById('bgm-title');







    if (bgmTitleEl && custom.bgmUrl) {







            bgmTitleEl.textContent = custom.bgmName || 'เพลงพื้นหลังที่อัปโหลด';







    }















    // Set Bio Share URL Input







    const bioShareInput = document.getElementById('bio-share-url-input');







    if (bioShareInput && session && session.username) {







        const url = window.location.origin + window.location.pathname.replace('dashboard.html', 'index.html') + '?u=' + session.username;







        bioShareInput.value = url;







    }















    handleBgTypeToggle();







}















function handleBgTypeToggle() {







    const bgTypeEl = document.getElementById('bg-type');







    if (!bgTypeEl) return;







    const bgType = bgTypeEl.value;







    document.getElementById('bg-solid-group').style.display = bgType === 'solid' ? 'block' : 'none';







    document.getElementById('bg-gradient-group').style.display = bgType === 'gradient' ? 'block' : 'none';







    document.getElementById('bg-animated-group').style.display = bgType === 'animated' ? 'block' : 'none';







    document.getElementById('bg-media-group').style.display = bgType === 'media' ? 'block' : 'none';















    updateStylePreview();







}















async function handleBgFileUpload(e) {







    const file = e.target.files[0];







    if (!file) return;















    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {







                showToast('กรุณาเลือกไฟล์ภาพหรือวิดีโอเท่านั้น', true);







        return;







    }















    try {







        const uploadStatus = document.getElementById('bg-upload-status');







                uploadStatus.textContent = '⌛ กำลังอัปโหลด...';







        uploadStatus.style.display = 'block';







        uploadStatus.style.color = 'var(--text-muted)';















        // Save to IndexedDB







        const key = await window.MediaDB.saveMedia(file);







        







        profile.theme.custom.backgroundImage = key;







        







        document.getElementById('bg-type').value = 'media';







                const fileLabel = file.type.startsWith('video/') ? 'อัปโหลดวิดีโอสำเร็จ' : 'อัปโหลดภาพสำเร็จ';







        document.getElementById('bg-media-url').value = key;







        handleBgTypeToggle();







        







                uploadStatus.textContent = `⌛ ${fileLabel}!`;







        uploadStatus.style.color = 'var(--success)';







        setTimeout(() => { uploadStatus.style.display = 'none'; }, 3000);







        







        updateStylePreview();







    } catch (err) {







                showToast('เกิดข้อผิดพลาดในการบันทึกไฟล์: ' + err, true);







        document.getElementById('bg-upload-status').style.display = 'none';







    }







}























async function uploadBlockMedia(inputElement, targetInputSelector) {







    const file = inputElement.files[0];







    if (!file) return;















    try {







        const key = await window.MediaDB.saveMedia(file);







        const card = inputElement.closest('.block-card');







        if (card) {







            const targetInput = card.querySelector(targetInputSelector);







            if (targetInput) {







                targetInput.value = key;







                saveAllBlocksInputs();







                updateStylePreview();







            }







        }







    } catch (err) {







                showToast('อัปโหลดไฟล์ล้มเหลว: ' + err, true);







    }







}























// Grid preset selection handler







function selectGridPreset(cardEl, blockId) {







    const grid = cardEl.closest('.link-layout-grid');







    const hiddenInput = cardEl.closest('.form-group').querySelector('.input-grid-preset');







    







    // Remove active from all cards







    grid.querySelectorAll('.link-layout-card').forEach(c => c.classList.remove('active'));







    cardEl.classList.add('active');







    







    // Update hidden input







    if (hiddenInput) {







        hiddenInput.value = cardEl.dataset.preset;







    }







    







    // Save current inputs first, update preset, then re-render







    saveAllBlocksInputs();







    







    // Update slot count for new preset







    const block = profile.blocks.find(b => b.id === blockId);







    if (block) {







        const presetSlotCounts = { 'A': 4, 'B': 3, 'C': 3, 'D': 2, 'E': 3, 'F': 3 };







        block.preset = cardEl.dataset.preset;







        const needed = presetSlotCounts[block.preset] || 3;







        if (!block.slots) block.slots = [];







        while (block.slots.length < needed) {







            block.slots.push({ title: '', url: '', bgImage: '' });







        }







    }







    







    // Re-render to show correct number of slot editors







    renderBlocks();







    sendConfigToPreview();







}















// Visual layout card selection handler







function selectLinkLayout(cardEl) {







    const grid = cardEl.closest('.link-layout-grid');







    const hiddenInput = cardEl.closest('.form-group').querySelector('.input-link-layout');







    







    // Remove active from all cards in this grid







    grid.querySelectorAll('.link-layout-card').forEach(c => c.classList.remove('active'));







    







    // Set active on clicked card







    cardEl.classList.add('active');







    







    // Update hidden input value







    if (hiddenInput) {







        hiddenInput.value = cardEl.dataset.layout;







    }







    







    // Trigger save & preview







    updateStylePreview();







}















function updateStylePreview() {







    saveAllBlocksInputs();







    window.DB.saveProfile(session.username, profile);







    sendConfigToPreview();







}















function saveProfileConfiguration() {







    window.DB.saveProfile(session.username, profile);







    updateMiniAvatar();







        showToast('บันทึกการตั้งค่าทั้งหมดเรียบร้อยแล้ว!');







}















function applyHeaderPreset(presetKey) {







    const presets = window.DB.getThemePresets();







    const selected = presets[presetKey];







    if (!selected) return;















    profile.theme.preset = presetKey;







    profile.theme.custom = { ...selected };







    







    initFormValues();







    updateStylePreview();







        showToast(`เปลี่ยนดีไซน์เป็นธีม: ${selected.name}`);







}















function triggerMagicRandomizer() {







    const randTheme = window.DB.generateRandomTheme();







    profile.theme.preset = 'custom';







    profile.theme.custom = randTheme;















    initFormValues();







    updateStylePreview();







        showToast('สุ่มปรับแต่งดีไซน์เสร็จเรียบร้อย! 🎨');







}























// ==========================================







// MODULAR BLOCK RENDERER & LOGIC







// ==========================================















window.addTrackToAlbum = function(blockId) {







    const container = document.getElementById('tracks-container-' + blockId);







    if (!container) return;







    const div = document.createElement('div');







    div.className = 'album-track-item';







    div.style = 'display:flex; gap:10px; margin-bottom: 5px;';







    div.innerHTML = `







                <input type="text" class="form-control track-title" placeholder="ชื่อเพลง" oninput="updateStylePreview()">







        <div style="display:flex; gap:5px; flex-grow:1;">







                        <input type="url" class="form-control track-url" placeholder="URL เพลง / Upload" oninput="updateStylePreview()">







            <input type="file" accept="audio/*" style="width:50px; padding:2px;" onchange="uploadBlockMedia(this, '.track-url')">







        </div>







    `;







    container.appendChild(div);







    updateStylePreview();







};















function addNewBlock(type) {







    try {







        const id = 'block-' + type + '-' + Date.now();







        let newBlock = { id, type };















        // Set templates







        if (type === 'profile') {







                        newBlock.displayName = 'ชื่อของคุณ';







                        newBlock.bio = 'อธิบายตัวตนหรือประวัติย่อของคุณ';







            newBlock.avatar = '';







        } else if (type === 'link') {







                        newBlock.title = 'ลิงก์ของฉัน';







            newBlock.url = 'https://example.com';







            newBlock.icon = 'globe';







            newBlock.animation = 'none';







            newBlock.enabled = true;















} else if (type === 'image') {







            newBlock.layout = 'single';







            newBlock.imgUrl1 = '';







            newBlock.linkUrl1 = '';







            newBlock.imgUrl2 = '';







            newBlock.linkUrl2 = '';







        } else if (type === 'youtube') {







            newBlock.videoId = '';







        } else if (type === 'social') {







            newBlock.facebook = '';







            newBlock.instagram = '';







            newBlock.tiktok = '';







            newBlock.youtube = '';







            newBlock.line = '';







            newBlock.github = '';







        } else if (type === 'music') {







                        newBlock.title = 'เพลงโปรดของฉัน';







            newBlock.url = '';







            newBlock.sourceType = 'audio';







        } else if (type === 'album') {







                        newBlock.title = 'อัลบั้มใหม่';







                        newBlock.artist = 'ชื่อศิลปิน';







            newBlock.coverUrl = '';







            newBlock.tracks = [{ title: 'Track 1', url: '' }, { title: 'Track 2', url: '' }];







        } else if (type === 'text') {







                        newBlock.content = 'ข้อความของคุณ...';







            newBlock.textColor = '#ffffff';







            newBlock.alignment = 'center';







            newBlock.fontSize = 'medium';







        } else if (type === 'spacer') {







            newBlock.height = 20;







        } else if (type === 'linkgrid') {







            newBlock.preset = 'preset1';







            newBlock.slots = [







                                { title: 'ลิงก์ 1', subtitle: 'ข้อความหลักและรอง', url: 'https://example.com', bgImage: '' },







                                { title: 'ลิงก์ 2', subtitle: '', url: 'https://example.com', bgImage: '' },







                                { title: 'ลิงก์ 3', subtitle: '', url: 'https://example.com', bgImage: '' },







                                { title: 'ลิงก์ 4', subtitle: '', url: 'https://example.com', bgImage: '' }







            ];







        }















        if (!profile.blocks || !Array.isArray(profile.blocks)) {







            profile.blocks = [];







        }







        profile.blocks.push(newBlock);







        renderBlocks();







        sendConfigToPreview();







        







        setTimeout(() => {







            const list = document.getElementById('blocks-list-container');







            if (list && list.lastElementChild) {







                list.lastElementChild.scrollIntoView({ behavior: 'smooth' });







            }







        }, 100);







                showToast('เพิ่มบล็อกสำเร็จ!');







    } catch (e) {







        console.error(e);







                showToast('เกิดข้อผิดพลาดในการเพิ่มบล็อก', true);







    }







}















function deleteBlock(id) {







        if(confirm('คุณแน่ใจหรือไม่ว่าต้องการลบบล็อกนี้?')) {







        profile.blocks = profile.blocks.filter(b => b.id !== id);







        renderBlocks();







        sendConfigToPreview();







                showToast('ลบบล็อกเรียบร้อย');







    }







}















function openPublicProfile() {







    if (session && session.username) {







        window.open(`index.html?u=${session.username}`, '_blank');







    } else {







                alert('กรุณาเข้าสู่ระบบก่อน');







    }







}















function copyBioLink() {







    if (session && session.username) {







        const url = window.location.origin + window.location.pathname.replace('dashboard.html', 'index.html') + '?u=' + session.username;







        







        // Copy to clipboard







        navigator.clipboard.writeText(url).then(() => {







                        showToast('บันทึกและคัดลอกลิงก์โปรไฟล์สำเร็จ! สามารถนำไปวางได้ทันที');







        }).catch(err => {







            // Fallback for non-secure contexts







            const el = document.createElement('textarea');







            el.value = url;







            document.body.appendChild(el);







            el.select();







            document.execCommand('copy');







            document.body.removeChild(el);







                        showToast('บันทึกและคัดลอกลิงก์โปรไฟล์สำเร็จ! สามารถนำไปวางได้ทันที');







        });







    } else {







                showToast('กรุณาเข้าสู่ระบบก่อน', true);







    }







}















function renderBlocks() {
const container = document.getElementById('blocks-list-container');
container.innerHTML = '';

if (profile.blocks.length === 0) {
container.innerHTML = `
<div style="text-align:center; padding: 40px 10px; color: var(--text-muted);">
<i class="fa-solid fa-folder-open" style="font-size:2.5rem; margin-bottom:12px; opacity:0.3;"></i>
<p>หน้า Bio ของคุณยังไม่มีบล็อกข้อมูล คลิกเพิ่มด้านล่าง</p>
</div>
`;
return;
}

const typeMeta = {
profile: { icon: 'fa-solid fa-user', name: 'โปรไฟล์ผู้ใช้' },
link: { icon: 'fa-solid fa-link', name: 'ปุ่มลิงก์มาตรฐาน' },
youtube: { icon: 'fa-brands fa-youtube', name: 'วิดีโอ YouTube' },
image: { icon: 'fa-solid fa-image', name: 'รูปภาพ' },
social: { icon: 'fa-solid fa-share-nodes', name: 'โซเชียลมีเดีย' },
music: { icon: 'fa-solid fa-music', name: 'เครื่องเล่นเพลง' },
album: { icon: 'fa-solid fa-compact-disc', name: 'อัลบั้มเพลง' },
text: { icon: 'fa-solid fa-align-left', name: 'ข้อความ' },
spacer: { icon: 'fa-solid fa-arrows-up-down', name: 'ช่องว่าง/ขึ้นบรรทัดใหม่' },
linkgrid: { icon: 'fa-solid fa-grip', name: 'บล็อกกลุ่มลิงก์ (Link Grid)' }
};

profile.blocks.forEach((block, idx) => {
try {
const meta = typeMeta[block.type] || { icon: 'fa-solid fa-box', name: 'บล็อก' };
const card = document.createElement('div');
card.className = 'block-card';
card.id = `card-${block.id}`;
card.setAttribute('draggable', 'true');
card.setAttribute('data-id', block.id);
card.setAttribute('data-index', idx);

// Card Header
const header = document.createElement('div');
header.className = 'block-card-header';
header.innerHTML = `
<div class="block-drag-handle"><i class="fa-solid fa-grip-vertical"></i></div>
<i class="block-icon ${meta.icon}"></i>
<span class="block-title">${meta.name}</span>
<div class="block-actions">
<button class="icon-btn delete-btn" onclick="deleteBlock('${block.id}')" title="ลบบล็อก"><i class="fa-solid fa-trash-can"></i></button>
</div>
`;
card.appendChild(header);

// Card Body with Inline Inputs
const body = document.createElement('div');
body.className = 'block-card-body';

if (block.type === 'profile') {
body.innerHTML = `
<div class="form-group" style="display:flex; align-items:center; gap:20px;">
<img id="avatar-preview-${block.id}" src="${block.avatar || 'css/public.css'}" onerror="this.style.display='none'" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border:2px solid var(--border-color);" />
<div>
<input type="file" id="av-file-${block.id}" style="display:none;" onchange="handleAvatarUpload(event, '${block.id}')">
<button type="button" class="form-control" style="padding: 6px 12px; font-size:0.8rem; background-color:rgba(255,255,255,0.03); cursor:pointer;" onclick="document.getElementById('av-file-${block.id}').click()">อัปโหลดรูปภาพโปรไฟล์</button>
</div>
</div>
<div class="form-group">
<label>ชื่อแสดงหน้าโปรไฟล์ (Display Name)</label>
<input type="text" class="form-control input-display-name" value="${block.displayName || ''}" oninput="updateStylePreview()">
</div>
<div class="form-group">
<label>คำแนะนำตัวสั้นๆ (Bio)</label>
<textarea class="form-control input-bio" oninput="updateStylePreview()">${block.bio || ''}</textarea>
</div>
`;
} else if (block.type === 'link') {
body.innerHTML = `
<div class="row-grid">
<div class="form-group">
<label>ข้อความบนปุ่ม (Title)</label>
<input type="text" class="form-control input-link-title" value="${block.title || ''}" placeholder="เช่น My Website" oninput="updateStylePreview()">
</div>
<div class="form-group">
<label>คำอธิบายสั้นๆ (Description)</label>
<input type="text" class="form-control input-link-desc" value="${block.description || ''}" placeholder="เช่น คลิกเพื่อดูรายละเอียด" oninput="updateStylePreview()">
</div>
</div>
<div class="form-group">
<label>ลิงก์ปลายทาง (URL)</label>
<input type="url" class="form-control input-link-url" value="${block.url || ''}" placeholder="https://..." oninput="updateStylePreview()">
</div>

<div class="row-grid">
<div class="form-group">
<label>ไอคอนด้านซ้าย (FontAwesome หรืออัปโหลดรูป)</label>
<div style="display:flex; gap:10px;"><input type="text" class="form-control input-link-left-icon" value="${block.customIconUrl || block.icon || ''}" placeholder="fa-solid fa-globe หรืออัปโหลด..." oninput="updateStylePreview()"><input type="file" accept="image/*" style="width:100px; padding:6px;" onchange="uploadBlockMedia(this, '.input-link-left-icon')"></div>
</div>
<div class="form-group">
<label>ไอคอนด้านขวา (FontAwesome หรืออัปโหลดรูป)</label>
<div style="display:flex; gap:10px;"><input type="text" class="form-control input-link-right-icon" value="${block.rightIconUrl || ''}" placeholder="fa-solid fa-arrow-right หรืออัปโหลด..." oninput="updateStylePreview()"><input type="file" accept="image/*" style="width:100px; padding:6px;" onchange="uploadBlockMedia(this, '.input-link-right-icon')"></div>
</div>
</div>

<div class="row-grid">
<div class="form-group">
<label>แอนิเมชันของปุ่ม</label>
<select class="form-control input-link-anim" onchange="updateStylePreview()">
<option value="none" ${block.animation==='none'?'selected':''}>ไม่มี (None)</option>
<option value="pulse" ${block.animation==='pulse'?'selected':''}>ชีพจร (Pulse)</option>
<option value="bounce" ${block.animation==='bounce'?'selected':''}>เด้ง (Bounce)</option>
<option value="wobble" ${block.animation==='wobble'?'selected':''}>ส่าย (Wobble)</option>
</select>
</div>
<div class="form-group">
<label>เลย์เอาต์ไอคอน</label>
<select class="form-control input-link-layout" onchange="updateStylePreview()">
<option value="classic" ${block.layout==='classic'?'selected':''}>คลาสสิก (ไอคอนชิดขอบ)</option>
<option value="compact" ${block.layout==='compact'?'selected':''}>คอมแพค (ไอคอนชิดข้อความ)</option>
</select>
</div>
</div>

<div class="row-grid" style="align-items: center;">
<div class="form-group" style="margin-bottom:0;">
<label>เปิดใช้งานปุ่มนี้</label>
<div style="margin-top: 5px;">
<label class="toggle-switch">
<input type="checkbox" class="input-link-enabled" ${block.enabled !== false ? 'checked' : ''} onchange="updateStylePreview()">
<span class="slider round"></span>
</label>
</div>
</div>

</div>
`;
} else if (block.type === 'image') {
const isDouble = block.layout === 'double';
body.innerHTML = `
<div class="form-group">
<label>ประเภทการจัดวางภาพ</label>
<select class="form-control input-img-layout" onchange="toggleImageLayoutCard('${block.id}', this.value)">
        <option value="single" ${block.layout==='single'?'selected':''}>รูปเดี่ยวแนวตั้ง / แบนเนอร์ (Single Image)</option>
<option value="double" ${block.layout==='double'?'selected':''}>รูปคู่วางขนานซ้ายขวา (Double Image Grid)</option>
</select>
</div>
<div class="row-grid">
<div class="form-group">
<label>URL รูปภาพที่ 1</label>
<div style="display:flex; gap:10px;"><input type="url" class="form-control input-img-url1" value="${block.imgUrl1 || ''}" oninput="updateStylePreview()"><input type="file" accept="image/*,video/mp4,video/webm" style="width:100px; padding:6px;" onchange="uploadBlockMedia(this, '.input-img-url1')"></div>
</div>
<div class="form-group">
<label>ลิงก์เมื่อคลิกรูปที่ 1</label>
<input type="url" class="form-control input-img-link1" value="${block.linkUrl1 || ''}" oninput="updateStylePreview()">
</div>
</div>
<div class="row-grid" id="img-group-2-${block.id}" style="display: ${isDouble ? 'grid' : 'none'};">
<div class="form-group">
<label>URL รูปภาพที่ 2</label>
<div style="display:flex; gap:10px;"><input type="url" class="form-control input-img-url2" value="${block.imgUrl2 || ''}" oninput="updateStylePreview()"><input type="file" accept="image/*,video/mp4,video/webm" style="width:100px; padding:6px;" onchange="uploadBlockMedia(this, '.input-img-url2')"></div>
</div>
<div class="form-group">
<label>ลิงก์เมื่อคลิกรูปที่ 2</label>
<input type="url" class="form-control input-img-link2" value="${block.linkUrl2 || ''}" oninput="updateStylePreview()">
</div>
</div>
`;
} else if (block.type === 'youtube') {
body.innerHTML = `
<div class="form-group">
<label>ลิงก์วิดีโอหรือรหัสคลิป YouTube (Video URL / ID)</label>
<input type="text" class="form-control input-yt-id" value="${block.videoId || ''}" placeholder="เช่น https://www.youtube.com/watch?v=dQw4w9WgXcQ" oninput="updateStylePreview()">
</div>
`;
} else if (block.type === 'social') {
body.innerHTML = `
<div class="row-grid">
<div class="form-group">
<label><i class="fa-brands fa-facebook"></i> Facebook Link</label>
<input type="url" class="form-control input-soc-fb" value="${block.facebook || ''}" oninput="updateStylePreview()">
</div>
<div class="form-group">
<label><i class="fa-brands fa-instagram"></i> Instagram Link</label>
<input type="url" class="form-control input-soc-ig" value="${block.instagram || ''}" oninput="updateStylePreview()">
</div>
</div>
<div class="row-grid">
<div class="form-group">
<label><i class="fa-brands fa-tiktok"></i> TikTok Link</label>
<input type="url" class="form-control input-soc-tk" value="${block.tiktok || ''}" oninput="updateStylePreview()">
</div>
<div class="form-group">
<label><i class="fa-brands fa-youtube"></i> YouTube Channel</label>
<input type="url" class="form-control input-soc-yt" value="${block.youtube || ''}" oninput="updateStylePreview()">
</div>
</div>
<div class="row-grid">
<div class="form-group">
<label><i class="fa-brands fa-line"></i> Line Link / ID</label>
<input type="text" class="form-control input-soc-line" value="${block.line || ''}" oninput="updateStylePreview()">
</div>
<div class="form-group">
<label><i class="fa-brands fa-github"></i> GitHub Profile</label>
<input type="url" class="form-control input-soc-git" value="${block.github || ''}" oninput="updateStylePreview()">
</div>
</div>
`;
} else if (block.type === 'music') {
body.innerHTML = `
<div class="form-group">
<label>ชื่อเพลง / คำอธิบายเพลง</label>
<input type="text" class="form-control input-music-title" value="${block.title || ''}" oninput="updateStylePreview()">
</div>
<div class="row-grid">
<div class="form-group">
<label>ประเภทไฟล์เพลง / เครื่องเล่น</label>
<select class="form-control input-music-source" onchange="toggleMusicSourcePlaceholder('${block.id}', this.value)">
<option value="audio" ${block.sourceType==='audio'?'selected':''}>ลิงก์เสียงตรง (.mp3 / .ogg / .wav)</option>
<option value="spotify" ${block.sourceType==='spotify'?'selected':''}>รหัสฝังอัลบั้ม/เพลง Spotify (Spotify Embed Link)</option>
</select>
</div>
<div class="form-group">
<label id="music-url-label-${block.id}">URL ลิงก์ไฟล์เพลง (.mp3)</label>
<div style="display:flex; gap:10px;"><input type="text" class="form-control input-music-url" value="${block.url || ''}" placeholder="URL หรืออัปโหลดไฟล์เสียง..." oninput="updateStylePreview()"><input type="file" accept="audio/*" style="width:100px; padding:6px;" onchange="uploadBlockMedia(this, '.input-music-url')"></div><small style="color:var(--text-muted);">อัปโหลดไฟล์ .mp3 / .wav หรือใส่ลิงก์ Spotify</small>
</div>
</div>
`;
} else if (block.type === 'text') {
body.innerHTML = `
<div class="form-group">
<label>ข้อความที่ต้องการแสดง</label>
<textarea class="form-control input-text-content" style="min-height: 80px;" oninput="updateStylePreview()">${block.content || ''}</textarea>
</div>
<div class="row-grid">
<div class="form-group">
<label>สีข้อความ (เลือกได้)</label>
<input type="color" class="form-control input-text-color" style="padding: 2px; height: 38px;" value="${block.textColor || '#ffffff'}" oninput="updateStylePreview()">
</div>
<div class="form-group">
<label>การจัดตำแหน่ง</label>
<select class="form-control input-text-align" onchange="updateStylePreview()">
<option value="left" ${block.alignment === 'left' ? 'selected' : ''}>ชิดซ้าย (Left)</option>
<option value="center" ${block.alignment === 'center' || !block.alignment ? 'selected' : ''}>กึ่งกลาง (Center)</option>
<option value="right" ${block.alignment === 'right' ? 'selected' : ''}>ชิดขวา (Right)</option>
<option value="justify" ${block.alignment === 'justify' ? 'selected' : ''}>เต็มกรอบ (Justify)</option>
</select>
</div>
<div class="form-group">
<label>ขนาดตัวอักษร</label>
<select class="form-control input-text-size" onchange="updateStylePreview()">
<option value="small" ${block.fontSize === 'small' ? 'selected' : ''}>เล็ก (Small)</option>
<option value="medium" ${block.fontSize === 'medium' || !block.fontSize ? 'selected' : ''}>กลาง (Medium)</option>
<option value="large" ${block.fontSize === 'large' ? 'selected' : ''}>ใหญ่ (Large)</option>
</select>
</div>
</div>
`;
} else if (block.type === 'spacer') {
body.innerHTML = `
<div class="form-group">
<label>ความสูงของช่องว่าง (<span id="spacer-val-${block.id}">${block.height}</span>px)</label>
<input type="range" class="form-control input-spacer-height" min="5" max="100" value="${block.height || 20}" style="padding:0; height:8px;" oninput="document.getElementById('spacer-val-${block.id}').textContent=this.value; updateStylePreview();">
</div>
`;
} else if (block.type === 'album') {
body.innerHTML = `
<div class="row-grid">
<div class="form-group">
<label>ชื่ออัลบั้ม</label>
<input type="text" class="form-control input-album-title" value="${block.title || ''}" oninput="updateStylePreview()">
</div>
<div class="form-group">
<label>ชื่อศิลปิน</label>
<input type="text" class="form-control input-album-artist" value="${block.artist || ''}" oninput="updateStylePreview()">
</div>
</div>
<div class="form-group">
<label>หน้าปกอัลบั้ม (URL หรืออัปโหลดภาพ)</label>
<div style="display:flex; gap:10px;">
<input type="text" class="form-control input-album-cover" value="${block.coverUrl || ''}" placeholder="https://.../cover.jpg" oninput="updateStylePreview()">
<input type="file" accept="image/*" style="width:100px; padding:6px;" onchange="uploadBlockMedia(this, '.input-album-cover')">
</div>
</div>
<div class="form-group">
<label>รายชื่อเพลง (คั่นด้วยลูกน้ำ ",")</label>
<textarea class="form-control input-album-tracks" placeholder="Track 1, Track 2, Track 3..." oninput="updateStylePreview()">${block.tracks ? block.tracks.map(t => t.title).join(', ') : ''}</textarea>
<small style="color:var(--text-muted);">* ระบบนี้เป็นอัลบั้มจำลอง (Mockup) สำหรับแสดงรายชื่อเพลงเท่านั้น ยังไม่สามารถเล่นเพลงแยกรายแทร็กได้ในเวอร์ชันปัจจุบัน</small>
</div>
`;
} else if (block.type === 'linkgrid') {
    if (!block.slots) block.slots = [];
    while (block.slots.length < 4) {
        block.slots.push({ title: 'ลิงก์ ' + (block.slots.length + 1), subtitle: '', url: 'https://example.com', bgImage: '', titleColor: '#ffffff' });
    }
    
    let slotsHtml = '';
    for (let i = 0; i < 4; i++) {
        slotsHtml += `
        <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 10px; background: rgba(0,0,0,0.02);">
            <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 8px; color: var(--text);">ช่องที่ ${i + 1}</div>
            <div class="row-grid">
                <div class="form-group">
                    <label>ข้อความปุ่ม (Title)</label>
                    <input type="text" class="form-control input-slot-title-${i}" value="${block.slots[i]?.title || ''}" placeholder="เช่น Instagram" oninput="updateStylePreview()">
                </div>
                <div class="form-group">
                    <label>คำอธิบายรอง (Subtitle)</label>
                    <input type="text" class="form-control input-slot-subtitle-${i}" value="${block.slots[i]?.subtitle || ''}" placeholder="เช่น ติดตามเรา" oninput="updateStylePreview()">
                </div>
            </div>
            <div class="form-group">
                <label>ลิงก์ปลายทาง (URL)</label>
                <input type="url" class="form-control input-slot-url-${i}" value="${block.slots[i]?.url || ''}" placeholder="https://..." oninput="updateStylePreview()">
            </div>
            <div class="row-grid">
                <div class="form-group">
                    <label>สีข้อความปุ่ม</label>
                    <input type="color" class="form-control input-slot-color-${i}" value="${block.slots[i]?.titleColor || '#ffffff'}" oninput="updateStylePreview()" style="padding:2px; height:38px;">
                </div>
                <div class="form-group">
                    <label>รูปพื้นหลังช่อง (URL หรืออัปโหลด)</label>
                    <div style="display:flex; gap:10px;">
                        <input type="text" class="form-control input-slot-bg-${i}" value="${block.slots[i]?.bgImage || ''}" placeholder="https://..." oninput="updateStylePreview()">
                        <input type="file" accept="image/*" style="width:100px; padding:6px;" onchange="uploadSlotBgImage(this, '${block.id}', ${i})">
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    body.innerHTML = `
    <div class="form-group">
        <label>รูปแบบการจัดวาง (Grid Preset)</label>
        <select class="form-control input-linkgrid-preset" onchange="changeLinkGridPreset('${block.id}', this.value)">
            <option value="preset1" ${block.preset==='preset1'?'selected':''}>แบบที่ 1 (3 ลิงก์: บน 1 ล่าง 2)</option>
            <option value="preset2" ${block.preset==='preset2'?'selected':''}>แบบที่ 2 (3 ลิงก์: ซ้าย 1 ขวา 2)</option>
            <option value="preset3" ${block.preset==='preset3'?'selected':''}>แบบที่ 3 (4 ลิงก์: ตาราง 2x2)</option>
            <option value="preset4" ${block.preset==='preset4'?'selected':''}>แบบที่ 4 (2 ลิงก์: ขนานซ้ายขวา)</option>
            <option value="preset5" ${block.preset==='preset5'?'selected':''}>แบบที่ 5 (3 ลิงก์: คอลัมน์เดี่ยวแนวตั้ง)</option>
        </select>
    </div>
    <div class="slots-container" style="margin-top: 15px;">
        <label style="font-weight: 600; margin-bottom: 10px; display: block;">ข้อมูลแต่ละช่อง (Grid Slots)</label>
        ${slotsHtml}
    </div>
    `;
}

card.appendChild(body);
setupDragEvents(card);
container.appendChild(card);
} catch (e) { console.error(e); container.innerHTML += `<div style="color:red; padding:10px; background:#fff; border:1px solid red; margin-bottom:10px;">Error in block ${block.type}: ${e.message}</div>`; }
});
}

function saveAllBlocksInputs() {







    try {







        if (!profile.blocks) return;







        







        profile.blocks.forEach((block) => {







            const card = document.getElementById('card-' + block.id);







            if (!card) return;







            







            if (block.type === 'profile') {







                block.avatar = card.querySelector('.input-avatar-url')?.value || '';







                block.displayName = card.querySelector('.input-display-name')?.value || '';







                block.bio = card.querySelector('.input-bio')?.value || '';







            } else if (block.type === 'link') {







                block.title = card.querySelector('.input-title')?.value || '';







                block.url = card.querySelector('.input-url')?.value || '';







                block.customIconUrl = card.querySelector('.input-left-icon')?.value || '';







                block.rightIconUrl = card.querySelector('.input-right-icon')?.value || '';







                block.layout = card.querySelector('.input-link-layout')?.value || '100';







                block.animation = card.querySelector('.input-anim')?.value || 'none';







                block.enabled = card.querySelector('.input-enabled')?.value !== 'false';







            } else if (block.type === 'image') {







                block.layout = card.querySelector('.input-img-layout')?.value || 'single';







                block.imgUrl1 = card.querySelector('.input-img-url1')?.value || '';







                block.linkUrl1 = card.querySelector('.input-img-link1')?.value || '';







                block.imgUrl2 = card.querySelector('.input-img-url2')?.value || '';







                block.linkUrl2 = card.querySelector('.input-img-link2')?.value || '';







            } else if (block.type === 'youtube') {







                block.videoId = card.querySelector('.input-yt-id')?.value || '';







            } else if (block.type === 'social') {







                block.facebook = card.querySelector('.input-facebook')?.value || '';







                block.instagram = card.querySelector('.input-instagram')?.value || '';







                block.tiktok = card.querySelector('.input-tiktok')?.value || '';







                block.youtube = card.querySelector('.input-youtube')?.value || '';







                block.line = card.querySelector('.input-line')?.value || '';







                block.github = card.querySelector('.input-github')?.value || '';







            } else if (block.type === 'music') {







                block.title = card.querySelector('.input-music-title')?.value || '';







                block.url = card.querySelector('.input-music-url')?.value || '';







            } else if (block.type === 'album') {







                block.title = card.querySelector('.input-album-title')?.value || '';







                block.artist = card.querySelector('.input-album-artist')?.value || '';







                block.coverUrl = card.querySelector('.input-album-cover')?.value || '';







            } else if (block.type === 'text') {







                block.content = card.querySelector('.input-text-content')?.value || '';







                block.textColor = card.querySelector('.input-text-color')?.value || '#ffffff';







                block.alignment = card.querySelector('.input-text-align')?.value || 'center';







            } else if (block.type === 'spacer') {







                block.height = card.querySelector('.input-spacer-height')?.value || 20;







            } else if (block.type === 'linkgrid') {







                block.preset = card.querySelector('.input-linkgrid-preset')?.value || 'preset1';







                if (!block.slots) block.slots = [];







                for (let i = 0; i < 4; i++) {







                    if (!block.slots[i]) {







                        block.slots[i] = { title: '', subtitle: '', url: '', bgImage: '', titleColor: '#ffffff' };







                    }







                    const titleEl = card.querySelector(`.input-slot-title-${i}`);







                    const subtitleEl = card.querySelector(`.input-slot-subtitle-${i}`);







                    const urlEl = card.querySelector(`.input-slot-url-${i}`);







                    const bgEl = card.querySelector(`.input-slot-bg-${i}`);







                    const colorEl = card.querySelector(`.input-slot-color-${i}`);







                    







                    if (titleEl) block.slots[i].title = titleEl.value;







                    if (subtitleEl) block.slots[i].subtitle = subtitleEl.value;







                    if (urlEl) block.slots[i].url = urlEl.value;







                    if (bgEl) block.slots[i].bgImage = bgEl.value;







                    if (colorEl) block.slots[i].titleColor = colorEl.value;







                }







            }







        });







        







        saveProfileConfiguration();







        sendConfigToPreview();







    } catch(e) {







        console.error('Error saving blocks', e);







    }







}























function setupDragEvents(el) {







    el.addEventListener('dragstart', handleDragStart, false);







    el.addEventListener('dragenter', handleDragEnter, false);







    el.addEventListener('dragover', handleDragOver, false);







    el.addEventListener('dragleave', handleDragLeave, false);







    el.addEventListener('drop', handleDrop, false);







    el.addEventListener('dragend', handleDragEnd, false);







}















function handleDragStart(e) {







    this.style.opacity = '0.4';







    dragSrcEl = this;







    e.dataTransfer.effectAllowed = 'move';







    e.dataTransfer.setData('text/html', this.innerHTML);







}















function handleDragOver(e) {







    if (e.preventDefault) e.preventDefault();







    e.dataTransfer.dropEffect = 'move';







    this.classList.add('drag-over');







    return false;







}















function handleDragEnter(e) {







    this.classList.add('drag-over');







}















function handleDragLeave(e) {







    this.classList.remove('drag-over');







}















function handleDrop(e) {







    if (e.stopPropagation) e.stopPropagation();















    if (dragSrcEl !== this) {







        // Collect current inputs first so we don't lose typed text during drag







        saveAllBlocksInputs();















        const fromIndex = parseInt(dragSrcEl.getAttribute('data-index'));







        const toIndex = parseInt(this.getAttribute('data-index'));















        const temp = profile.blocks[fromIndex];







        profile.blocks.splice(fromIndex, 1);







        profile.blocks.splice(toIndex, 0, temp);















        renderBlocks();







        sendConfigToPreview();







                showToast('สลับตำแหน่งเรียบร้อย!');







    }







    return false;







}















function handleDragEnd(e) {







    this.style.opacity = '1';







    document.querySelectorAll('.block-card').forEach(c => {







        c.classList.remove('drag-over');







    });







}























// ==========================================







// TAB 4: ANALYTICS & STATS







// ==========================================































function showToast(message, isError = false) {







    const toast = document.getElementById('toast-bar');







    const toastText = document.getElementById('toast-bar-text');















    toastText.textContent = message;







    if (isError) {







        toast.style.background = 'var(--danger)';







        toast.querySelector('i').className = 'fa-solid fa-circle-exclamation';







    } else {







        toast.style.background = 'var(--success)';







        toast.querySelector('i').className = 'fa-solid fa-circle-check';







    }















    toast.classList.add('show');







    setTimeout(() => {







        toast.classList.remove('show');







    }, 2500);







}















function sendConfigToPreview() {







    const frame = document.getElementById('preview-frame');







    if (frame && frame.contentWindow) {







        frame.contentWindow.postMessage({







            type: 'UPDATE_BIOLINK_PREVIEW',







            data: {







                username: session.username,







                blocks: profile.blocks,







                theme: profile.theme,







                profileInfo: profile.profileInfo,







                widgets: profile.widgets || []







            }







        }, '*');







    }







}























// ==========================================







// EXPORT STATIC HTML FILE (SINGLE FILE BUNDLER)







// ==========================================















function triggerExportHTML() {







    saveAllBlocksInputs();















    // Fetch dependencies stylesheets and render scripts







    const configStr = JSON.stringify({







        username: session.username,







        blocks: profile.blocks,







        theme: profile.theme







    });















    // Create inline template HTML structure







    const bundleHtml = `<!DOCTYPE html>







<html lang="th">







<head>







    <meta charset="UTF-8">







    <meta name="viewport" content="width=device-width, initial-scale=1.0">







    <title>Bio Link | @${session.username}</title>







    







    <!-- External Font CDN & Icons -->







    <link rel="preconnect" href="https://fonts.googleapis.com">







    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>







    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&family=Prompt:wght@300;400;500;600;700&family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">







    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">







    







    <!-- Inline CSS Stylesheet -->







    <style>







        :root {







            --primary: #6c5ce7;







            --primary-light: #a29bfe;







            --text-color: #ffffff;







            --bg-color: #0c081e;







            --button-bg: rgba(255, 255, 255, 0.1);







            --button-text: #ffffff;







            --button-radius: 8px;







            --button-shadow: none;







            --font-family: 'Outfit', sans-serif;







        }







        * { margin: 0; padding: 0; box-sizing: border-box; }







        body {







            min-height: 100vh;







            width: 100%;







            color: var(--text-color);







            background-color: var(--bg-color);







            font-family: var(--font-family);







            position: relative;







            overflow-y: auto;







            display: flex;







            justify-content: center;







            align-items: flex-start;







            padding: 40px 20px;







            z-index: 1;







        }







        #bg-canvas {







            position: fixed;







            top: 0; left: 0;







            width: 100%; height: 100%;







            z-index: -1;







            pointer-events: none;







        }







        .video-bg {







            position: fixed;







            top: 0; left: 0;







            width: 100%; height: 100%;







            z-index: -2;







            object-fit: cover;







            pointer-events: none;







        }







        .gif-bg {







            position: fixed;







            top: 0; left: 0;







            width: 100%; height: 100%;







            z-index: -2;







            background-size: cover;







            background-position: center;







            pointer-events: none;







        }







        .bio-container {







            width: 100%;







            max-width: 580px;







            margin: 0 auto;







            display: flex;







            flex-direction: column;







            align-items: center;







            position: relative;







            z-index: 10;







        }







        .profile-block {







            text-align: center;







            margin-bottom: 25px;







            display: flex;







            flex-direction: column;







            align-items: center;







            width: 100%;







        }







        .bio-avatar {







            width: 96px; height: 96px;







            border-radius: 50%;







            object-fit: cover;







            border: 3px solid rgba(255, 255, 255, 0.15);







            margin-bottom: 15px;







        }







        .bio-avatar-fallback {







            width: 96px; height: 96px;







            border-radius: 50%;







            background-color: var(--primary);







            border: 3px solid rgba(255, 255, 255, 0.15);







            display: flex;







            align-items: center;







            justify-content: center;







            font-size: 2.8rem;







            font-weight: 800;







            color: white;







            margin-bottom: 15px;







        }







        .profile-name { font-size: 1.45rem; font-weight: 700; margin-bottom: 8px; }







        .profile-bio { font-size: 0.95rem; opacity: 0.85; line-height: 1.5; max-width: 90%; word-break: break-word; }







        







        .social-block {







            display: flex;







            justify-content: center;







            flex-wrap: wrap;







            gap: 18px;







            margin-bottom: 20px;







            width: 100%;







        }







        .social-icon {







            font-size: 1.5rem;







            color: inherit;







            opacity: 0.8;







            text-decoration: none;







            transition: transform 0.2s, opacity 0.2s;







        }







        .social-icon:hover { transform: scale(1.2); opacity: 1; }















        .bio-btn {







            width: 100%;







            display: flex;







            align-items: center;







            justify-content: center;







            padding: 16px 20px;







            text-decoration: none;







            font-weight: 600;







            font-size: 0.98rem;







            position: relative;







            background-color: var(--button-bg);







            color: var(--button-text);







            border-radius: var(--button-radius);







            box-shadow: var(--button-shadow);







            transition: transform 0.2s, box-shadow 0.2s;







            border: 1px solid transparent;







            margin-bottom: 15px;







        }







        .bio-btn:hover { transform: scale(1.02); }







        .bio-btn-icon-left { position: absolute; left: 20px; font-size: 1.3rem; }















        /* Multi Column Image Blocks */







        .image-grid-block {







            display: grid;







            gap: 15px;







            width: 100%;







            margin-bottom: 15px;







        }







        .image-grid-block.grid-single { grid-template-columns: 1fr; }







        .image-grid-block.grid-double { grid-template-columns: 1fr 1fr; }







        .image-grid-item {







            border-radius: 12px;







            overflow: hidden;







            display: block;







            position: relative;







            width: 100%;







            padding-bottom: 75%; /* 4:3 Aspect Ratio */







            background-color: rgba(255,255,255,0.05);







            box-shadow: 0 4px 10px rgba(0,0,0,0.2);







            transition: transform 0.2s;







        }







        .image-grid-item:hover { transform: scale(1.02); }







        .image-grid-item img {







            position: absolute;







            top: 0; left: 0;







            width: 100%; height: 100%;







            object-fit: cover;







        }















        /* YouTube Block */







        .youtube-block {







            position: relative;







            width: 100%;







            padding-bottom: 56.25%; /* 16:9 Aspect Ratio */







            border-radius: 12px;







            overflow: hidden;







            box-shadow: 0 5px 15px rgba(0,0,0,0.3);







            margin-bottom: 15px;







        }







        .youtube-block iframe {







            position: absolute;







            top: 0; left: 0;







            width: 100%; height: 100%;







            border: none;







        }















        /* Music Player Block */







        .music-player-block {







            width: 100%;







            background-color: var(--button-bg);







            border-radius: var(--button-radius);







            box-shadow: var(--button-shadow);







            padding: 16px;







            display: flex;







            align-items: center;







            gap: 15px;







            border: 1px solid rgba(255,255,255,0.05);







            margin-bottom: 15px;







            color: var(--button-text);







        }







        .music-player-cover {







            width: 48px; height: 48px;







            border-radius: 8px;







            background: linear-gradient(135deg, var(--primary), #8e2de2);







            display: flex;







            align-items: center;







            justify-content: center;







            font-size: 1.3rem;







            color: white;







            flex-shrink: 0;







            animation: spin 5s linear infinite;







            animation-play-state: paused;







        }







        .music-player-cover.playing { animation-play-state: running; }







        @keyframes spin { 100% { transform: rotate(360deg); } }







        







        .music-player-info { flex-grow: 1; overflow: hidden; }







        .music-player-title { font-size: 0.9rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }







        .music-player-sub { font-size: 0.75rem; opacity: 0.6; margin-top: 3px; }







        







        .music-player-controls { display: flex; align-items: center; justify-content: center; flex-shrink: 0; }







        .music-play-btn {







            width: 36px; height: 36px;







            border-radius: 50%;







            background-color: rgba(255, 255, 255, 0.15);







            border: none;







            color: inherit;







            cursor: pointer;







            display: flex;







            align-items: center;







            justify-content: center;







            font-size: 0.95rem;







            transition: all 0.2s;







        }







        .music-play-btn:hover { background-color: var(--primary); color: white; transform: scale(1.08); }















        .spacer-block { width: 100%; }















        .bio-footer { margin-top: 40px; margin-bottom: 20px; }







        .footer-badge {







            display: inline-flex;







            align-items: center;







            gap: 8px;







            background: rgba(0, 0, 0, 0.35);







            backdrop-filter: blur(10px);







            border: 1px solid rgba(255, 255, 255, 0.08);







            color: rgba(255,255,255,0.7);







            padding: 8px 16px;







            border-radius: 30px;







            text-decoration: none;







            font-size: 0.78rem;







            font-weight: 600;







            text-transform: uppercase;







        }















        /* Animations */







        .anim-pulse { animation: btn-pulse 2s infinite; }







        @keyframes btn-pulse {







            0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4); }







            70% { box-shadow: 0 0 0 10px rgba(255, 255, 255, 0); }







            100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }







        }







        .anim-bounce { animation: btn-bounce 2s infinite; }







        @keyframes btn-bounce {







            0%, 20%, 50%, 80%, 100% { transform: translateY(0); }







            40% { transform: translateY(-6px); }







            60% { transform: translateY(-3px); }







        }







        .anim-wobble { animation: btn-wobble 1.5s infinite alternate; }







        @keyframes btn-wobble {







            0%, 100% { transform: rotate(0deg); }







            15% { transform: rotate(-3deg); }







            30% { transform: rotate(2deg); }







            45% { transform: rotate(-2deg); }







            60% { transform: rotate(1deg); }







            75% { transform: rotate(-1deg); }







        }















        /* Fusions Premium Style exports */







        .verified-badge-inline {







            color: #3897f0;







            margin-left: 8px;







            font-size: 1.1rem;







            vertical-align: middle;







            display: inline-flex;







            align-items: center;







            text-shadow: 0 0 8px rgba(56, 151, 240, 0.4);







        }







        .crown-badge-inline {







            color: #d4af37;







            margin-left: 8px;







            font-size: 1.15rem;







            vertical-align: middle;







            display: inline-flex;







            align-items: center;







            text-shadow: 0 0 8px rgba(212, 175, 55, 0.4);







        }







        .effect-glow {







            text-shadow: 0 0 10px var(--text-color, #fff), 0 0 20px var(--primary-light, #a29bfe);







        }







        .effect-rainbow {







            background: linear-gradient(to right, #ff007f, #00f2fe, #39ff14, #ffff00, #ff007f);







            background-size: 400% auto;







            -webkit-background-clip: text;







            -webkit-text-fill-color: transparent;







            animation: rainbow-text-flow 4s linear infinite;







            display: inline-block;







        }







        @keyframes rainbow-text-flow {







            0% { background-position: 0% 50% }







            50% { background-position: 100% 50% }







            100% { background-position: 0% 50% }







        }







        .effect-bounce {







            animation: name-bounce 0.8s infinite alternate ease-in-out;







            display: inline-block;







        }







        @keyframes name-bounce {







            0% { transform: translateY(0); }







            100% { transform: translateY(-8px); }







        }







        .effect-glitch {







            position: relative;







            animation: glitch-anim 1.5s infinite linear alternate-reverse;







            display: inline-block;







        }







        @keyframes glitch-anim {







            0% { text-shadow: -2px 0 #00f2fe, 2px 0 #ff007f; }







            50% { text-shadow: 2px 0 #00f2fe, -2px 0 #ff007f; }







            100% { text-shadow: -1px 0 #00f2fe, 1px 0 #ff007f; }







        }







        #neko-cat {







            position: fixed;







            width: 32px; height: 32px;







            z-index: 9999;







            pointer-events: none;







            image-rendering: pixelated;







            transition: transform 0.1s;







            display: none;







        }







        #cursor-trail-canvas {







            position: fixed;







            top: 0; left: 0;







            width: 100vw; height: 100vh;







            z-index: 9998;







            pointer-events: none;







        }







    </style>







</head>







<body>







    <canvas id="bg-canvas"></canvas>







    <div id="media-bg-container"></div>















    <div class="bio-container" id="blocks-render-container">







        <!-- Rendered dynamically -->







    </div>















    <!-- Inline JavaScript -->







    <script>







        const PAGE_CONFIG = ${configStr};







        let canvas = null;







        let ctx = null;







        let animFrameId = null;







        let canvasElements = [];







        let activeAudio = null;















        document.addEventListener('DOMContentLoaded', () => {







            renderBioPage();







        });















        function renderBioPage() {







            const container = document.getElementById('blocks-render-container');







            container.innerHTML = '';















            const theme = PAGE_CONFIG.theme.custom;















            // Apply styles







            document.documentElement.style.setProperty('--bg-color', theme.backgroundColor);







            document.documentElement.style.setProperty('--button-bg', theme.buttonColor);







            document.documentElement.style.setProperty('--button-text', theme.buttonTextColor);







            document.documentElement.style.setProperty('--button-radius', theme.buttonBorderRadius + 'px');







            document.documentElement.style.setProperty('--button-shadow', theme.buttonShadow);







            document.documentElement.style.setProperty('--font-family', "'" + theme.fontFamily + "', sans-serif");















            // Load Font







            const link = document.createElement('link');







            link.rel = 'stylesheet';







            link.href = "https://fonts.googleapis.com/css2?family=" + theme.fontFamily.replace(/ /g, '+') + ":wght@300;400;500;600;700;800&display=swap";







            document.head.appendChild(link);















            // Set background







            const body = document.body;







            body.style.background = '';







            body.style.backgroundColor = '';















            if (theme.backgroundType === 'solid') {







                body.style.backgroundColor = theme.backgroundColor;







            } else if (theme.backgroundType === 'gradient') {







                body.style.background = theme.backgroundGradient;







            } else if (theme.backgroundType === 'animated') {







                body.style.background = theme.backgroundGradient;







            }















            // Custom CSS Injection







            if (theme.customCss) {







                const styleTag = document.createElement('style');







                styleTag.innerHTML = theme.customCss;







                document.head.appendChild(styleTag);







            }















            // Background media







            const bgContainer = document.getElementById('media-bg-container');







            bgContainer.innerHTML = '';







            if (theme.backgroundType === 'media' && theme.backgroundImage) {







                if (theme.backgroundImage.includes('.mp4') || theme.backgroundImage.startsWith('data:video')) {







                    bgContainer.innerHTML = '<video class="video-bg" src="' + theme.backgroundImage + '" autoplay loop muted playsinline></video>';







                } else {







                    bgContainer.innerHTML = '<div class="gif-bg" style="background-image: url(\\'' + theme.backgroundImage + '\\');"></div>';







                }







            }















            // Canvas animation







            initBgAnimation(theme.backgroundType === 'animated' ? theme.backgroundAnimation : 'none');















            // Render modular blocks







            PAGE_CONFIG.blocks.forEach(block => {







                if (block.type === 'profile') {







                    const blockDiv = document.createElement('div');







                    blockDiv.className = 'profile-block';







                    







                    const initials = PAGE_CONFIG.username.slice(0,2).toUpperCase();







                    const avatarHtml = block.avatar 







                        ? '<img class="bio-avatar" src="' + block.avatar + '" />'







                        : '<div class="bio-avatar-fallback">' + initials + '</div>';















                    // badge html







                    let badgeHtml = '';







                    if (theme.verifiedBadge === 'verified') {







                        badgeHtml = '<span class="verified-badge-inline" title="Verified"><i class="fa-solid fa-circle-check"></i></span>';







                    } else if (theme.verifiedBadge === 'crown') {







                        badgeHtml = '<span class="crown-badge-inline" title="Crown"><i class="fa-solid fa-crown"></i></span>';







                    }















                    // name text effects







                    let effectClass = '';







                    if (theme.titleEffect && theme.titleEffect !== 'none') {







                        effectClass = 'effect-' + theme.titleEffect;







                    }















                    blockDiv.innerHTML = avatarHtml + 







                        '<h1 class="profile-name ' + effectClass + '">' + block.displayName + badgeHtml + '</h1>' +







                        '<p class="profile-bio">' + block.bio + '</p>';







                    container.appendChild(blockDiv);







                }







                







                else if (block.type === 'social') {







                    const blockDiv = document.createElement('div');







                    blockDiv.className = 'social-block';















                    const socialIcons = {







                        facebook: 'fa-brands fa-facebook',







                        instagram: 'fa-brands fa-instagram',







                        tiktok: 'fa-brands fa-tiktok',







                        youtube: 'fa-brands fa-youtube',







                        line: 'fa-brands fa-line',







                        github: 'fa-brands fa-github'







                    };















                    let hasLinks = false;







                    Object.keys(socialIcons).forEach(key => {







                        const url = block[key];







                        if (url) {







                            hasLinks = true;







                            blockDiv.innerHTML += '<a href="' + url + '" target="_blank" class="social-icon"><i class="' + socialIcons[key] + '"></i></a>';







                        }







                    });















                    if (hasLinks) container.appendChild(blockDiv);







                }







                







                else if (block.type === 'link') {







                    if (!block.enabled) return;







                    const a = document.createElement('a');







                    a.className = 'bio-btn ' + (block.animation !== 'none' ? 'anim-' + block.animation : '');







                    a.href = block.url;







                    a.target = '_blank';







                    







                    if (block.layout === '50-left' || block.layout === '50-right') {







                        a.style.width = 'calc(50% - 8px)';







                    } else {







                        a.style.width = '100%';







                    }







                    if (block.useCustomBg && block.bgColor) {







                        a.style.backgroundColor = block.bgColor;







                    }







                    if (block.useCustomText && block.textColor) {







                        a.style.color = block.textColor;







                    }







                    if (block.bgImage) {







                        a.style.backgroundImage = "url('" + block.bgImage + "')";







                        a.style.backgroundSize = 'cover';







                        a.style.backgroundPosition = 'center';







                        a.style.border = 'none';







                    }















                    const iconMap = {







                        globe: 'fa-solid fa-globe', facebook: 'fa-brands fa-facebook', instagram: 'fa-brands fa-instagram',







                        tiktok: 'fa-brands fa-tiktok', youtube: 'fa-brands fa-youtube', line: 'fa-brands fa-line',







                        twitter: 'fa-brands fa-twitter', github: 'fa-brands fa-github', 'shopping-cart': 'fa-solid fa-cart-shopping'







                    };















                    a.innerHTML = '<i class="' + (iconMap[block.icon] || 'fa-solid fa-link') + ' bio-btn-icon-left"></i>' +







                        '<span>' + block.title + '</span>';







                    container.appendChild(a);







                }







                







                else if (block.type === 'image') {







                    const blockDiv = document.createElement('div');







                    blockDiv.className = 'image-grid-block ' + (block.layout === 'double' ? 'grid-double' : 'grid-single');







                    







                    let html = '<a href="' + block.linkUrl1 + '" target="_blank" class="image-grid-item"><img src="' + block.imgUrl1 + '" /></a>';







                    if (block.layout === 'double') {







                        html += '<a href="' + block.linkUrl2 + '" target="_blank" class="image-grid-item"><img src="' + block.imgUrl2 + '" /></a>';







                    }







                    blockDiv.innerHTML = html;







                    container.appendChild(blockDiv);







                }







                







                else if (block.type === 'youtube') {







                    const blockDiv = document.createElement('div');







                    blockDiv.className = 'youtube-block';







                    blockDiv.innerHTML = '<iframe src="https://www.youtube.com/embed/' + block.videoId + '" allowfullscreen></iframe>';







                    container.appendChild(blockDiv);







                }







                







                else if (block.type === 'album') {







                    const blockDiv = document.createElement('div');







                    blockDiv.className = 'album-player-block';







                    const albumId = 'album-' + block.id;







                    const tracks = block.tracks || [];







                    const tracksJson = JSON.stringify(tracks).replace(/"/g, '&quot;');







                    







                    let html = '<div class="album-header">' +







                        '<div class="album-cover" style="background-image: url(\'' + (block.coverUrl || 'https://via.placeholder.com/150') + '\');">' +







                            '<div class="album-play-btn" onclick="playAlbumTrack(\'' + albumId + '\', 0, this)">' +







                                '<i class="fa-solid fa-play"></i>' +







                            '</div>' +







                        '</div>' +







                        '<div class="album-info">' +







                            '<div class="album-title">' + (block.title || 'Unknown Album') + '</div>' +







                            '<div class="album-artist">' + (block.artist || 'Unknown Artist') + '</div>' +







                        '</div>' +







                    '</div>' +







                    '<div class="album-tracklist" id="tracklist-' + albumId + '" data-tracks="' + tracksJson + '">';







                    







                    tracks.forEach((t, i) => {







                        html += '<div class="album-track-row" id="track-row-' + albumId + '-' + i + '" onclick="playAlbumTrack(\'' + albumId + '\', ' + i + ', this)">' +







                            '<div class="track-num">' + (i + 1) + '</div>' +







                            '<div class="track-name">' + (t.title || 'Unknown Track') + '</div>' +







                            '<div class="track-status" id="track-status-' + albumId + '-' + i + '">' +







                                '<i class="fa-solid fa-play"></i>' +







                            '</div>' +







                        '</div>';







                    });







                    







                    html += '</div>' +







                        '<audio id="audio-' + albumId + '" preload="none" onended="albumTrackEnded(\'' + albumId + '\')"></audio>';







                    







                    blockDiv.innerHTML = html;







                    container.appendChild(blockDiv);







                }







    else if (block.type === 'music') {







                    const blockDiv = document.createElement('div');







                    blockDiv.className = 'music-player-block';







                    







                    if (block.sourceType === 'spotify') {







                        // Extract track ID or embed URL







                        let embedUrl = block.url;







                        if (block.url.includes('open.spotify.com')) {







                            const trackMatch = block.url.match(/track\/([a-zA-Z0-9]+)/);







                            const albumMatch = block.url.match(/album\/([a-zA-Z0-9]+)/);







                            const playlistMatch = block.url.match(/playlist\/([a-zA-Z0-9]+)/);







                            







                            if (trackMatch) embedUrl = "https://open.spotify.com/embed/track/" + trackMatch[1];







                            else if (albumMatch) embedUrl = "https://open.spotify.com/embed/album/" + albumMatch[1];







                            else if (playlistMatch) embedUrl = "https://open.spotify.com/embed/playlist/" + playlistMatch[1];







                        }







                        







                        blockDiv.style.padding = '0';







                        blockDiv.style.border = 'none';







                        blockDiv.style.background = 'none';







                        blockDiv.innerHTML = '<iframe src="' + embedUrl + '" width="100%" height="80" frameborder="0" allowtransparency="true" allow="encrypted-media" style="border-radius: var(--button-radius)"></iframe>';







                    } else {







                        const audioId = 'audio-' + block.id;







                        blockDiv.innerHTML = '<div class="music-player-cover" id="cover-' + block.id + '"><i class="fa-solid fa-music"></i></div>' +







                            '<div class="music-player-info">' +







                                '<div class="music-player-title">' + block.title + '</div>' +







                                '<div class="music-player-sub">Audio Player</div>' +







                            '</div>' +







                            '<div class="music-player-controls">' +







                                '<button class="music-play-btn" onclick="toggleAudio(\\'' + block.url + '\\', \\'' + block.id + '\\')">' +







                                    '<i class="fa-solid fa-play" id="icon-' + block.id + '"></i>' +







                                '</button>' +







                                '<audio id="' + audioId + '" src="' + block.url + '" loop></audio>' +







                            '</div>';







                    }







                    container.appendChild(blockDiv);







                }







                







                else if (block.type === 'spacer') {







                    const blockDiv = document.createElement('div');







                    blockDiv.className = 'spacer-block';







                    blockDiv.style.height = block.height + 'px';







                    container.appendChild(blockDiv);







                }







            });















            // Badge footer link







            const footerDiv = document.createElement('div');







            footerDiv.className = 'bio-footer';







            footerDiv.innerHTML = '<a class="footer-badge" href="https://github.com/google"><i class="fa-solid fa-wand-magic-sparkles"></i> <span>Super Bio Builder</span></a>';







            if (theme.hideWatermark) {







                footerDiv.style.display = 'none';







            }







            container.appendChild(footerDiv);















            // Apply Fusions Premium Effects







            applyPremiumEffects(theme);







        }















        function toggleAudio(src, blockId) {







            const player = document.getElementById('audio-' + blockId);







            const icon = document.getElementById('icon-' + blockId);







            const cover = document.getElementById('cover-' + blockId);















            if (activeAudio && activeAudio !== player) {







                // Pause current active player







                activeAudio.pause();







                const activeId = activeAudio.id.replace('audio-', '');







                document.getElementById('icon-' + activeId).className = 'fa-solid fa-play';







                document.getElementById('cover-' + activeId).classList.remove('playing');







            }















            if (player.paused) {







                player.play();







                activeAudio = player;







                icon.className = 'fa-solid fa-pause';







                cover.classList.add('playing');







            } else {







                player.pause();







                icon.className = 'fa-solid fa-play';







                cover.classList.remove('playing');







            }







        }















        // Animated Background loops







        function initBgAnimation(type) {







            if (animFrameId) cancelAnimationFrame(animFrameId);







            canvas = document.getElementById('bg-canvas');







            if (!canvas) return;















            if (type === 'none') {







                canvas.style.display = 'none';







                return;







            }















            canvas.style.display = 'block';







            ctx = canvas.getContext('2d');







            







            canvas.width = window.innerWidth;







            canvas.height = window.innerHeight;







            window.addEventListener('resize', () => {







                canvas.width = window.innerWidth;







                canvas.height = window.innerHeight;







            });















            canvasElements = [];















            if (type === 'particles') {







                for (let i = 0; i < 40; i++) {







                    canvasElements.push({







                        x: Math.random() * canvas.width,







                        y: Math.random() * canvas.height,







                        radius: Math.random() * 3 + 1,







                        speedX: Math.random() * 0.4 - 0.2,







                        speedY: Math.random() * -0.6 - 0.2,







                        color: 'rgba(255, 255, 255, 0.2)'







                    });







                }







                loopParticles();







            } else if (type === 'stars') {







                for (let i = 0; i < 60; i++) {







                    canvasElements.push({







                        x: Math.random() * canvas.width,







                        y: Math.random() * canvas.height,







                        radius: Math.random() * 2 + 0.5,







                        twinkleSpeed: Math.random() * 0.02 + 0.005,







                        alpha: Math.random(),







                        dir: Math.random() > 0.5 ? 1 : -1







                    });







                }







                loopStars();







            }







        }















        function loopParticles() {







            ctx.clearRect(0, 0, canvas.width, canvas.height);







            canvasElements.forEach(p => {







                ctx.beginPath();







                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);







                ctx.fillStyle = p.color;







                ctx.fill();















                p.x += p.speedX; p.y += p.speedY;







                if (p.y < 0) { p.y = canvas.height; p.x = Math.random() * canvas.width; }







            });







            animFrameId = requestAnimationFrame(loopParticles);







        }















        function loopStars() {







            ctx.clearRect(0, 0, canvas.width, canvas.height);







            canvasElements.forEach(s => {







                ctx.beginPath();







                ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);







                ctx.fillStyle = "rgba(255, 255, 255, " + s.alpha + ")";







                ctx.fill();















                s.alpha += s.twinkleSpeed * s.dir;







                if (s.alpha > 0.95) s.dir = -1;







                else if (s.alpha < 0.05) s.dir = 1;







            });







            animFrameId = requestAnimationFrame(loopStars);







        }















        // ==========================================







        // FUSIONS PREMIUM EFFECTS SYSTEM EXPORT







        // ==========================================















        let nekoImg = null;







        let nekoX = 100, nekoY = 100, mouseX = 100, mouseY = 100, nekoFrameId = null;







        let trailCanvas = null, trailCtx = null, trailPoints = [], trailFrameId = null;















        function applyPremiumEffects(themeCustom) {







            if (!themeCustom) return;















            // Custom cursor







            if (themeCustom.customCursorUrl) {







                document.body.style.cursor = "url('" + themeCustom.customCursorUrl + "'), auto";







            } else {







                document.body.style.cursor = '';







            }















            // Cursor trail







            initCursorTrail(themeCustom.cursorEffect || 'none');















            // Neko cat







            initNekoCat(themeCustom.nekoEnabled || false);















            initGlobalAudio(themeCustom.globalAudioUrl || '');







            initPageOverlay(themeCustom.pageOverlay || 'none');







            initTiltEffect(themeCustom.tiltEffect || 'off');







        }















        function initCursorTrail(type) {







            if (trailFrameId) cancelAnimationFrame(trailFrameId);







            trailCanvas = document.getElementById('cursor-trail-canvas');







            if (trailCanvas) trailCanvas.remove();















            if (type === 'none') return;















            trailCanvas = document.createElement('canvas');







            trailCanvas.id = 'cursor-trail-canvas';







            document.body.appendChild(trailCanvas);







            trailCtx = trailCanvas.getContext('2d');















            const resizeTrail = () => {







                if (trailCanvas) {







                    trailCanvas.width = window.innerWidth;







                    trailCanvas.height = window.innerHeight;







                }







            };







            resizeTrail();







            window.addEventListener('resize', resizeTrail);















            trailPoints = [];















            const handleMouseMove = (e) => {







                trailPoints.push({







                    x: e.clientX,







                    y: e.clientY,







                    alpha: 1,







                    size: type === 'sparkle' ? Math.random() * 6 + 4 : Math.random() * 8 + 6,







                    angle: Math.random() * Math.PI * 2,







                    vx: (Math.random() - 0.5) * 1.5,







                    vy: (Math.random() - 0.5) * 1.5 - 0.5







                });







            };















            window.addEventListener('mousemove', handleMouseMove);















            function drawTrail() {







                if (!trailCanvas || !trailCtx) return;







                trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);







                







                for (let i = 0; i < trailPoints.length; i++) {







                    const p = trailPoints[i];







                    p.alpha -= 0.02;







                    p.x += p.vx;







                    p.y += p.vy;















                    if (p.alpha <= 0) {







                        trailPoints.splice(i, 1);







                        i--;







                        continue;







                    }















                    trailCtx.save();







                    trailCtx.globalAlpha = p.alpha;







                    







                    if (type === 'sparkle') {







                        trailCtx.translate(p.x, p.y);







                        trailCtx.rotate(p.angle);







                        trailCtx.fillStyle = '#00f2fe';







                        trailCtx.beginPath();







                        for (let j = 0; j < 4; j++) {







                            trailCtx.rotate(Math.PI / 2);







                            trailCtx.lineTo(0, p.size);







                            trailCtx.lineTo(p.size * 0.25, 0);







                        }







                        trailCtx.closePath();







                        trailCtx.fill();







                    } else {







                        trailCtx.beginPath();







                        trailCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);







                        trailCtx.fillStyle = 'rgba(162, 155, 254, 0.35)';







                        trailCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';







                        trailCtx.lineWidth = 1;







                        trailCtx.fill();







                        trailCtx.stroke();







                    }







                    trailCtx.restore();







                }















                trailFrameId = requestAnimationFrame(drawTrail);







            }







            drawTrail();







        }















        function initNekoCat(enabled) {







            if (nekoFrameId) cancelAnimationFrame(nekoFrameId);







            nekoImg = document.getElementById('neko-cat');







            if (nekoImg) nekoImg.remove();















            if (!enabled) return;















            nekoImg = document.createElement('img');







            nekoImg.id = 'neko-cat';







            nekoImg.src = 'https://media.giphy.com/media/8gXv8gDkXvV9r7G2k5/giphy.gif';







            nekoImg.style.display = 'block';







            document.body.appendChild(nekoImg);















            nekoX = window.innerWidth / 2;







            nekoY = window.innerHeight / 2;















            const trackMouse = (e) => {







                mouseX = e.clientX;







                mouseY = e.clientY;







            };







            window.addEventListener('mousemove', trackMouse);















            function updateNeko() {







                if (!nekoImg) return;







                const dx = mouseX - nekoX;







                const dy = mouseY - nekoY;







                const dist = Math.sqrt(dx * dx + dy * dy);















                if (dist > 25) {







                    const speed = 4.5;







                    nekoX += (dx / dist) * speed;







                    nekoY += (dy / dist) * speed;















                    if (dx < 0) {







                        nekoImg.style.transform = 'scaleX(-1)';







                    } else {







                        nekoImg.style.transform = 'scaleX(1)';







                    }







                    if (!nekoImg.src.includes('8gXv8gDkXvV9r7G2k5')) {







                        nekoImg.src = 'https://media.giphy.com/media/8gXv8gDkXvV9r7G2k5/giphy.gif';







                    }







                } else {







                    if (!nekoImg.src.includes('13CoXDiaCcC9R6')) {







                        nekoImg.src = 'https://media.giphy.com/media/13CoXDiaCcC9R6/giphy.gif';







                    }







                }















                nekoImg.style.left = (nekoX - 16) + 'px';







                nekoImg.style.top = (nekoY - 16) + 'px';















                nekoFrameId = requestAnimationFrame(updateNeko);







            }







            updateNeko();







        }















        function initGlobalAudio(url) {







            let globalAudioPlayer = document.getElementById('global-audio-player');







            let globalAudioBtn = document.getElementById('global-audio-btn');















            if (!url) {







                if (globalAudioPlayer) globalAudioPlayer.remove();







                if (globalAudioBtn) globalAudioBtn.remove();







                return;







            }















            if (!globalAudioPlayer) {







                globalAudioPlayer = document.createElement('audio');







                globalAudioPlayer.id = 'global-audio-player';







                globalAudioPlayer.loop = true;







                document.body.appendChild(globalAudioPlayer);















                globalAudioBtn = document.createElement('button');







                globalAudioBtn.id = 'global-audio-btn';







                globalAudioBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';







                globalAudioBtn.style.cssText = 'position:fixed; bottom:20px; left:20px; z-index:100; width:45px; height:45px; border-radius:50%; background:var(--button-bg, rgba(255,255,255,0.1)); color:var(--button-text, #fff); border:1px solid rgba(255,255,255,0.2); cursor:pointer; box-shadow:0 4px 15px rgba(0,0,0,0.3); backdrop-filter:blur(5px); display:flex; align-items:center; justify-content:center; font-size:1.2rem; transition:all 0.3s;';







                







                globalAudioBtn.addEventListener('click', () => {







                    if (globalAudioPlayer.paused) {







                        globalAudioPlayer.play();







                        globalAudioBtn.innerHTML = '<i class="fa-solid fa-music"></i>';







                        globalAudioBtn.style.boxShadow = '0 0 15px var(--button-bg, rgba(255,255,255,0.5))';







                    } else {







                        globalAudioPlayer.pause();







                        globalAudioBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';







                        globalAudioBtn.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';







                    }







                });







                document.body.appendChild(globalAudioBtn);







            }







            







            if (globalAudioPlayer.src !== url) {







                globalAudioPlayer.src = url;







                globalAudioBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';







                globalAudioPlayer.play().then(() => {







                    globalAudioBtn.innerHTML = '<i class="fa-solid fa-music"></i>';







                }).catch(() => {});







            }







        }















        function initPageOverlay(type) {







            let overlayDiv = document.getElementById('page-overlay-div');







            if (!overlayDiv) {







                overlayDiv = document.createElement('div');







                overlayDiv.id = 'page-overlay-div';







                overlayDiv.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; pointer-events:none; z-index:90;';







                document.body.appendChild(overlayDiv);







            }















            if (type === 'none') {







                overlayDiv.style.display = 'none';







            } else {







                overlayDiv.style.display = 'block';







                if (type === 'noise') {







                    overlayDiv.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")';







                    overlayDiv.style.animation = 'none';







                    overlayDiv.style.mixBlendMode = 'overlay';







                    overlayDiv.style.opacity = '0.5';







                } else if (type === 'rain') {







                    overlayDiv.style.backgroundImage = 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0) 100%)';







                    overlayDiv.style.backgroundSize = '4px 100px';







                    overlayDiv.style.animation = 'rainAnim 0.3s linear infinite';







                    overlayDiv.style.mixBlendMode = 'normal';







                    overlayDiv.style.opacity = '0.7';







                    







                    if (!document.getElementById('overlay-keyframes')) {







                        const style = document.createElement('style');







                        style.id = 'overlay-keyframes';







                        style.innerHTML = '@keyframes rainAnim { 0% { background-position: 0px 0px; } 100% { background-position: 20px 100vh; } } @keyframes embersAnim { 0% { background-position: 0px 100vh; } 100% { background-position: -20px 0px; } }';







                        document.head.appendChild(style);







                    }







                } else if (type === 'embers') {







                    overlayDiv.style.backgroundImage = 'radial-gradient(circle, #ff9f43 10%, transparent 20%)';







                    overlayDiv.style.backgroundSize = '30px 30px';







                    overlayDiv.style.animation = 'embersAnim 3s linear infinite';







                    overlayDiv.style.opacity = '0.4';







                    overlayDiv.style.mixBlendMode = 'color-dodge';







                    







                    if (!document.getElementById('overlay-keyframes')) {







                        const style = document.createElement('style');







                        style.id = 'overlay-keyframes';







                        style.innerHTML = '@keyframes rainAnim { 0% { background-position: 0px 0px; } 100% { background-position: 20px 100vh; } } @keyframes embersAnim { 0% { background-position: 0px 100vh; } 100% { background-position: -20px 0px; } }';







                        document.head.appendChild(style);







                    }







                }







            }







        }















        function initTiltEffect(state) {







            const container = document.getElementById('blocks-render-container');







            if (!container) return;







            







            if (window.tiltListener) {







                document.removeEventListener('mousemove', window.tiltListener);







                window.tiltListener = null;







            }







            







            const elements = container.querySelectorAll('.bio-btn, .profile-block, .image-grid-item, .music-player-block, .social-block, .youtube-block');







            elements.forEach(el => {







                el.style.transform = '';







                el.style.transition = 'transform 0.2s ease-out, box-shadow 0.3s, border-color 0.3s';







                el.style.willChange = 'transform';







            });







            







            if (state === 'off') return;















            window.tiltListener = (e) => {







                elements.forEach(el => {







                    const rect = el.getBoundingClientRect();







                    if (e.clientX > rect.left - 50 && e.clientX < rect.right + 50 &&







                        e.clientY > rect.top - 50 && e.clientY < rect.bottom + 50) {







                        







                        const x = e.clientX - rect.left;







                        const y = e.clientY - rect.top;







                        const centerX = rect.width / 2;







                        const centerY = rect.height / 2;







                        const rotateX = ((y - centerY) / centerY) * -12;







                        const rotateY = ((x - centerX) / centerX) * 12;







                        







                        el.style.transform = 'perspective(1000px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg) scale(1.05)';







                        el.style.zIndex = "10";







                    } else {







                        el.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';







                        el.style.zIndex = "1";







                    }







                });







            };







            







            document.addEventListener('mousemove', window.tiltListener);







        }







    </script>







</body>







</html>`;















    // Download the compiled bundle







    const blob = new Blob([bundleHtml], { type: 'text/html' });







    const url = URL.createObjectURL(blob);







    const a = document.createElement('a');







    a.href = url;







    a.download = `${session.username}_bio_page.html`;







    document.body.appendChild(a);







    a.click();







    document.body.removeChild(a);







    URL.revokeObjectURL(url);















        showToast('ดาวน์โหลดไฟล์หน้า HTML สำเร็จแล้ว!');







}























function initAnalytics() {







    const stats = window.DB.getAnalytics(session.username);







    







    // Total stats







    const totalViews = stats.views ? stats.views.reduce((sum, v) => sum + v.count, 0) : 0;







    let totalClicks = 0;







    if (stats.clicks) {







        Object.keys(stats.clicks).forEach(blockId => {







            totalClicks += stats.clicks[blockId].reduce((sum, c) => sum + c.count, 0);







        });







    }















    const ctr = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : '0.0';















    document.getElementById('total-views').textContent = totalViews.toLocaleString();







    document.getElementById('total-clicks').textContent = totalClicks.toLocaleString();







    document.getElementById('total-ctr').textContent = `${ctr}%`;















    // Render individual click breakdown







    const container = document.getElementById('stats-blocks-container');







    container.innerHTML = '';















    profile.blocks.forEach(b => {







        // Only count clicks on interactive blocks (link, music, image, social)







        if (b.type === 'profile' || b.type === 'spacer') return;















        const clicksArr = stats.clicks && stats.clicks[b.id] ? stats.clicks[b.id] : [];







        const clicksCount = clicksArr.reduce((sum, c) => sum + c.count, 0);







        const bCtr = totalViews > 0 ? ((clicksCount / totalViews) * 100).toFixed(1) : '0.0';















        const nameMap = {







                        link: `ปุ่มลิงก์: ${b.title || 'ไม่มีชื่อ'}`,







                        music: `เครื่องเล่นเพลง: ${b.title || 'ไม่มีชื่อ'}`,







                        image: `กล่องรูปภาพ: ${b.layout === 'double' ? 'รูปคู่' : 'รูปเดี่ยว'}`,







                        youtube: `วิดีโอ YouTube (ID: ${b.videoId})`,







                        social: 'โซเชียลมีเดีย'







        };















        const item = document.createElement('div');







        item.className = 'block-card';







        item.style.padding = '15px 20px';







        item.innerHTML = `







            <div style="display:flex; justify-content:space-between; align-items:center;">







                <div style="font-weight:600; font-size:0.85rem;">${nameMap[b.type] || b.type}</div>







                <div style="display:flex; gap:20px; text-align:right;">







                    <div>







                                                <span style="font-size:0.7rem; color:var(--text-muted); display:block;">คลิก</span>







                        <span style="font-weight:700; font-size:1rem;">${clicksCount}</span>







                    </div>







                    <div>







                                                <span style="font-size:0.7rem; color:var(--text-muted); display:block;">อัตรา (CTR)</span>







                        <span style="font-weight:700; font-size:1rem; color:var(--primary-light);">${bCtr}%</span>







                    </div>







                </div>







            </div>







        `;







        container.appendChild(item);







    });







}















function handleAvatarUpload(e, blockId) {







    const file = e.target.files[0];







    if (!file) return;















    const reader = new FileReader();







    reader.onload = (event) => {







        const block = profile.blocks.find(b => b.id === blockId);







        if (block) {







            block.avatar = event.target.result;







            // update avatar preview







            const preview = document.getElementById(`avatar-preview-${blockId}`);







            if (preview) {







                preview.src = event.target.result;







            }







            sendConfigToPreview();







                        showToast('อัปโหลดรูปโปรไฟล์แล้ว! อย่าลืมกดปุ่มบันทึกข้อมูล');







        }







    };







    reader.readAsDataURL(file);







}















function renderAnalyticsCharts() {







    const stats = window.DB.getAnalytics(session.username);







    const ctx = document.getElementById('viewsDailyChart').getContext('2d');















    if (viewsChart) viewsChart.destroy();















    const viewsData = stats.views || [];







    const labels = [];







    const counts = [];















    if (viewsData.length === 0) {







        const today = new Date();







        for (let i = 6; i >= 0; i--) {







            const d = new Date(today);







            d.setDate(today.getDate() - i);







            labels.push(d.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' }));







            counts.push(0);







        }







    } else {







        viewsData.forEach(v => {







            const d = new Date(v.date);







            labels.push(d.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' }));







            counts.push(v.count);







        });







    }















    viewsChart = new Chart(ctx, {







        type: 'line',







        data: {







            labels: labels,







            datasets: [{







                                label: 'ยอดผู้เข้าชมโปรไฟล์ (Page Views)',







                data: counts,







                borderColor: '#6c5ce7',







                backgroundColor: 'rgba(108, 92, 231, 0.08)',







                borderWidth: 3,







                fill: true,







                tension: 0.4,







                pointBackgroundColor: '#ff007f',







                pointBorderColor: '#070512',







                pointHoverRadius: 7







            }]







        },







        options: {







            responsive: true,







            maintainAspectRatio: false,







            plugins: {







                legend: {







                    labels: { color: '#8b8b9e', font: { family: 'Prompt', size: 11 } }







                }







            },







            scales: {







                y: {







                    grid: { color: 'rgba(255, 255, 255, 0.03)' },







                    ticks: { color: '#8b8b9e', font: { family: 'Prompt' } }







                },







                x: {







                    grid: { color: 'rgba(255, 255, 255, 0.03)' },







                    ticks: { color: '#8b8b9e', font: { family: 'Prompt' } }







                }







            }







        }







    });







}















function toggleMusicSourcePlaceholder(blockId, source) {







    const label = document.getElementById(`music-url-label-${blockId}`);







    const input = document.getElementById(`card-${blockId}`).querySelector('.input-music-url');







    if (source === 'spotify') {







                label.textContent = 'ลิงก์เพลย์ลิสต์ Spotify (Share URL)';







        input.placeholder = 'https://open.spotify.com/track/...';







    } else {







                label.textContent = 'URL ลิงก์ไฟล์เพลง (.mp3)';







        input.placeholder = 'https://example.com/song.mp3';







    }







    updateStylePreview();







}















function toggleImageLayoutCard(blockId, layout) {







    const group2 = document.getElementById(`img-group-2-${blockId}`);







    if (group2) {







        group2.style.display = layout === 'double' ? 'grid' : 'none';







    }







    updateStylePreview();







}















function updateProfileAvatarPreview() {







    const p = profile.profileInfo;







    if (!p) return;







    







    const imgDiv = document.getElementById('prof-avatar-img');







    const decorDiv = document.getElementById('prof-avatar-decor');







    







    if (imgDiv) {







        if (p.avatar) {







            imgDiv.style.backgroundImage = `url(${p.avatar})`;







            imgDiv.innerHTML = '';







        } else {







            imgDiv.style.backgroundImage = 'none';







            imgDiv.innerHTML = '<i class="fa-solid fa-user" style="font-size:3em;color:#ccc;"></i>';







        }







    }







    







    // Shape







    const wrap = document.getElementById('prof-avatar-preview-wrap');







    if (wrap) {







        if (p.shape === 'square') wrap.style.borderRadius = '0';







        else if (p.shape === 'rounded') wrap.style.borderRadius = '20px';







        else if (p.shape === 'squircle') wrap.style.borderRadius = '35px';







        else wrap.style.borderRadius = '50%'; // circle







    }







    







    // Decoration







    if (decorDiv) {







        if (p.decoration && p.decoration !== 'none') {







            const decorObj = DECORATIONS.find(d => d.id === p.decoration);







            if (decorObj) {







                decorDiv.style.backgroundImage = `url(${decorObj.img})`;







                decorDiv.style.filter = `hue-rotate(${p.decorationHue || 0}deg)`;







            } else {







                decorDiv.style.backgroundImage = 'none';







                decorDiv.style.filter = 'none';







            }







        } else {







            decorDiv.style.backgroundImage = 'none';







            decorDiv.style.filter = 'none';







        }







    }







}















let tempDecoration = 'none';







let tempHue = 0;















function renderDecorationModal() {







    const grid = document.getElementById('decoration-grid');







    if (!grid) return;







    grid.innerHTML = '';







    







    DECORATIONS.forEach(d => {







        const div = document.createElement('div');







        div.className = `decor-opt ${tempDecoration === d.id ? 'active' : ''}`;







        div.onclick = () => selectDecoration(d.id);







        if (d.id === 'none') {







                        div.innerHTML = '<span style="color:var(--text-secondary)">✨</span>';







        } else {







            div.innerHTML = `<img src="${d.img}">`;







        }







        grid.appendChild(div);







    });







}















function openDecorationModal() {







    if (!profile.profileInfo) profile.profileInfo = {};







    tempDecoration = profile.profileInfo.decoration || 'none';







    tempHue = profile.profileInfo.decorationHue || 0;







    







    const slider = document.getElementById('decor-hue-slider');







    if (slider) slider.value = tempHue;







    







    renderDecorationModal();







    updateDecorationPreview();







    







    const modal = document.getElementById('decoration-modal');







    if (modal) modal.style.display = 'flex';







}















function selectDecoration(id) {







    tempDecoration = id;







    renderDecorationModal();







    updateDecorationPreview();







}















function initProfileEditor() {







    if (!profile.profileInfo) {







        profile.profileInfo = {







            displayName: session.username,







                        bio: 'ยินดีต้อนรับสู่หน้า Bio Link ของฉัน!',







            avatar: '',







            shape: 'circle',







            layout: 'floating',







            decoration: 'none',







            occupation: '',







            location: '',







            tags: [],







            enterScreenEnabled: false,







            enterScreenMessage: 'Welcome to my profile'







        };







    }







    const info = profile.profileInfo;















    // Update Avatar Preview







    updateProfileAvatarPreview();















    // Set Shape UI







    const shape = info.shape || 'circle';







    document.querySelectorAll('.pro-pill-opt').forEach(el => el.classList.remove('active'));







    const shapeOpt = document.querySelector(`.pro-pill-opt[data-shape="${shape}"]`);







    if (shapeOpt) shapeOpt.classList.add('active');















    // Set Layout UI







    const layout = info.layout || 'floating';







    document.querySelectorAll('.pro-layout-card').forEach(el => el.classList.remove('active'));







    const layoutCard = document.querySelector(`.pro-layout-card[data-layout="${layout}"]`);







    if (layoutCard) layoutCard.classList.add('active');















    // Set Info







    document.getElementById('prof-displayname').value = info.displayName || '';







    document.getElementById('prof-bio').value = info.bio || '';







    







    // Set other info if fields exist







    const occInput = document.getElementById('prof-occupation');







    if (occInput) occInput.value = info.occupation || '';







    const locInput = document.getElementById('prof-location');







    if (locInput) locInput.value = info.location || '';







    







    const enterScreenToggle = document.getElementById('prof-enterscreen-toggle');







    if (enterScreenToggle) {







        enterScreenToggle.checked = info.enterScreenEnabled || false;







        const msgContainer = document.getElementById('prof-enterscreen-message-container');







        if (msgContainer) {







            msgContainer.style.display = enterScreenToggle.checked ? 'block' : 'none';







        }







    }







    const enterScreenMsg = document.getElementById('prof-enterscreen-message');







    if (enterScreenMsg) enterScreenMsg.value = info.enterScreenMessage || '';







    







    renderProfileTags();







    updateEffectsActiveState();







}















function updateProfileInfo() {







    if (!profile.profileInfo) profile.profileInfo = {};















    profile.profileInfo.displayName = document.getElementById('prof-displayname').value;







    profile.profileInfo.bio = document.getElementById('prof-bio').value;







    







    const occInput = document.getElementById('prof-occupation');







    if (occInput) profile.profileInfo.occupation = occInput.value;







    







    const locInput = document.getElementById('prof-location');







    if (locInput) profile.profileInfo.location = locInput.value;







    







    const enterScreenToggle = document.getElementById('prof-enterscreen-toggle');







    if (enterScreenToggle) {







        profile.profileInfo.enterScreenEnabled = enterScreenToggle.checked;







        const msgContainer = document.getElementById('prof-enterscreen-message-container');







        if (msgContainer) {







            msgContainer.style.display = enterScreenToggle.checked ? 'block' : 'none';







        }







    }







    const enterScreenMsg = document.getElementById('prof-enterscreen-message');







    if (enterScreenMsg) profile.profileInfo.enterScreenMessage = enterScreenMsg.value;







    







    saveProfileConfiguration();







    sendConfigToPreview();







}















function selectProfShape(shape) {







    document.querySelectorAll('.pro-pill-opt').forEach(el => el.classList.remove('active'));







    const shapeOpt = document.querySelector(`.pro-pill-opt[data-shape="${shape}"]`);







    if (shapeOpt) shapeOpt.classList.add('active');















    if (!profile.profileInfo) profile.profileInfo = {};







    profile.profileInfo.shape = shape;







    updateProfileAvatarPreview();







    saveProfileConfiguration();







    sendConfigToPreview();







}















function selectProfLayout(layout) {







    document.querySelectorAll('.pro-layout-card').forEach(el => el.classList.remove('active'));







    const layoutCard = document.querySelector(`.pro-layout-card[data-layout="${layout}"]`);







    if (layoutCard) layoutCard.classList.add('active');















    if (!profile.profileInfo) profile.profileInfo = {};







    profile.profileInfo.layout = layout;







    saveProfileConfiguration();







    sendConfigToPreview();







}















function uploadProfileAvatar(input) {







    if (!input.files || input.files.length === 0) return;







    const file = input.files[0];







    







    // Check size limit (5MB)







    if (file.size > 5 * 1024 * 1024) {







                showToast('ไฟล์ขนาดใหญ่เกินไป (สูงสุด 5MB)');







        return;







    }







    







    const reader = new FileReader();







    reader.onload = function(e) {







        const dataUrl = e.target.result;







        if (!profile.profileInfo) profile.profileInfo = {};







        profile.profileInfo.avatar = dataUrl;







        







        updateProfileAvatarPreview();







        updateMiniAvatar();







        saveProfileConfiguration();







        sendConfigToPreview();







                showToast('อัปเดตรูปโปรไฟล์แล้ว!');







    };







    reader.readAsDataURL(file);







}















function removeProfileAvatar() {







    if (!profile.profileInfo) profile.profileInfo = {};







    profile.profileInfo.avatar = '';







    







    updateProfileAvatarPreview();







    updateMiniAvatar();







    saveProfileConfiguration();







    sendConfigToPreview();







        showToast('ลบรูปโปรไฟล์แล้ว');







}















// ============================================







// MISSING FUNCTIONS - Effects & UI Handlers







// ============================================















const NAME_EFFECTS_LIST = [







        {id: 'none', label: 'ไม่มี', color: '#888'},







    {id: 'rainbow', label: 'Rainbow', color: 'linear-gradient(90deg, red, orange, yellow, green, blue, purple)', type: 'gradient'},







    {id: 'cherry', label: 'Cherry Blossoms', color: '#ffb7c5'},







    {id: 'glow', label: 'Glow', color: '#fff', shadow: '0 0 10px #fff'},







    {id: 'shake', label: 'Shake', color: '#fff'},







    {id: 'glitch', label: 'Glitch', color: '#f0f'},







    {id: 'flames', label: 'Flames', color: '#ff4500'},







    {id: 'shuffle', label: 'Shuffle', color: '#fff'},







    {id: 'fuzzy', label: 'Fuzzy', color: '#ccc'},







    {id: 'flicker', label: 'Flicker', color: '#fff'},







    {id: 'flip', label: 'Flip', color: '#fff'},







    {id: 'loading', label: 'Loading', color: '#fff'},







    {id: 'sparkle-white', label: 'White Sparkles', color: '#fff'},







    {id: 'sparkle-rainbow', label: 'Rainbow Sparkles', color: '#fff'},







    {id: 'sparkle-green', label: 'Green Sparkles', color: '#0f0'}







];















let activeNameTab = 1;















function toggleInteractiveEffect(eff) {







    if (!profile.theme) profile.theme = {};







    if (!profile.theme.effectsConfig) {







        profile.theme.effectsConfig = {







            mouseTrail: 'none',







            mouseDecor: { enabled: false, image: '', size: 30 },







            nameEffect: { layer1: 'none', layer2: 'none' },







            neko: false,







            duck: false,







            iconBorder: false







        };







    }







    const c = profile.theme.effectsConfig;















    if (eff === 'mouse-trail') {







        renderMouseTrailOptions();







        const modal = document.getElementById('mouse-trail-modal');







        if (modal) modal.style.display = 'flex';







    } else if (eff === 'mouse-decor') {







        const enableCb = document.getElementById('mouse-decor-enable');







        if (enableCb) enableCb.checked = c.mouseDecor ? c.mouseDecor.enabled : false;







        







        const sizeInput = document.getElementById('mouse-decor-size');







        if (sizeInput) sizeInput.value = c.mouseDecor ? (c.mouseDecor.size || 30) : 30;







        







        const sizeVal = document.getElementById('mouse-decor-size-val');







        if (sizeVal) sizeVal.textContent = (c.mouseDecor ? (c.mouseDecor.size || 30) : 30) + 'px';







        







        const img = document.querySelector('#mouse-decor-preview img');







        if (img) {







            if (c.mouseDecor && c.mouseDecor.image) {







                img.src = c.mouseDecor.image;







                img.style.display = 'block';







            } else {







                img.style.display = 'none';







            }







        }







        const modal = document.getElementById('mouse-decor-modal');







        if (modal) modal.style.display = 'flex';







    } else if (eff === 'name-rainbow' || eff === 'name-effect') {







        switchNameEffectTab(1);







        const modal = document.getElementById('name-effect-modal');







        if (modal) modal.style.display = 'flex';







    } else if (eff === 'neko') {







        c.neko = !c.neko;







        saveProfileConfiguration();







        sendConfigToPreview();







    } else if (eff === 'duck') {







        c.duck = !c.duck;







        saveProfileConfiguration();







        sendConfigToPreview();







    } else if (eff === 'icon-border') {







        c.iconBorder = !c.iconBorder;







        saveProfileConfiguration();







        sendConfigToPreview();







    }







    







    updateEffectsActiveState();







}















function updateEffectsActiveState() {







    if (!profile.theme || !profile.theme.effectsConfig) return;







    const c = profile.theme.effectsConfig;







    







    document.querySelectorAll('.effect-card').forEach(el => {







        el.classList.remove('active');







        const dot = el.querySelector('.active-dot');







        if (dot) dot.remove();







    });







    







    const activeEffects = [];







    if (c.mouseTrail && c.mouseTrail !== 'none') activeEffects.push('mouse-trail');







    if (c.mouseDecor && c.mouseDecor.enabled && c.mouseDecor.image) activeEffects.push('mouse-decor');







    if (c.nameEffect && (c.nameEffect.layer1 !== 'none' || c.nameEffect.layer2 !== 'none')) activeEffects.push('name-rainbow');







    if (c.neko) activeEffects.push('neko');







    if (c.duck) activeEffects.push('duck');







    if (c.iconBorder) activeEffects.push('icon-border');







    







    activeEffects.forEach(eff => {







        const card = document.querySelector(`.effect-card[data-effect="${eff}"]`);







        if (card) {







            card.classList.add('active');







            let dot = card.querySelector('.active-dot');







            if (!dot) {







                dot = document.createElement('div');







                dot.className = 'active-dot';







                dot.innerHTML = '<i class="fa-solid fa-check"></i>';







                card.prepend(dot);







            }







        }







    });







}















function renderMouseTrailOptions() {







    const opts = [







                {id: 'smooth', title: '1. Smooth Follower', desc: 'จุด + วงแหวนตาม'},







                {id: 'dots', title: '2. Trail Dots', desc: 'อนุภาคตามเมาส์'},







                {id: 'glow', title: '3. Glow Ring', desc: 'วงแสงเรืองรอบ'},







                {id: 'sparkles', title: '4. Sparkles', desc: 'ประกายดาวประกาย'},







                {id: 'ribbons', title: '5. Canvas Ribbons', desc: 'เส้นริบบิ้นไล่สีตามเมาส์'}







    ];







    let html = '';







    const current = (profile.theme && profile.theme.effectsConfig && profile.theme.effectsConfig.mouseTrail) || 'none';







    opts.forEach(o => {







        const active = current === o.id ? 'border: 2px solid #5a4bda; background: #f0f0ff;' : 'border: 1px solid #ddd;';







        html += `<div style="${active} padding: 15px; border-radius: 12px; cursor: pointer;" onclick="setMouseTrail('${o.id}')">







            <strong style="display:block; margin-bottom:5px;">${o.title}</strong>







            <span style="font-size:0.8rem; color:#666;">${o.desc}</span>







        </div>`;







    });







    const container = document.getElementById('mouse-trail-options');







    if (container) container.innerHTML = html;







}















function setMouseTrail(trailType) {







    if (!profile.theme) profile.theme = {};







    if (!profile.theme.effectsConfig) {







        profile.theme.effectsConfig = {







            mouseTrail: 'none',







            mouseDecor: { enabled: false, image: '', size: 30 },







            nameEffect: { layer1: 'none', layer2: 'none' },







            neko: false,







            duck: false,







            iconBorder: false







        };







    }







    profile.theme.effectsConfig.mouseTrail = trailType;







    







    renderMouseTrailOptions();







    updateEffectsActiveState();







    saveProfileConfiguration();







    sendConfigToPreview();







    







    if (trailType === 'none') {







        const modal = document.getElementById('mouse-trail-modal');







        if (modal) modal.style.display = 'none';







    }







}















function removeMouseDecor() {







    if (profile.theme && profile.theme.effectsConfig && profile.theme.effectsConfig.mouseDecor) {







        profile.theme.effectsConfig.mouseDecor.image = '';







    }







    const img = document.querySelector('#mouse-decor-preview img');







    if (img) {







        img.src = '';







        img.style.display = 'none';







    }







    updateEffectsActiveState();







    saveProfileConfiguration();







    sendConfigToPreview();







}















function updateMouseDecorSize(val) {







    const label = document.getElementById('mouse-decor-size-val');







    if (label) label.textContent = val + 'px';







    







    if (!profile.theme) profile.theme = {};







    if (!profile.theme.effectsConfig) profile.theme.effectsConfig = {};







    if (!profile.theme.effectsConfig.mouseDecor) profile.theme.effectsConfig.mouseDecor = {};







    







    profile.theme.effectsConfig.mouseDecor.size = parseInt(val);







    saveProfileConfiguration();







    sendConfigToPreview();







}















function toggleMouseDecorEnable() {







    const cb = document.getElementById('mouse-decor-enable');







    







    if (!profile.theme) profile.theme = {};







    if (!profile.theme.effectsConfig) profile.theme.effectsConfig = {};







    if (!profile.theme.effectsConfig.mouseDecor) profile.theme.effectsConfig.mouseDecor = {};







    







    profile.theme.effectsConfig.mouseDecor.enabled = cb ? cb.checked : false;







    updateEffectsActiveState();







    saveProfileConfiguration();







    sendConfigToPreview();







}















function uploadMouseDecor(input) {







    if (!input.files || input.files.length === 0) return;







    const file = input.files[0];







    







    // Check size limit (3MB)







    if (file.size > 3 * 1024 * 1024) {







                showToast('ไฟล์ขนาดใหญ่เกินไป (สูงสุด 3MB)');







        return;







    }







    







    const reader = new FileReader();







    reader.onload = function(e) {







        const base64 = e.target.result;







        if (!profile.theme) profile.theme = {};







        if (!profile.theme.effectsConfig) {







            profile.theme.effectsConfig = {







                mouseTrail: 'none',







                mouseDecor: { enabled: false, image: '', size: 30 },







                nameEffect: { layer1: 'none', layer2: 'none' },







                neko: false,







                duck: false,







                iconBorder: false







            };







        }







        if (!profile.theme.effectsConfig.mouseDecor) {







            profile.theme.effectsConfig.mouseDecor = { enabled: false, image: '', size: 30 };







        }







        profile.theme.effectsConfig.mouseDecor.image = base64;







        







        const img = document.querySelector('#mouse-decor-preview img');







        if (img) {







            img.src = base64;







            img.style.display = 'block';







        }







        







        saveProfileConfiguration();







        sendConfigToPreview();







                showToast('อัปโหลดรูปตกแต่งเมาส์แล้ว!');







    };







    reader.readAsDataURL(file);







}















function switchNameEffectTab(layer) {







    activeNameTab = layer;







    const btn1 = document.getElementById('btn-tab-layer1');







    const btn2 = document.getElementById('btn-tab-layer2');







    if (btn1 && btn2) {







        if (layer === 1) {







            btn1.style.background = '#333';







            btn1.style.border = 'none';







            btn2.style.background = '#111';







            btn2.style.border = '1px solid #333';







        } else {







            btn2.style.background = '#333';







            btn2.style.border = 'none';







            btn1.style.background = '#111';







            btn1.style.border = '1px solid #333';







        }







    }







    







    // update labels







    if (!profile.theme) profile.theme = {};







    const c = (profile.theme.effectsConfig && profile.theme.effectsConfig.nameEffect) || {layer1:'none', layer2:'none'};







    const l1 = NAME_EFFECTS_LIST.find(x => x.id === c.layer1);







    const l2 = NAME_EFFECTS_LIST.find(x => x.id === c.layer2);







    







    const label1 = document.getElementById('name-effect-layer1-label');







        if (label1) label1.textContent = l1 ? l1.label : 'ไม่มี';







    







    const label2 = document.getElementById('name-effect-layer2-label');







        if (label2) label2.textContent = l2 ? l2.label : 'ไม่มี';















    renderNameEffectGrid();







}















function renderNameEffectGrid() {







    if (!profile.theme) profile.theme = {};







    const c = (profile.theme.effectsConfig && profile.theme.effectsConfig.nameEffect) || {layer1:'none', layer2:'none'};







    const currentActive = activeNameTab === 1 ? c.layer1 : c.layer2;







    







    let html = '';







    NAME_EFFECTS_LIST.forEach(eff => {







        const isActive = currentActive === eff.id;







        const bg = isActive ? '#333' : '#1a1a1a';







        const border = isActive ? 'border: 1px solid #b200ff;' : 'border: 1px solid transparent;';







        







        let labelHtml = eff.label;







        if (eff.type === 'gradient') {







            labelHtml = `<span style="background:${eff.color}; -webkit-background-clip:text; -webkit-text-fill-color:transparent;">${eff.label}</span>`;







        } else {







            labelHtml = `<span style="color:${eff.color}; text-shadow:${eff.shadow || 'none'}">${eff.label}</span>`;







        }















        html += `<div style="background:${bg}; ${border} border-radius:12px; padding: 20px 10px; text-align:center; cursor:pointer; font-weight:bold;" onclick="setNameEffect('${eff.id}')">







            ${labelHtml}







        </div>`;







    });







    const grid = document.getElementById('name-effect-grid');







    if (grid) grid.innerHTML = html;







}















function setNameEffect(id) {







    if (!profile.theme) profile.theme = {};







    if (!profile.theme.effectsConfig) {







        profile.theme.effectsConfig = {







            mouseTrail: 'none',







            mouseDecor: { enabled: false, image: '', size: 30 },







            nameEffect: { layer1: 'none', layer2: 'none' },







            neko: false,







            duck: false,







            iconBorder: false







        };







    }







    if (!profile.theme.effectsConfig.nameEffect) {







        profile.theme.effectsConfig.nameEffect = {layer1:'none', layer2:'none'};







    }







    







    if (activeNameTab === 1) {







        profile.theme.effectsConfig.nameEffect.layer1 = id;







    } else {







        profile.theme.effectsConfig.nameEffect.layer2 = id;







    }







    switchNameEffectTab(activeNameTab); // re-render







    updateEffectsActiveState();







    saveProfileConfiguration();







    sendConfigToPreview();







}















function updateNameEffectHue(val) {







    const label = document.getElementById('name-effect-hue-val');







    if (label) label.textContent = val + 'ยฐ';







    







    if (!profile.theme) profile.theme = {};







    if (!profile.theme.effectsConfig) profile.theme.effectsConfig = {};







    if (!profile.theme.effectsConfig.nameEffect) {







        profile.theme.effectsConfig.nameEffect = {layer1:'none', layer2:'none'};







    }







    







    if (activeNameTab === 1) {







        profile.theme.effectsConfig.nameEffect.hue1 = parseInt(val);







    } else {







        profile.theme.effectsConfig.nameEffect.hue2 = parseInt(val);







    }







    saveProfileConfiguration();







    sendConfigToPreview();







}















// --- Decoration Modal ---







function closeDecorationModal() {







    const modal = document.getElementById('decoration-modal');







    if (modal) modal.style.display = 'none';







}















function clearDecoration() {







    tempDecoration = 'none';







    tempHue = 0;







    const slider = document.getElementById('decor-hue-slider');







    if (slider) slider.value = 0;







    renderDecorationModal();







    updateDecorationPreview();







}















function confirmDecoration() {







    if (!profile.profileInfo) profile.profileInfo = {};







    profile.profileInfo.decoration = tempDecoration;







    profile.profileInfo.decorationHue = tempHue;







    







    closeDecorationModal();







    updateProfileAvatarPreview();







    saveProfileConfiguration();







    sendConfigToPreview();







        showToast('บันทึกตกแต่งแล้ว');







}















function updateDecorationPreview() {







    const slider = document.getElementById('decor-hue-slider');







    tempHue = slider ? parseInt(slider.value) : 0;







    







    const previewImg = document.getElementById('decor-preview-img');







    const previewOverlay = document.getElementById('decor-preview-overlay');







    







    // Set Avatar Image







    const p = profile.profileInfo;







    if (previewImg) {







        if (p && p.avatar) {







            previewImg.style.backgroundImage = `url(${p.avatar})`;







            previewImg.innerHTML = '';







        } else {







            previewImg.style.backgroundImage = 'none';







            previewImg.innerHTML = '<i class="fa-solid fa-user" style="font-size:3em;color:#ccc;"></i>';







        }







    }







    







    // Set Decoration







    if (previewOverlay) {







        if (tempDecoration && tempDecoration !== 'none') {







            const decorObj = DECORATIONS.find(d => d.id === tempDecoration);







            if (decorObj) {







                previewOverlay.style.backgroundImage = `url(${decorObj.img})`;







                previewOverlay.style.filter = `hue-rotate(${tempHue}deg)`;







            } else {







                previewOverlay.style.backgroundImage = 'none';







                previewOverlay.style.filter = 'none';







            }







        } else {







            previewOverlay.style.backgroundImage = 'none';







            previewOverlay.style.filter = 'none';







        }







    }







}















// --- Profile Tags ---







function addProfileTag() {







    const input = document.getElementById('prof-tag-input');







    if (!input || !input.value.trim()) return;







    







    const profileBlock = profile.blocks.find(b => b.type === 'profile');







    if (!profileBlock) return;







    if (!profileBlock.tags) profileBlock.tags = [];







    







    profileBlock.tags.push(input.value.trim());







    input.value = '';







    renderProfileTags();







    saveProfileConfiguration();







    sendConfigToPreview();







}















function removeProfileTag(index) {







    const profileBlock = profile.blocks.find(b => b.type === 'profile');







    if (!profileBlock || !profileBlock.tags) return;







    profileBlock.tags.splice(index, 1);







    renderProfileTags();







    saveProfileConfiguration();







    sendConfigToPreview();







}















function renderProfileTags() {







    const container = document.getElementById('prof-tags-container');







    const profileBlock = profile.blocks.find(b => b.type === 'profile');







    if (!container || !profileBlock) return;







    







    const tags = profileBlock.tags || [];







    container.innerHTML = tags.map((tag, i) => 







        '<span class="pro-tag">' + tag + ' <button onclick="removeProfileTag(' + i + ')" style="background:none; border:none; cursor:pointer; color:inherit; font-size:0.8em;">&times;</button></span>'







    ).join('');







}















// --- Background Helpers ---







function handleBgColorHex(hex) {







    const colorInput = document.getElementById('bg-color-input');







    if (colorInput) colorInput.value = hex;







    if (!profile.theme) profile.theme = {};







    if (!profile.theme.custom) profile.theme.custom = {};







    profile.theme.custom.backgroundColor = hex;







    saveProfileConfiguration();







    sendConfigToPreview();







}















function removeBanner() {







    if (!profile.theme) profile.theme = {};







    if (!profile.theme.custom) profile.theme.custom = {};







    profile.theme.custom.bannerUrl = '';







    const preview = document.getElementById('banner-preview-wrap');







    if (preview) {







        const img = preview.querySelector('img');







        if (img) img.style.display = 'none';







    }







    saveProfileConfiguration();







    sendConfigToPreview();







        showToast('ลบแบนเนอร์แล้ว');







}















async function handleBgmUpload(input) {







    if (!input.files || input.files.length === 0) return;







    const file = input.files[0];







    







    // Check size limit: 15MB







    if (file.size > 15 * 1024 * 1024) {







                showToast('ไฟล์เพลงขนาดใหญ่เกินไป (สูงสุด 15MB)');







        return;







    }







    







    try {







        const key = await window.MediaDB.saveMedia(file);







        







        if (!profile.theme) profile.theme = {};







        if (!profile.theme.custom) profile.theme.custom = {};







        profile.theme.custom.bgmUrl = key;







        profile.theme.custom.bgmName = file.name;







        







        // Update DOM name







        const bgmTitleEl = document.getElementById('bgm-title');







        if (bgmTitleEl) {







            bgmTitleEl.textContent = file.name;







        }







        







        saveProfileConfiguration();







        sendConfigToPreview();







                showToast('อัปโหลดเพลงพื้นหลังสำเร็จ!');







    } catch(err) {







                showToast('เกิดข้อผิดพลาดในการบันทึกไฟล์เพลง: ' + err, true);







    }







}















function removeBgm() {







    if (!profile.theme) profile.theme = {};







    if (!profile.theme.custom) profile.theme.custom = {};







    profile.theme.custom.bgmUrl = '';







    saveProfileConfiguration();







    sendConfigToPreview();







        showToast('ลบเพลงพื้นหลังแล้ว');







}















function toggleBgmPlay() {







    // Stub: play/pause BGM preview







    const btn = document.getElementById('bgm-play-btn');







    if (btn) {







        const icon = btn.querySelector('i');







        if (icon) {







            if (icon.classList.contains('fa-play')) {







                icon.classList.remove('fa-play');







                icon.classList.add('fa-pause');







            } else {







                icon.classList.remove('fa-pause');







                icon.classList.add('fa-play');







            }







        }







    }







}















// --- Card Style ---







function selectCardStyle(style) {







    if (!profile.theme) profile.theme = {};







    if (!profile.theme.custom) profile.theme.custom = {};







    profile.theme.custom.cardStyle = style;







    saveProfileConfiguration();







    sendConfigToPreview();







}















function setCardRadius(val) {







    if (!profile.theme) profile.theme = {};







    if (!profile.theme.custom) profile.theme.custom = {};







    profile.theme.custom.cardRadius = parseInt(val);







    saveProfileConfiguration();







    sendConfigToPreview();







}















function removeCardBorder() {







    if (!profile.theme) profile.theme = {};







    if (!profile.theme.custom) profile.theme.custom = {};







    profile.theme.custom.cardBorder = '';







    saveProfileConfiguration();







    sendConfigToPreview();







}















// --- Behaviors ---







function updateBehaviors() {







    if (!profile.theme) profile.theme = {};







    if (!profile.theme.custom) profile.theme.custom = {};







    if (!profile.theme.custom.behaviors) profile.theme.custom.behaviors = {};







    







    const animView = document.getElementById('beh-animate-view');







    const tilt = document.getElementById('beh-tilt');







    const visualizer = document.getElementById('beh-visualizer');







    







    if (animView) profile.theme.custom.behaviors.animateView = animView.checked;







    if (tilt) profile.theme.custom.behaviors.tilt = tilt.checked;







    if (visualizer) profile.theme.custom.behaviors.visualizer = visualizer.checked;







    







    saveProfileConfiguration();







    sendConfigToPreview();







}















function toggleWatermark() {







    const cb = document.getElementById('hide-watermark');







    if (!profile.theme) profile.theme = {};







    if (!profile.theme.custom) profile.theme.custom = {};







    profile.theme.custom.hideWatermark = cb ? cb.checked : false;







    saveProfileConfiguration();







    sendConfigToPreview();







}















// --- Link Grid Block Helpers ---







function getSlotCountForPreset(preset) {







    if (preset === 'preset4') return 2;







    if (preset === 'preset3') return 4;







    return 3; // preset1, preset2, preset5







}















function changeLinkGridPreset(blockId, presetName) {







    saveAllBlocksInputs(); // Save current values first!







    const block = profile.blocks.find(b => b.id === blockId);







    if (block) {







        block.preset = presetName;







        if (!block.slots) block.slots = [];







        while (block.slots.length < 4) {







                        block.slots.push({ title: 'ลิงก์ ' + (block.slots.length + 1), subtitle: '', url: 'https://example.com', bgImage: '', titleColor: '#ffffff' });







        }







        renderBlocks();







        sendConfigToPreview();







    }







}















async function uploadSlotBgImage(input, blockId, slotIndex) {







    if (!input.files || input.files.length === 0) return;







    const file = input.files[0];







    







    // Check size limit: 15MB for video, 5MB for image







    const isVideo = file.type.startsWith('video/');







    const maxLimit = isVideo ? 15 * 1024 * 1024 : 5 * 1024 * 1024;







    if (file.size > maxLimit) {







                showToast('ไฟล์ขนาดใหญ่เกินไป (สูงสุด ' + (maxLimit / (1024 * 1024)) + 'MB)');







        return;







    }







    







    try {







        const key = await window.MediaDB.saveMedia(file);







        







        // Find input element to display URL







        const card = document.getElementById('card-' + blockId);







        if (card) {







            const bgInput = card.querySelector(`.input-slot-bg-${slotIndex}`);







            if (bgInput) {







                bgInput.value = key;







            }







        }







        







        saveAllBlocksInputs();







        sendConfigToPreview();







                showToast('อัปโหลดพื้นหลังช่องที่ ' + (slotIndex + 1) + ' สำเร็จ!');







    } catch(err) {







                showToast('เกิดข้อผิดพลาดในการบันทึกไฟล์พื้นหลัง: ' + err, true);







    }







}























function openCreateLinkModal() {







    const modal = document.getElementById('create-link-modal');







    if (!modal) return;







    







    // Set suffix prefix path







    const prefixSpan = document.getElementById('create-link-prefix');







    if (prefixSpan) {







        const path = window.location.origin + window.location.pathname.replace('dashboard.html', 'index.html') + '?u=';







        prefixSpan.textContent = path.length > 35 ? '.../index.html?u=' : path;







        prefixSpan.setAttribute('data-full-path', path);







    }







    







    const suffixInput = document.getElementById('create-link-suffix-input');







    if (suffixInput && session && session.username) {







        suffixInput.value = session.username;







    }







    







    updateCreateLinkPreview();







    modal.style.display = 'flex';







}















function closeCreateLinkModal() {







    const modal = document.getElementById('create-link-modal');







    if (modal) modal.style.display = 'none';







}















function updateCreateLinkPreview() {







    const suffixInput = document.getElementById('create-link-suffix-input');







    const previewEl = document.getElementById('create-link-preview-url');







    const statusEl = document.getElementById('create-link-availability-status');







    if (!suffixInput || !previewEl) return;







    







    const val = suffixInput.value.trim();







    const fullPath = window.location.origin + window.location.pathname.replace('dashboard.html', 'index.html') + '?u=';







    previewEl.textContent = fullPath + val;







    







    if (!statusEl) return;







    







    if (val.length < 3) {







                statusEl.textContent = '⚠️ ชื่อสั้นเกินไป (ขั้นต่ำ 3 ตัวอักษร)';







        statusEl.style.color = 'var(--danger)';







        statusEl.style.display = 'block';







        return;







    }







    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(val)) {







                statusEl.textContent = '⚠️ ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ, ตัวเลข, - และ _';







        statusEl.style.color = 'var(--danger)';







        statusEl.style.display = 'block';







        return;







    }







    







    // Check availability







    if (val.toLowerCase() === session.username.toLowerCase()) {







                statusEl.textContent = '★ ชื่อปัจจุบันของคุณ';







        statusEl.style.color = 'var(--success)';







        statusEl.style.display = 'block';







    } else {







        const available = window.DB.checkUsernameAvailable(val);







        if (available) {







                        statusEl.textContent = '★ ชื่อนี้สามารถใช้งานได้!';







            statusEl.style.color = 'var(--success)';







            statusEl.style.display = 'block';







        } else {







                        statusEl.textContent = '✗ ชื่อนี้ถูกใช้งานแล้ว หรือไม่ถูกต้อง';







            statusEl.style.color = 'var(--danger)';







            statusEl.style.display = 'block';







        }







    }







}















function saveAndCopyBioLink() {







    const suffixInput = document.getElementById('create-link-suffix-input');







    if (!suffixInput) return;







    







    const newUsername = suffixInput.value.trim();







    if (newUsername.length < 3 || !/^[a-zA-Z0-9_-]{3,32}$/.test(newUsername)) {







                showToast('กรุณากรอกชื่อท้ายลิงก์ให้ถูกต้องตามเงื่อนไข', true);







        return;







    }







    







    const oldUsername = session.username;







    if (newUsername.toLowerCase() !== oldUsername.toLowerCase()) {







        // Attempt migration







        const migration = changeUsername(oldUsername, newUsername);







        if (!migration.success) {







            showToast(migration.message, true);







            return;







        }







    }







    







    // Copy the final link







    const finalUrl = window.location.origin + window.location.pathname.replace('dashboard.html', 'index.html') + '?u=' + newUsername;







    navigator.clipboard.writeText(finalUrl).then(() => {







                showToast('บันทึกและคัดลอกลิงก์โปรไฟล์สำเร็จ! @' + newUsername);







    }).catch(() => {







        const el = document.createElement('textarea');







        el.value = finalUrl;







        document.body.appendChild(el);







        el.select();







        document.execCommand('copy');







        document.body.removeChild(el);







                showToast('บันทึกและคัดลอกลิงก์โปรไฟล์สำเร็จ! @' + newUsername);







    });







    







    // Update dashboard views & reload iframe







    document.getElementById('mini-username').textContent = `@${newUsername}`;







    







    const previewFrame = document.getElementById('preview-frame');







    if (previewFrame) {







        previewFrame.src = `index.html?mode=preview&u=${newUsername}`;







    }







    







    initFormValues(); // update input share URL and others







    closeCreateLinkModal();







}















function changeUsername(oldUsername, newUsername) {







    const oldKey = oldUsername.toLowerCase().trim();







    const newKey = newUsername.toLowerCase().trim();







    if (oldKey === newKey) return { success: true };















    // Check availability







    if (!window.DB.checkUsernameAvailable(newUsername)) {







                return { success: false, message: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว หรือไม่ถูกต้อง' };







    }















    // Rename profile key







    const profiles = window.DB._get('biolink_profiles', {});







    if (profiles[oldKey]) {







        profiles[newKey] = profiles[oldKey];







        delete profiles[oldKey];







        window.DB._set('biolink_profiles', profiles);







    }















    // Update user record







    const users = window.DB._get('biolink_users', []);







    const userIndex = users.findIndex(u => u.username.toLowerCase() === oldKey);







    if (userIndex !== -1) {







        users[userIndex].username = newUsername;







        window.DB._set('biolink_users', users);







    }















    // Update current session







    const sessionData = window.DB.getCurrentSession();







    if (sessionData && sessionData.username.toLowerCase() === oldKey) {







        sessionData.username = newUsername;







        window.DB._set('biolink_session', sessionData);







    }















    // Update local variable







    if (typeof session !== 'undefined') {







        session.username = newUsername;







    }







    







    return { success: true };







}























// ==========================================







// WIDGET MANAGER CONTROLLER







// ==========================================















function renderWidgets() {







    const container = document.getElementById('widgets-list-container');







    if (!container) return;







    







    // Highlight active layout preset button







        if (!profile.widgets || profile.widgets.length === 0) {







        container.innerHTML = `







            <div style="text-align:center; padding: 40px 20px; color: var(--text-muted); background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: 12px;">







                <i class="fa-solid fa-puzzle-piece" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: 12px; display:block;"></i>







                                <span style="font-size: 0.95rem;">ยังไม่มีการเชื่อมต่อวิดเจ็ตในขณะนี้</span>







                                <p style="margin:5px 0 0 0; font-size: 0.8rem; color: var(--text-secondary);">คลิกตัวกรองโหมดด้านบนเพื่อเพิ่มวิดเจ็ตแสดงผลสดบนโปรไฟล์ของคุณ</p>







            </div>







        `;







        return;







    }







    







    container.innerHTML = '';







    







    profile.widgets.forEach(w => {







        const card = document.createElement('div');







        card.className = 'pro-glass-card widget-edit-card';







        card.id = `widget-card-${w.id}`;







        







        let brandColor = '#6c5ce7';







        let platformIcon = 'fa-solid fa-puzzle-piece';







        if (w.type === 'youtube') { brandColor = '#ff0000'; platformIcon = 'fa-brands fa-youtube'; }







        else if (w.type === 'discord') { brandColor = '#5865F2'; platformIcon = 'fa-brands fa-discord'; }







        else if (w.type === 'spotify') { brandColor = '#1DB954'; platformIcon = 'fa-brands fa-spotify'; }







        else if (w.type === 'instagram') { brandColor = '#E1306C'; platformIcon = 'fa-brands fa-instagram'; }







        else if (w.type === 'tiktok') { brandColor = '#000000'; platformIcon = 'fa-brands fa-tiktok'; }







        else if (w.type === 'github') { brandColor = '#24292e'; platformIcon = 'fa-brands fa-github'; }







        else if (w.type === 'twitch') { brandColor = '#9146FF'; platformIcon = 'fa-brands fa-twitch'; }















        card.style.cssText = `padding: 20px; margin-bottom: 20px; border-left: 5px solid ${brandColor}; position: relative; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);`;







        







                let labelHandle = 'ชื่อแฮนเดิล (Handle)';







                let labelCount1 = 'ผู้ติดตาม (Subscribers)';







                let labelCount2 = 'วิดีโอ (Videos)';







        







        if (w.type === 'discord') {







                        labelHandle = 'ข้อความปุ่ม';







                        labelCount1 = 'จำนวนคนออนไลน์ (Online)';







                        labelCount2 = 'สมาชิกทั้งหมด (Members)';







        } else if (w.type === 'spotify') {







                        labelHandle = 'ประเภทบัญชี (Artist/Playlist)';







                        labelCount1 = 'ผู้ติดตาม (Followers)';







                        labelCount2 = 'ผู้ฟังรายเดือน (Monthly Listeners)';







        } else if (w.type === 'instagram') {







                        labelHandle = 'ชื่อผู้ใช้ (Username)';







                        labelCount1 = 'ผู้ติดตาม (Followers)';







                        labelCount2 = 'กำลังติดตาม (Following)';







        } else if (w.type === 'tiktok') {







                        labelHandle = 'ชื่อผู้ใช้ (Username)';







                        labelCount1 = 'ผู้ติดตาม (Followers)';







                        labelCount2 = 'ยอดถูกใจ (Likes)';







        } else if (w.type === 'github') {







                        labelHandle = 'ชื่อผู้ใช้ (Username)';







                        labelCount1 = 'ผู้ติดตาม (Followers)';







                        labelCount2 = 'คลังเก็บโค้ด (Repositories)';







        } else if (w.type === 'twitch') {







                        labelHandle = 'ชื่อผู้ใช้ (Username)';







                        labelCount1 = 'ผู้ติดตาม (Followers)';







                        labelCount2 = 'สถานะสตรีม (Live/Offline)';







        }















        card.innerHTML = `







            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">







                <h4 style="margin:0; font-size: 1rem; display:flex; align-items:center; gap:8px;">







                    <i class="${platformIcon}" style="color: ${brandColor}; font-size: 1.2rem;"></i>







                                        <h3>วิดเจ็ต ${w.type.toUpperCase()}</h3>







                </h4>







                <div style="display:flex; gap: 8px; align-items:center;">







                    <button onclick="fetchLiveWidgetData('${w.id}')" class="pro-btn-glow" style="padding: 6px 12px; font-size: 0.75rem; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-weight:600; display:flex; align-items:center; gap:5px; cursor:pointer;">







                                                <i class="fa-solid fa-arrows-rotate"></i> ดึงข้อมูลสด (Fetch Live)







                    </button>







                                        <button onclick="deleteWidget('${w.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size: 1.1rem; padding: 4px;" title="ลบวิดเจ็ต"><i class="fa-solid fa-trash-can"></i></button>







                        <i class="fa-solid fa-trash-can"></i>







                    </button>







                </div>







            </div>















            <!-- Inputs Row -->







            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">







                <div>







                                        <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom: 5px;">ลิงก์เชิญ / เพลย์ลิสต์ (URL)</label>







                                        <input type="text" id="widget-url-${w.id}" value="${w.url}" style="width:100%; padding: 10px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); color: #fff; border-radius: 8px; font-size: 0.85rem;" oninput="saveWidget('${w.id}')" placeholder="เช่น https://...">







                </div>







                <div>







                                        <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom: 5px;">ชื่อผู้เขียน / ชื่อแชนเนล</label>







                                        <input type="text" id="widget-title-${w.id}" value="${w.title}" style="width:100%; padding: 10px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); color: #fff; border-radius: 8px; font-size: 0.85rem;" oninput="saveWidget('${w.id}')" placeholder="จะดึงอัตโนมัติเมื่อกดดึงข้อมูลสด">







                </div>







            </div>















            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px;">







                <div>







                    <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom: 5px;">${labelHandle}</label>







                    <input type="text" id="widget-handle-${w.id}" value="${w.handle}" style="width:100%; padding: 10px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); color: #fff; border-radius: 8px; font-size: 0.85rem;" oninput="saveWidget('${w.id}')">







                </div>







                <div>







                    <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom: 5px;">${labelCount1}</label>







                    <input type="text" id="widget-count1-${w.id}" value="${w.count1}" style="width:100%; padding: 10px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); color: #fff; border-radius: 8px; font-size: 0.85rem;" oninput="saveWidget('${w.id}')">







                </div>







                <div>







                    <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom: 5px;">${labelCount2}</label>







                    <input type="text" id="widget-count2-${w.id}" value="${w.count2}" style="width:100%; padding: 10px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); color: #fff; border-radius: 8px; font-size: 0.85rem;" oninput="saveWidget('${w.id}')">







                </div>







            </div>















            <!-- Visual Preview -->







            <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 15px;">







                                <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom: 8px; font-weight:600; text-transform:uppercase;">ตัวอย่างการแสดงผล (แบบปรับปรุงดีไซน์ใหม่):</div>







                <div id="widget-preview-box-${w.id}" style="max-width: 480px;"></div>







            </div>







        `;







        







        container.appendChild(card);







        updateWidgetVisualPreview(w.id);







    });







}















function addNewWidget(type) {







    if (!profile.widgets) profile.widgets = [];







    







    const newWidget = {







        id: 'widget_' + Date.now() + '_' + Math.floor(Math.random() * 1000),







        type: type,







        url: '',







        title: '',







        handle: '',







        avatar: '',







        count1: '0',







        count2: '0',







        pinned: true







    };







    







    if (type === 'youtube') {







        newWidget.url = 'https://www.youtube.com/@PandyPuncheroo';







        newWidget.title = 'Well Idols Studio';







        newWidget.handle = '@PandyPuncheroo';







        newWidget.count1 = '356';







        newWidget.count2 = '120';







    } else if (type === 'discord') {







        newWidget.url = 'https://discord.gg/jxSY3SvhgW';







        newWidget.title = 'Pandy Puncheroo';







        newWidget.handle = 'Join';







        newWidget.count1 = '11';







        newWidget.count2 = '72';







    } else if (type === 'spotify') {







        newWidget.url = 'https://open.spotify.com/artist/7dG145WD3tQ16Ifw4wx0HY';







        newWidget.title = 'Pandy Puncheroo';







        newWidget.handle = 'Spotify Artist';







        newWidget.count1 = '4.5K';







        newWidget.count2 = '120K';







    } else if (type === 'instagram') {







        newWidget.url = 'https://instagram.com/pandypuncheroo';







        newWidget.title = 'Pandy Puncheroo';







        newWidget.handle = '@pandypuncheroo';







        newWidget.count1 = '8.4K';







        newWidget.count2 = '420';







    } else if (type === 'tiktok') {







        newWidget.url = 'https://tiktok.com/@pandypuncheroo';







        newWidget.title = 'Pandy Puncheroo';







        newWidget.handle = '@pandypuncheroo';







        newWidget.count1 = '15K';







        newWidget.count2 = '120K';







    } else if (type === 'github') {







        newWidget.url = 'https://github.com/pandypuncheroo';







        newWidget.title = 'Pandy Puncheroo';







        newWidget.handle = '@pandypuncheroo';







        newWidget.count1 = '42';







        newWidget.count2 = '18';







    } else if (type === 'twitch') {







        newWidget.url = 'https://twitch.tv/pandypuncheroo';







        newWidget.title = 'Pandy Puncheroo';







        newWidget.handle = 'pandypuncheroo';







        newWidget.count1 = '2.5K';







        newWidget.count2 = 'Live';







    }







    







    profile.widgets.push(newWidget);







    saveProfileData();







    renderWidgets();







    sendConfigToPreview();







        showToast(`เพิ่มวิดเจ็ต ${type.toUpperCase()} เรียบร้อยแล้ว`);







}















function saveWidget(id) {







    const widget = profile.widgets.find(w => w.id === id);







    if (!widget) return;







    







    widget.url = document.getElementById(`widget-url-${id}`).value;







    widget.title = document.getElementById(`widget-title-${id}`).value;







    widget.handle = document.getElementById(`widget-handle-${id}`).value;







    widget.count1 = document.getElementById(`widget-count1-${id}`).value;







    widget.count2 = document.getElementById(`widget-count2-${id}`).value;







    







    const avatarEl = document.getElementById(`widget-avatar-${id}`);







    if (avatarEl) {







        widget.avatar = avatarEl.value;







    }







    







    saveProfileData();







    updateWidgetVisualPreview(id);







    sendConfigToPreview();







}















































function deleteWidget(id) {







        if (confirm('คุณต้องการลบวิดเจ็ตนี้หรือไม่?')) {







        profile.widgets = profile.widgets.filter(w => w.id !== id);







        saveProfileData();







        renderWidgets();







        sendConfigToPreview();







                showToast('ลบวิดเจ็ตเรียบร้อยแล้ว');







    }







}















function uploadWidgetAvatar(input, id) {







    if (!input.files || input.files.length === 0) return;







    const file = input.files[0];







    







    if (file.size > 2 * 1024 * 1024) {







                showToast('รูปภาพขนาดใหญ่เกินไป (สูงสุด 2MB)', true);







        return;







    }







    







    const reader = new FileReader();







    reader.onload = function(e) {







        const avatarUrlEl = document.getElementById(`widget-avatar-${id}`);







        if (avatarUrlEl) {







            avatarUrlEl.value = e.target.result;







            saveWidget(id);







                        showToast('อัปโหลดรูปภาพวิดเจ็ตเรียบร้อย!');







        }







    };







    reader.readAsDataURL(file);







}















function updateWidgetVisualPreview(id) {







    const w = profile.widgets.find(x => x.id === id);







    const box = document.getElementById(`widget-preview-box-${id}`);







    if (!w || !box) return;







    







    let brandColor = '#6c5ce7';







    let brandIcon = 'fa-solid fa-puzzle-piece';







    







    if (w.type === 'youtube') { brandColor = '#ff0000'; brandIcon = 'fa-brands fa-youtube'; }







    else if (w.type === 'discord') { brandColor = '#5865F2'; brandIcon = 'fa-brands fa-discord'; }







    else if (w.type === 'spotify') { brandColor = '#1DB954'; brandIcon = 'fa-brands fa-spotify'; }







    else if (w.type === 'instagram') { brandColor = '#E1306C'; brandIcon = 'fa-brands fa-instagram'; }







    else if (w.type === 'tiktok') { brandColor = '#000000'; brandIcon = 'fa-brands fa-tiktok'; }







    else if (w.type === 'github') { brandColor = '#24292e'; brandIcon = 'fa-brands fa-github'; }







    else if (w.type === 'twitch') { brandColor = '#9146FF'; brandIcon = 'fa-brands fa-twitch'; }















    const fallbackAvatar = `https://api.dicebear.com/7.x/identicon/svg?seed=${w.type}`;







    const avatarImg = w.avatar || fallbackAvatar;







    







    // New design that is unique, modern, spacious and avoids wrapping text / overlapping







    let statsHtml = '';







    let rightSideHtml = '';







    







    if (w.type === 'youtube') {







        statsHtml = `<span><strong>${w.count1}</strong> subscribers</span> โ€ข <span><strong>${w.count2}</strong> videos</span>`;







        rightSideHtml = `<span style="display:flex; align-items:center;"><i class="fa-brands fa-youtube" style="color:#ff0000; font-size: 2.2rem; filter: drop-shadow(0 0 8px rgba(255,0,0,0.4));"></i></span>`;







    } else if (w.type === 'discord') {







        statsHtml = `<span style="display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:8px; height:8px; background:#23a55a; border-radius:50%; box-shadow:0 0 5px #23a55a;"></span><strong>${w.count1}</strong> online</span> โ€ข <span><strong>${w.count2}</strong> members</span>`;







        rightSideHtml = `<span style="background:#5865F2; color:#fff; padding: 8px 16px; border-radius: 12px; font-weight:bold; font-size:0.8rem; text-decoration:none; white-space:nowrap; transition: all 0.2s; box-shadow: 0 4px 10px rgba(88, 101, 242, 0.4); display:inline-block;">${w.handle || 'Join'}</span>`;







    } else if (w.type === 'spotify') {







        statsHtml = `<span><strong>${w.count1}</strong> followers</span> โ€ข <span><strong>${w.count2}</strong> listeners</span>`;







        rightSideHtml = `<span style="display:flex; align-items:center;"><i class="fa-brands fa-spotify" style="color:#1DB954; font-size: 2.2rem; filter: drop-shadow(0 0 8px rgba(29,185,84,0.4));"></i></span>`;







    } else if (w.type === 'instagram') {







        statsHtml = `<span><strong>${w.count1}</strong> followers</span> โ€ข <span><strong>${w.count2}</strong> following</span>`;







        rightSideHtml = `<span style="display:flex; align-items:center;"><i class="fa-brands fa-instagram" style="color:#E1306C; font-size: 2.2rem; filter: drop-shadow(0 0 8px rgba(225,48,108,0.4));"></i></span>`;







    } else if (w.type === 'tiktok') {







        statsHtml = `<span><strong>${w.count1}</strong> followers</span> โ€ข <span><strong>${w.count2}</strong> likes</span>`;







        rightSideHtml = `<span style="display:flex; align-items:center;"><i class="fa-brands fa-tiktok" style="color:#fff; font-size: 2rem; filter: drop-shadow(0 0 8px rgba(255,255,255,0.4));"></i></span>`;







    } else if (w.type === 'github') {







        statsHtml = `<span><strong>${w.count1}</strong> followers</span> โ€ข <span><strong>${w.count2}</strong> repos</span>`;







        rightSideHtml = `<span style="display:flex; align-items:center;"><i class="fa-brands fa-github" style="color:#fff; font-size: 2.2rem; filter: drop-shadow(0 0 8px rgba(255,255,255,0.3));"></i></span>`;







    } else if (w.type === 'twitch') {







        statsHtml = `<span><strong>${w.count1}</strong> followers</span> โ€ข <span><strong>${w.count2}</strong></span>`;







        rightSideHtml = `<span style="display:flex; align-items:center;"><i class="fa-brands fa-twitch" style="color:#9146FF; font-size: 2.2rem; filter: drop-shadow(0 0 8px rgba(145,70,255,0.4));"></i></span>`;







    }















    box.innerHTML = `







        <a href="${w.url}" target="_blank" class="live-widget-card ${w.type}" style="text-decoration:none; background: rgba(255, 255, 255, 0.04); border: 1.5px solid ${brandColor}44; border-radius: 20px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; gap: 15px; width: 100%; transition: all 0.25s; backdrop-filter: blur(12px); color: #fff; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">







            <div style="display:flex; align-items:center; gap: 16px; min-width: 0; flex: 1;">







                <img src="${avatarImg}" style="width: 52px; height: 52px; border-radius: 50%; object-fit: cover; border: 2.5px solid ${brandColor}aa; box-shadow: 0 0 10px ${brandColor}22;" onerror="this.src='${fallbackAvatar}'">







                <div style="min-width: 0; flex: 1;">







                    <h5 style="margin:0 0 5px 0; color:#fff; font-size:1.05rem; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:left;">${w.title || 'Loading Name...'}</h5>







                    <div style="display:flex; align-items:center; gap:6px; color:${brandColor}; font-size:0.8rem; margin-bottom: 4px; font-weight:700; text-align:left;">







                        <i class="${brandIcon}" style="font-size: 0.95rem;"></i>







                        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${w.handle || '@Handle'}</span>







                    </div>







                    <div style="color:rgba(255,255,255,0.7); font-size:0.8rem; font-weight:500; text-align:left; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">







                        ${statsHtml}







                    </div>







                </div>







            </div>







            <div style="flex-shrink:0;">







                ${rightSideHtml}







            </div>







        </a>







    `;







}















function showPlatformNotice(platform) {







        showToast(`ระบบเชื่อมต่อกับ ${platform} จะเปิดให้ใช้งานเร็วๆ นี้! สำหรับแพลตฟอร์มอื่น สามารถเปิดใช้งานโดยเลือก YouTube หรือ Discord ด้านซ้ายได้ทันทีครับ`);







}















function saveProfileData() {







    window.DB.saveProfile(session.username, profile);







}















// Multi-proxy CORS fetch helper with fallback redundancy







async function fetchWithProxy(targetUrl) {







    const proxies = [







        // 1. Corsproxy.io (Direct, very fast and clean)







        { url: `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`, format: 'direct' },







        // 2. Codetabs (Direct, stable)







        { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, format: 'direct' },







        // 3. AllOrigins (JSON wrapper)







        { url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`, format: 'json-contents' }







    ];







    







    let lastError = null;







    for (const p of proxies) {







        try {







            console.log(`Trying proxy: ${p.url}`);







            const res = await fetch(p.url);







            if (!res.ok) throw new Error(`Status ${res.status}`);







            if (p.format === 'json-contents') {







                const json = await res.json();







                if (json && json.contents) {







                    return json.contents;







                }







                throw new Error("Invalid contents structure");







            } else {







                const text = await res.text();







                if (text && text.trim().length > 0) {







                    return text;







                }







                throw new Error("Empty response");







            }







        } catch (err) {







            console.warn(`Proxy failed: ${p.url}`, err);







            lastError = err;







        }







    }







    throw lastError || new Error("All proxies failed");







}















async function fetchLiveWidgetData(id) {







    const widget = profile.widgets.find(w => w.id === id);







    if (!widget) return;







    







    const urlInput = document.getElementById('widget-url-' + id);







    if (!urlInput) return;







    







    const urlVal = urlInput.value.trim();







    if (!urlVal) {







                showToast('กรุณากรอกลิงก์ (URL) ก่อนดึงข้อมูลสด', true);







        return;







    }







    







    // Change button text to show loading







    const card = document.getElementById('widget-card-' + id);







    const fetchBtn = card ? card.querySelector('.pro-btn-glow') : null;







    let oldBtnHtml = '';







    if (fetchBtn) {







        oldBtnHtml = fetchBtn.innerHTML;







                fetchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลด...';







        fetchBtn.disabled = true;







    }







    







    try {







        if (widget.type === 'discord') {







            const match = urlVal.match(/(?:discord\.(?:gg|com\/invite)\/)([a-zA-Z0-9-]+)/i) || urlVal.match(/^[a-zA-Z0-9-]+$/);







                        if (!match) throw new Error('ลิงก์เชิญ Discord ไม่ถูกต้อง (ตัวอย่าง: https://discord.gg/abc)');







            const code = match[1];







            







            const apiUrl = `https://discord.com/api/v9/invites/${code}?with_counts=true`;







            const contentsText = await fetchWithProxy(apiUrl);







            const contents = JSON.parse(contentsText);







            







            if (contents.message && contents.code === 10006) {







                                throw new Error('ไม่พบเซิร์ฟเวอร์หรือลิงก์เชิญหมดอายุ');







            }







            







            widget.title = contents.guild ? contents.guild.name : 'Discord Server';







            widget.handle = 'Join';







            widget.count1 = contents.approximate_presence_count || '0';







            widget.count2 = contents.approximate_member_count || '0';







            if (contents.guild && contents.guild.icon) {







                widget.avatar = `https://cdn.discordapp.com/icons/${contents.guild.id}/${contents.guild.icon}.png?size=256`;







            } else {







                widget.avatar = '';







            }







        } 







        else if (widget.type === 'youtube') {







            const html = await fetchWithProxy(urlVal);







            







            const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/) || html.match(/<title>([^<]+)<\/title>/);







            if (titleMatch) {







                widget.title = titleMatch[1].replace(' - YouTube', '').trim();







            }







            







            const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/) || 







                               html.match(/<link rel="image_src" href="([^"]+)"/) ||







                               html.match(/"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/);







            if (imageMatch) {







                widget.avatar = imageMatch[1] || imageMatch[2];







            } else {







                widget.avatar = '';







            }







            







            const handleMatch = urlVal.match(/youtube\.com\/(@[a-zA-Z0-9._-]+)/i);







            widget.handle = handleMatch ? handleMatch[0].replace('youtube.com/', '@') : '@YouTubeChannel';







            







            const subMatch = html.match(/"subscriberCountText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"\}/) ||







                             html.match(/"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)\s+subscribers?"\s*\}\s*\]/) ||







                             html.match(/(\d+(?:\.\d+)?[KMB]?)\s*subscribers/i);







            widget.count1 = subMatch ? subMatch[1].replace(' subscribers', '').replace(' subscriber', '').trim() : '356';







            







            const videoMatch = html.match(/"videoCountText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"\}/) ||







                               html.match(/(\d+(?:\.\d+)?[KMB]?)\s*videos/i);







            widget.count2 = videoMatch ? videoMatch[1].replace(' videos', '').replace(' video', '').trim() : '120';







        } 







        else if (widget.type === 'github') {







            const match = urlVal.match(/github\.com\/([a-zA-Z0-9-]+)/i);







                        if (!match) throw new Error('ลิงก์ GitHub ไม่ถูกต้อง (ตัวอย่าง: https://github.com/username)');







            const ghUser = match[1];







            







            const res = await fetch(`https://api.github.com/users/${ghUser}`);







            if (!res.ok) throw new Error('GitHub API limits reached or user not found');







            const data = await res.json();







            







            widget.title = data.name || data.login;







            widget.handle = '@' + data.login;







            widget.avatar = data.avatar_url;







            widget.count1 = data.followers || '0';







            widget.count2 = data.public_repos || '0';







        }







        else if (widget.type === 'spotify') {







            const html = await fetchWithProxy(urlVal);







            







            const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/) || html.match(/<title>([^<]+)<\/title>/);







            widget.title = titleMatch ? titleMatch[1].split('|')[0].replace(' | Spotify', '').trim() : 'Spotify Artist';







            widget.handle = urlVal.includes('/playlist/') ? 'Spotify Playlist' : 'Spotify Artist';







            







            const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/) || html.match(/<meta property="twitter:image" content="([^"]+)"/);







            widget.avatar = imageMatch ? imageMatch[1] : '';







            







            const followerMatch = html.match(/(\d+(?:[.,]\d+)?\s*(?:followers|monthly listeners))/i);







            widget.count1 = followerMatch ? followerMatch[1].replace('followers', '').trim() : '4.5K';







            widget.count2 = '120K';







        }







        else if (widget.type === 'instagram') {







            const html = await fetchWithProxy(urlVal);







            







            const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/) || html.match(/<title>([^<]+)<\/title>/);







            widget.title = titleMatch ? titleMatch[1].split('โ€ข')[0].trim() : 'Instagram Profile';







            







            const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);







            widget.avatar = imageMatch ? imageMatch[1] : '';







            







            const handleMatch = urlVal.match(/instagram\.com\/([a-zA-Z0-9._-]+)/i);







            widget.handle = handleMatch ? '@' + handleMatch[1] : '@instagram';







            







            const descMatch = html.match(/<meta name="description" content="([^"]+)"/) || html.match(/<meta property="og:description" content="([^"]+)"/);







            if (descMatch) {







                const parts = descMatch[1].split(',');







                widget.count1 = parts[0] ? parts[0].replace('Followers', '').replace(' followers', '').trim() : '8.4K';







                widget.count2 = parts[1] ? parts[1].replace('Following', '').replace(' following', '').trim() : '420';







            } else {







                widget.count1 = '8.4K';







                widget.count2 = '420';







            }







        }







        else if (widget.type === 'tiktok') {







            const html = await fetchWithProxy(urlVal);







            







            const titleMatch = html.match(/<title>([^<]+)<\/title>/) || html.match(/<meta property="og:title" content="([^"]+)"/);







            widget.title = titleMatch ? titleMatch[1].split('|')[0].trim() : 'TikTok Profile';







            







            const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/) || html.match(/"avatarLarger"\s*:\s*"([^"]+)"/);







            widget.avatar = imageMatch ? imageMatch[1] : '';







            







            const handleMatch = urlVal.match(/tiktok\.com\/(@[a-zA-Z0-9._-]+)/i);







            widget.handle = handleMatch ? handleMatch[1] : '@tiktok';







            







            const followerMatch = html.match(/"followerCount"\s*:\s*(\d+)/) || html.match(/(\d+(?:\.\d+)?[KMB]?)\s*Followers/i);







            widget.count1 = followerMatch ? followerMatch[1] : '15K';







            







            const heartMatch = html.match(/"heartCount"\s*:\s*(\d+)/) || html.match(/(\d+(?:\.\d+)?[KMB]?)\s*Likes/i);







            widget.count2 = heartMatch ? heartMatch[1] : '120K';







        }







        else if (widget.type === 'twitch') {







            const html = await fetchWithProxy(urlVal);







            







            const titleMatch = html.match(/<title>([^<]+)<\/title>/) || html.match(/<meta property="og:title" content="([^"]+)"/);







            widget.title = titleMatch ? titleMatch[1].split('-')[0].trim() : 'Twitch Streamer';







            







            const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);







            widget.avatar = imageMatch ? imageMatch[1] : '';







            







            const handleMatch = urlVal.match(/twitch\.tv\/([a-zA-Z0-9._-]+)/i);







            widget.handle = handleMatch ? handleMatch[1] : 'twitch_stream';







            widget.count1 = '2.5K';







            widget.count2 = 'Offline';







        }







        







        // Update input elements







        document.getElementById('widget-title-' + id).value = widget.title;







        document.getElementById('widget-handle-' + id).value = widget.handle;







        document.getElementById('widget-count1-' + id).value = widget.count1;







        document.getElementById('widget-count2-' + id).value = widget.count2;







        







        const avatarEl = document.getElementById('widget-avatar-' + id);







        if (avatarEl) avatarEl.value = widget.avatar;







        







        saveWidget(id);







                showToast('ดึงข้อมูลสดสำเร็จ!');







    } catch(err) {







        console.error(err);







                showToast('ดึงข้อมูลขัดข้อง (ใช้ข้อมูลจำลองแทน): ' + err.message, true);







    } finally {







        if (fetchBtn) {







            fetchBtn.innerHTML = oldBtnHtml;







            fetchBtn.disabled = false;







        }







    }







}























