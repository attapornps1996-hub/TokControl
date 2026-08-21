/**
 * TokControl tab: Soundboard
 * Loaded on demand via js/tab-loader.js
 */
(function () {
    'use strict';

    const SB = () => window.TokSoundboard;
    let inited = false;
    let tab = 'library';
    let categoryId = 'all';
    let searchQuery = '';
    let searchTimer = 0;
    let selectedId = null;
    let openPlaylistId = null;
    let capturingHotkeyFor = null;
    let addFiles = [];
    let importMode = 'add';
    let unsub = [];

    function ico(name, size) {
        if (window.TcIcons) return TcIcons.svg(name, { size: size || 16 });
        return '';
    }

    function el(html) {
        const wrap = document.createElement('div');
        wrap.innerHTML = html.trim();
        return wrap.firstElementChild;
    }

    function root() {
        return document.getElementById('sbRoot') || document.getElementById('soundboardView');
    }

    function fmtDate(iso) {
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            return d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
        } catch (_) {
            return iso;
        }
    }

    function currentSounds() {
        return SB().searchSounds(searchQuery, categoryId);
    }

    function catCounts() {
        const sounds = SB().getSounds();
        const map = { all: sounds.length, favorites: sounds.filter((s) => s.favorite).length };
        SB().CATEGORIES.forEach((c) => {
            if (c.id === 'all' || c.id === 'favorites') return;
            map[c.id] = sounds.filter((s) => s.categoryId === c.id).length;
        });
        return map;
    }

    function playingMap() {
        const map = {};
        SB().getActivePlayback().forEach((p) => {
            if (!map[p.soundId]) map[p.soundId] = p;
        });
        return map;
    }

    function shellHtml() {
        return `
        <header class="sb-header">
            <div class="sb-brand">
                <div class="sb-brand-ico" aria-hidden="true">${ico('waveform', 22)}</div>
                <div>
                    <span class="sb-kicker">Audio</span>
                    <h2>SOUNDBOARD</h2>
                    <p>เล่นเสียงเอฟเฟกต์ เพลง หรือเสียงต่าง ๆ ได้ทันที</p>
                </div>
            </div>
            <div class="sb-header-actions">
                <button type="button" class="sb-btn sb-side-toggle" data-act="toggle-side" title="แผงควบคุม" aria-label="แผงควบคุม">${ico('sliders', 14)} ควบคุม</button>
                <button type="button" class="sb-btn" data-act="import">${ico('download', 14)} นำเข้าเสียง</button>
                <button type="button" class="sb-btn sb-btn--go" data-act="add">${ico('plus', 14)} เพิ่มเสียง</button>
            </div>
        </header>
        <div class="sb-tabs" role="tablist">
            <button type="button" class="sb-tab" role="tab" data-tab="library">คลังเสียง</button>
            <button type="button" class="sb-tab" role="tab" data-tab="playlists">เพลย์ลิสต์</button>
            <button type="button" class="sb-tab" role="tab" data-tab="settings">ตั้งค่าการเล่น</button>
        </div>
        <div class="sb-toolbar" id="sbToolbar"></div>
        <div class="sb-workspace" id="sbWorkspace"></div>
        <div class="sb-mini" id="sbMini"></div>
        <input type="file" id="sbFileInput" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm,audio/aac,.mp3,.wav,.ogg,.m4a,.webm,.aac" multiple hidden>
        ${modalsHtml()}
        `;
    }

    function modalsHtml() {
        return `
        <div class="sb-overlay" id="sbAddOverlay" style="display:none;">
            <div class="sb-modal" role="dialog" aria-labelledby="sbAddTitle">
                <div class="sb-modal-head">
                    <h3 id="sbAddTitle">เพิ่มเสียงใหม่</h3>
                    <button type="button" class="sb-icon-btn" data-act="close-add" aria-label="ปิด">×</button>
                </div>
                <div class="sb-modal-body">
                    <div class="sb-drop" id="sbDrop" tabindex="0">ลากไฟล์มาวาง หรือกดเพื่อเลือกไฟล์<br><small>MP3, WAV, OGG, M4A, WEBM · สูงสุด 25 MB</small></div>
                    <div id="sbAddPreview"></div>
                    <label class="sb-field">ชื่อเสียง <input type="text" id="sbAddName" maxlength="80" placeholder="เช่น Applause"></label>
                    <label class="sb-field">หมวดหมู่
                        <select id="sbAddCat"></select>
                    </label>
                    <label class="sb-field">แท็ก <input type="text" id="sbAddTags" placeholder="คั่นด้วยจุลภาค"></label>
                    <label class="sb-field">คีย์ลัด <input type="text" id="sbAddHotkey" readonly placeholder="คลิกแล้วกดปุ่ม"></label>
                    <label class="sb-field">ระดับเสียง <input type="range" id="sbAddVol" min="0" max="100" value="80"></label>
                    <label class="sb-field">โหมดการเล่น
                        <select id="sbAddMode">
                            <option value="oneshot">One Shot</option>
                            <option value="toggle">Toggle</option>
                            <option value="hold">Hold</option>
                        </select>
                    </label>
                </div>
                <div class="sb-modal-foot">
                    <button type="button" class="sb-btn" data-act="close-add">ยกเลิก</button>
                    <button type="button" class="sb-btn sb-btn--go" data-act="save-add">บันทึก</button>
                </div>
            </div>
        </div>
        <div class="sb-overlay" id="sbEditOverlay" style="display:none;">
            <div class="sb-modal" role="dialog" aria-labelledby="sbEditTitle">
                <div class="sb-modal-head">
                    <h3 id="sbEditTitle">แก้ไขเสียง</h3>
                    <button type="button" class="sb-icon-btn" data-act="close-edit" aria-label="ปิด">×</button>
                </div>
                <div class="sb-modal-body" id="sbEditBody"></div>
                <div class="sb-modal-foot">
                    <button type="button" class="sb-btn sb-btn--danger" data-act="delete-edit">ลบ</button>
                    <button type="button" class="sb-btn" data-act="close-edit">ยกเลิก</button>
                    <button type="button" class="sb-btn sb-btn--go" data-act="save-edit">บันทึก</button>
                </div>
            </div>
        </div>`;
    }

    function renderToolbar() {
        const bar = document.getElementById('sbToolbar');
        if (!bar) return;
        if (tab !== 'library') {
            bar.innerHTML = tab === 'playlists'
                ? `<button type="button" class="sb-btn sb-btn--go" data-act="new-pl">${ico('plus', 14)} สร้างเพลย์ลิสต์</button>`
                : '';
            return;
        }
        const vol = SB().getSettings().masterVolume;
        bar.innerHTML = `
            <div class="sb-search-wrap">
                ${ico('search', 14)}
                <input type="search" id="sbSearch" placeholder="ค้นหาเสียง..." value="${escapeAttr(searchQuery)}" aria-label="ค้นหาเสียง">
            </div>
            <button type="button" class="sb-chip ${categoryId === 'favorites' ? 'is-on' : ''}" data-act="fav-filter">${ico('star', 13)} รายการโปรด</button>
            <div class="sb-vol-pill" title="Master Volume">
                ${ico('volume', 14)}
                <input type="range" id="sbMasterVol" min="0" max="100" value="${vol}" aria-label="ความดังหลัก">
                <span id="sbMasterVolLabel">${vol}%</span>
            </div>
        `;
        const search = document.getElementById('sbSearch');
        if (search) {
            search.addEventListener('input', () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => {
                    searchQuery = search.value;
                    renderWorkspace();
                }, 180);
            });
        }
        const slider = document.getElementById('sbMasterVol');
        if (slider) {
            slider.addEventListener('input', () => {
                SB().setMasterVolume(slider.value);
                const lab = document.getElementById('sbMasterVolLabel');
                if (lab) lab.textContent = slider.value + '%';
            });
        }
    }

    function renderWorkspace() {
        const ws = document.getElementById('sbWorkspace');
        if (!ws) return;
        document.querySelectorAll('.sb-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
        if (tab === 'playlists') {
            ws.style.gridTemplateColumns = '1fr';
            ws.innerHTML = openPlaylistId ? playlistDetailHtml() : playlistsHtml();
            bindPlaylist();
            hydrate();
            return;
        }
        if (tab === 'settings') {
            ws.style.gridTemplateColumns = '1fr';
            ws.innerHTML = settingsHtml();
            bindSettings();
            hydrate();
            return;
        }
        ws.style.gridTemplateColumns = '';
        ws.innerHTML = libraryHtml();
        bindLibrary();
        hydrate();
        SB().setLastList(currentSounds().map((s) => s.id));
    }

    function libraryHtml() {
        const counts = catCounts();
        const sounds = currentSounds();
        const playing = playingMap();
        const cats = SB().CATEGORIES.map((c) => `
            <button type="button" class="sb-cat ${categoryId === c.id ? 'active' : ''}" data-cat="${c.id}">
                ${ico(c.icon, 14)}
                <span>${c.label}</span>
                <span class="sb-cat-count">${counts[c.id] || 0}</span>
            </button>`).join('');
        let pads;
        if (!SB().getSounds().length) {
            pads = emptyHtml();
        } else if (!sounds.length) {
            pads = `<div class="sb-empty">${ico('search', 28)}<b>ไม่พบเสียงที่ค้นหา</b><button type="button" class="sb-btn" data-act="clear-search">ล้างการค้นหา</button></div>`;
        } else {
            pads = sounds.map(padHtml).join('') + `<button type="button" class="sb-pad sb-pad-add" data-act="add">${ico('plus', 28)}<span class="sb-pad-name">เพิ่มเสียง</span></button>`;
        }
        return `
            <nav class="sb-cats" aria-label="หมวดหมู่">${cats}</nav>
            <div class="sb-pads-wrap"><div class="sb-pads">${pads}</div></div>
            <aside class="sb-side" id="sbSide">${sideHtml()}</aside>
        `;

        function padHtml(s) {
            const live = playing[s.id];
            const cls = [
                selectedId === s.id ? 'is-selected' : '',
                live ? (live.paused ? 'is-paused' : 'is-playing') : '',
                s.error ? 'is-error' : ''
            ].filter(Boolean).join(' ');
            const art = live && !live.paused
                ? `<div class="sb-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`
                : `<div class="sb-pad-art">${ico(s.icon || 'volume', 28)}</div>`;
            const pct = live && live.duration ? Math.min(100, (live.currentTime / live.duration) * 100) : 0;
            return `
            <div class="sb-pad ${cls}" tabindex="0" role="button" data-pad="${s.id}" aria-label="${escapeAttr(s.name)}">
                <span class="sb-pad-hotkey">${escapeHtml(SB().formatHotkey(s.hotkey) || '')}</span>
                <button type="button" class="sb-pad-fav ${s.favorite ? 'is-on' : ''}" data-fav="${s.id}" aria-label="รายการโปรด">${ico('heart', 14)}</button>
                ${art}
                <div class="sb-pad-name">${escapeHtml(s.name)}</div>
                <div class="sb-pad-dur">${SB().formatDuration(s.duration)}</div>
                <button type="button" class="sb-pad-play" data-play="${s.id}" aria-label="${live && !live.paused ? 'หยุด' : 'เล่น'}">${ico(live && !live.paused ? 'square' : 'play', 12)}</button>
                ${live ? `<div class="sb-pad-progress"><span style="width:${pct}%"></span></div>` : ''}
            </div>`;
        }
    }

    function emptyHtml() {
        return `<div class="sb-empty">${ico('volume', 36)}<b>ยังไม่มีเสียง</b>เพิ่มเสียงแรกของคุณเพื่อเริ่มใช้งาน Soundboard<br><br><button type="button" class="sb-btn sb-btn--go" data-act="add">${ico('plus', 14)} เพิ่มเสียง</button></div>`;
    }

    function sideHtml() {
        const st = SB().getSettings();
        const stats = SB().getStats();
        const mode = st.defaultPlaybackMode;
        return `
            <div class="sb-side-block">
                <div class="sb-side-title">ควบคุมการเล่น</div>
                <div class="sb-side-actions">
                    <button type="button" class="sb-btn sb-btn--wide" data-act="test">${ico('headphones', 14)} ทดสอบเสียง</button>
                    <button type="button" class="sb-btn sb-btn--wide sb-btn--danger" data-act="stop-all">${ico('square', 14)} หยุดเสียงทั้งหมด</button>
                </div>
            </div>
            <div class="sb-side-block">
                <div class="sb-side-title">โหมดการเล่น</div>
                <div class="sb-modes">
                    ${modeRow('hold', 'Hold', 'กดค้างเพื่อเล่น ปล่อยเพื่อหยุด', mode)}
                    ${modeRow('toggle', 'Toggle', 'กดครั้งแรกเล่น กดอีกครั้งหยุด', mode)}
                    ${modeRow('oneshot', 'One Shot', 'กดครั้งเดียวแล้วเล่นจนจบ', mode)}
                </div>
            </div>
            <div class="sb-side-block">
                <div class="sb-side-title">ตั้งค่าการเล่น</div>
                ${sliderRow('sideVol', 'ความดังเริ่มต้น', st.masterVolume, 0, 100, '%')}
                ${sliderRow('sideFadeIn', 'Fade In', st.defaultFadeIn, 0, 5000, ' ms')}
                ${sliderRow('sideFadeOut', 'Fade Out', st.defaultFadeOut, 0, 5000, ' ms')}
                <label class="sb-field">เสียงพร้อมกัน
                    <select id="sideConcurrent">
                        ${[1, 2, 3, 5, 10].map((n) => `<option value="${n}" ${st.maxConcurrent === n ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                </label>
            </div>
            <div class="sb-side-block">
                <div class="sb-side-title">คีย์ลัด</div>
                <div class="sb-hotkey-row"><span>เปิด/ปิด Soundboard</span><b>${escapeHtml(st.openShortcut || 'F8')}</b></div>
                <div class="sb-hotkey-row"><span>หยุดเสียงทั้งหมด</span><b>${escapeHtml(st.stopShortcut || 'F9')}</b></div>
            </div>
            <div class="sb-info">
                เสียงทั้งหมด ${stats.total} เสียง<br>
                ใช้พื้นที่ ${stats.spaceLabel}<br>
                รูปแบบไฟล์ ${stats.formats}<br>
                อัปเดตล่าสุด ${fmtDate(stats.updatedAt)}
            </div>
        `;
        function modeRow(id, label, hint, current) {
            return `<label class="sb-mode ${current === id ? 'is-on' : ''}"><input type="radio" name="sbMode" value="${id}" ${current === id ? 'checked' : ''} hidden><div><b>${label}</b><small>${hint}</small></div></label>`;
        }
        function sliderRow(id, label, val, min, max, suffix) {
            return `<div class="sb-slider-row"><label>${label}<span id="${id}Lab">${val}${suffix}</span></label><input type="range" id="${id}" min="${min}" max="${max}" value="${val}"></div>`;
        }
    }

    function bindLibrary() {
        document.querySelectorAll('[data-cat]').forEach((btn) => {
            btn.addEventListener('click', () => {
                categoryId = btn.getAttribute('data-cat');
                SB().updateSettings({ lastCategory: categoryId });
                renderWorkspace();
            });
        });
        document.querySelectorAll('[data-pad]').forEach((pad) => {
            pad.addEventListener('click', (e) => {
                if (e.target.closest('[data-fav],[data-play]')) return;
                selectedId = pad.getAttribute('data-pad');
                SB().play(selectedId);
            });
            pad.addEventListener('dblclick', () => openEdit(pad.getAttribute('data-pad')));
            pad.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                openEdit(pad.getAttribute('data-pad'));
            });
            pad.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    SB().play(pad.getAttribute('data-pad'));
                }
            });
        });
        document.querySelectorAll('[data-fav]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                SB().toggleFavorite(btn.getAttribute('data-fav'));
            });
        });
        document.querySelectorAll('[data-play]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-play');
                const live = playingMap()[id];
                if (live && !live.paused) SB().stop(id);
                else SB().play(id);
            });
        });
        const side = document.getElementById('sbSide');
        if (side) {
            side.querySelectorAll('input[name="sbMode"]').forEach((r) => {
                r.addEventListener('change', () => {
                    SB().updateSettings({ defaultPlaybackMode: r.value });
                    if (selectedId) SB().updateSound(selectedId, { playbackMode: r.value });
                });
            });
            bindRange('sideVol', (v) => {
                SB().setMasterVolume(v);
                const lab = document.getElementById('sbMasterVolLabel');
                const slider = document.getElementById('sbMasterVol');
                if (lab) lab.textContent = v + '%';
                if (slider) slider.value = v;
            }, '%');
            bindRange('sideFadeIn', (v) => SB().updateSettings({ defaultFadeIn: parseInt(v, 10) || 0 }), ' ms');
            bindRange('sideFadeOut', (v) => SB().updateSettings({ defaultFadeOut: parseInt(v, 10) || 0 }), ' ms');
            const conc = document.getElementById('sideConcurrent');
            if (conc) conc.addEventListener('change', () => {
                const n = parseInt(conc.value, 10) || 1;
                SB().updateSettings({ maxConcurrent: n, allowMultiple: n > 1 });
            });
        }
    }

    function bindRange(id, onInput, suffix) {
        const input = document.getElementById(id);
        const lab = document.getElementById(id + 'Lab');
        if (!input) return;
        input.addEventListener('input', () => {
            if (lab) lab.textContent = input.value + suffix;
            onInput(input.value);
        });
    }

    function playlistsHtml() {
        const lists = SB().getPlaylists();
        if (!lists.length) {
            return `<div class="sb-pads-wrap"><div class="sb-empty">${ico('list', 32)}<b>ยังไม่มีเพลย์ลิสต์</b>จัดกลุ่มเสียงสำหรับไลฟ์หรือเกม<br><br><button type="button" class="sb-btn sb-btn--go" data-act="new-pl">สร้างเพลย์ลิสต์</button></div></div>`;
        }
        const cards = lists.map((p) => {
            const meta = SB().playlistMeta(p);
            return `<div class="sb-pl-card" data-open-pl="${p.id}">
                <h3>${escapeHtml(p.name)}</h3>
                <small>${meta.count} เสียง · ${meta.durationLabel}${p.lastPlayed ? ' · เล่นล่าสุด ' + fmtDate(p.lastPlayed) : ''}</small>
                <div class="sb-pl-actions">
                    <button type="button" class="sb-btn" data-play-pl="${p.id}">เล่นทั้งหมด</button>
                    <button type="button" class="sb-btn" data-ren-pl="${p.id}">เปลี่ยนชื่อ</button>
                    <button type="button" class="sb-btn" data-dup-pl="${p.id}">สำเนา</button>
                    <button type="button" class="sb-btn sb-btn--danger" data-del-pl="${p.id}">ลบ</button>
                </div>
            </div>`;
        }).join('');
        return `<div class="sb-pads-wrap"><div class="sb-playlists">${cards}</div></div>`;
    }

    function playlistDetailHtml() {
        const p = SB().getPlaylist(openPlaylistId);
        if (!p) return playlistsHtml();
        const rows = (p.soundIds || []).map((id, idx) => {
            const s = SB().getSound(id);
            if (!s) return '';
            return `<div class="sb-pl-row" draggable="true" data-idx="${idx}" data-sid="${s.id}">
                <span>${ico('list', 14)}</span>
                <b style="flex:1">${escapeHtml(s.name)}</b>
                <small>${SB().formatDuration(s.duration)}</small>
                <button type="button" class="sb-icon-btn" data-rm-pl="${s.id}" aria-label="เอาออก">${ico('x', 12)}</button>
            </div>`;
        }).join('') || '<div class="sb-empty-inline">ยังไม่มีเสียงในเพลย์ลิสต์ — เพิ่มจากคลังเสียง</div>';
        const addOpts = SB().getSounds().filter((s) => !(p.soundIds || []).includes(s.id))
            .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
        return `<div class="sb-pads-wrap sb-pl-detail">
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <button type="button" class="sb-btn" data-act="pl-back">← เพลย์ลิสต์</button>
                <h3 style="margin:0;flex:1">${escapeHtml(p.name)}</h3>
                <button type="button" class="sb-btn sb-btn--go" data-play-pl="${p.id}">เล่นทั้งหมด</button>
                <button type="button" class="sb-btn" data-shuffle-pl="${p.id}">Shuffle</button>
                <button type="button" class="sb-btn" data-loop-pl="${p.id}">Loop</button>
            </div>
            <div class="sb-pl-list" id="sbPlList">${rows}</div>
            <label class="sb-field">เพิ่มเสียง
                <select id="sbPlAdd"><option value="">เลือกเสียง...</option>${addOpts}</select>
            </label>
        </div>`;
    }

    function bindPlaylist() {
        document.querySelectorAll('[data-open-pl]').forEach((card) => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                openPlaylistId = card.getAttribute('data-open-pl');
                renderWorkspace();
            });
        });
        const add = document.getElementById('sbPlAdd');
        if (add) add.addEventListener('change', () => {
            const p = SB().getPlaylist(openPlaylistId);
            if (!p || !add.value) return;
            SB().setPlaylistSounds(openPlaylistId, (p.soundIds || []).concat([add.value]));
            renderWorkspace();
        });
        bindPlDrag();
    }

    function bindPlDrag() {
        const list = document.getElementById('sbPlList');
        if (!list) return;
        let dragIdx = null;
        list.querySelectorAll('.sb-pl-row').forEach((row) => {
            row.addEventListener('dragstart', () => {
                dragIdx = parseInt(row.getAttribute('data-idx'), 10);
                row.classList.add('dragging');
            });
            row.addEventListener('dragend', () => row.classList.remove('dragging'));
            row.addEventListener('dragover', (e) => e.preventDefault());
            row.addEventListener('drop', (e) => {
                e.preventDefault();
                const to = parseInt(row.getAttribute('data-idx'), 10);
                const p = SB().getPlaylist(openPlaylistId);
                if (!p || dragIdx == null) return;
                const ids = (p.soundIds || []).slice();
                const [moved] = ids.splice(dragIdx, 1);
                ids.splice(to, 0, moved);
                SB().setPlaylistSounds(openPlaylistId, ids);
                renderWorkspace();
            });
        });
    }

    function settingsHtml() {
        const st = SB().getSettings();
        return `
        <div class="sb-settings">
            <div class="sb-card">
                <h3>Soundboard</h3>
                ${toggleRow('stEnabled', 'เปิดใช้งาน Soundboard', st.enabled)}
                ${toggleRow('stMulti', 'อนุญาตให้เล่นหลายเสียงพร้อมกัน', st.allowMultiple)}
                ${toggleRow('stGlobalPads', 'ใช้คีย์ลัดแผงเสียงทั้งระบบ (ขณะโฟกัสแอป / Electron)', st.globalPads)}
                ${toggleRow('stRemember', 'จำระดับเสียง', st.rememberVolume)}
                ${toggleRow('stMute', 'ปิดเสียงชั่วคราว', st.muted)}
            </div>
            <div class="sb-card">
                <h3>ค่าเริ่มต้น</h3>
                <label class="sb-field">โหมดการเล่น
                    <select id="stMode">
                        <option value="oneshot" ${st.defaultPlaybackMode === 'oneshot' ? 'selected' : ''}>One Shot</option>
                        <option value="toggle" ${st.defaultPlaybackMode === 'toggle' ? 'selected' : ''}>Toggle</option>
                        <option value="hold" ${st.defaultPlaybackMode === 'hold' ? 'selected' : ''}>Hold</option>
                    </select>
                </label>
                <label class="sb-field">ความดังหลัก <input type="range" id="stVol" min="0" max="100" value="${st.masterVolume}"></label>
                <label class="sb-field">Fade In (ms) <input type="range" id="stFadeIn" min="0" max="5000" value="${st.defaultFadeIn}"></label>
                <label class="sb-field">Fade Out (ms) <input type="range" id="stFadeOut" min="0" max="5000" value="${st.defaultFadeOut}"></label>
                <label class="sb-field">จำนวนเสียงพร้อมกัน
                    <select id="stConc">${[1, 2, 3, 5, 10].map((n) => `<option value="${n}" ${st.maxConcurrent === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
                </label>
            </div>
            <div class="sb-card">
                <h3>คีย์ลัดระบบ</h3>
                <p style="margin:0 0 10px;color:#8b949e;font-size:0.78rem;">เปลี่ยนได้ที่ ตั้งค่าแอป → ฮอตคีย์ หรือกดช่องด้านล่าง</p>
                <label class="sb-field">เปิด/ปิด Soundboard
                    <input type="text" id="stOpenKey" readonly value="${escapeAttr(st.openShortcut || 'F8')}">
                </label>
                <label class="sb-field">หยุดเสียงทั้งหมด
                    <input type="text" id="stStopKey" readonly value="${escapeAttr(st.stopShortcut || 'F9')}">
                </label>
            </div>
        </div>`;
        function toggleRow(id, label, on) {
            return `<label class="sb-toggle"><span>${label}</span><input type="checkbox" id="${id}" ${on ? 'checked' : ''}></label>`;
        }
    }

    function bindSettings() {
        const map = {
            stEnabled: 'enabled',
            stMulti: 'allowMultiple',
            stGlobalPads: 'globalPads',
            stRemember: 'rememberVolume',
            stMute: 'muted'
        };
        Object.entries(map).forEach(([id, key]) => {
            const input = document.getElementById(id);
            if (!input) return;
            input.addEventListener('change', () => {
                if (key === 'muted') SB().setMuted(input.checked);
                else SB().updateSettings({ [key]: input.checked });
            });
        });
        const mode = document.getElementById('stMode');
        if (mode) mode.addEventListener('change', () => SB().updateSettings({ defaultPlaybackMode: mode.value }));
        const vol = document.getElementById('stVol');
        if (vol) vol.addEventListener('input', () => SB().setMasterVolume(vol.value));
        const fi = document.getElementById('stFadeIn');
        if (fi) fi.addEventListener('input', () => SB().updateSettings({ defaultFadeIn: parseInt(fi.value, 10) || 0 }));
        const fo = document.getElementById('stFadeOut');
        if (fo) fo.addEventListener('input', () => SB().updateSettings({ defaultFadeOut: parseInt(fo.value, 10) || 0 }));
        const conc = document.getElementById('stConc');
        if (conc) conc.addEventListener('change', () => {
            const n = parseInt(conc.value, 10) || 1;
            SB().updateSettings({ maxConcurrent: n, allowMultiple: n > 1 });
        });
        captureInto('stOpenKey', (key) => {
            SB().updateSettings({ openShortcut: key });
            if (typeof setAppHotkeyOverride === 'function') setAppHotkeyOverride('sb-toggle', key);
        });
        captureInto('stStopKey', (key) => {
            SB().updateSettings({ stopShortcut: key });
            if (typeof setAppHotkeyOverride === 'function') setAppHotkeyOverride('sb-stop', key);
        });
    }

    function captureInto(id, apply) {
        const input = document.getElementById(id);
        if (!input) return;
        input.addEventListener('click', () => {
            input.value = 'กดปุ่ม...';
            SB().suspendHotkeys();
            const onKey = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const key = e.key === 'Escape' ? null : (e.key.length === 1 ? e.key.toLowerCase() : e.key);
                window.removeEventListener('keydown', onKey, true);
                SB().resumeHotkeys();
                if (key) apply(key);
                renderWorkspace();
            };
            window.addEventListener('keydown', onKey, true);
        });
    }

    function renderMini() {
        const mini = document.getElementById('sbMini');
        if (!mini) return;
        const tracks = SB().getActivePlayback();
        if (!tracks.length) {
            mini.innerHTML = `<div class="sb-mini-art">${ico('volume', 16)}</div><div class="sb-mini-empty">ยังไม่มีเสียงที่กำลังเล่น</div>`;
            hydrate(mini);
            return;
        }
        const first = tracks[0];
        mini.innerHTML = `
            <div class="sb-mini-art">${ico(first.icon || 'volume', 16)}</div>
            <div class="sb-mini-copy"><b>${escapeHtml(first.name)}</b><small>${SB().formatDuration(first.currentTime)} / ${SB().formatDuration(first.duration)}</small></div>
            <div class="sb-mini-tracks">${tracks.map((t) => `
                <div class="sb-mini-track">
                    <span>${escapeHtml(t.name)}</span>
                    <input type="range" min="0" max="100" value="${t.volume}" data-tv="${t.playId}" aria-label="ความดัง ${escapeAttr(t.name)}">
                    <button type="button" class="sb-icon-btn" data-tp="${t.playId}" aria-label="พัก">${ico(t.paused ? 'play' : 'pause', 12)}</button>
                    <button type="button" class="sb-icon-btn" data-ts="${t.playId}" aria-label="หยุด">${ico('square', 12)}</button>
                </div>`).join('')}</div>
            <div class="sb-mini-controls">
                <button type="button" class="sb-icon-btn" data-act="prev" aria-label="ก่อนหน้า">${ico('play', 12)}</button>
                <button type="button" class="sb-icon-btn" data-act="mini-pause" aria-label="พัก/เล่น">${ico(first.paused ? 'play' : 'pause', 14)}</button>
                <button type="button" class="sb-icon-btn" data-act="stop-all" aria-label="หยุดทั้งหมด">${ico('square', 12)}</button>
                <button type="button" class="sb-icon-btn" data-act="hide-mini" aria-label="ซ่อน">${ico('x', 12)}</button>
            </div>
        `;
        hydrate(mini);
        mini.querySelectorAll('[data-tv]').forEach((sl) => {
            sl.addEventListener('input', () => SB().setTrackVolume(sl.getAttribute('data-tv'), sl.value));
        });
        mini.querySelectorAll('[data-tp]').forEach((b) => b.addEventListener('click', () => SB().pausePlayId(b.getAttribute('data-tp'))));
        mini.querySelectorAll('[data-ts]').forEach((b) => b.addEventListener('click', () => SB().stopPlayId(b.getAttribute('data-ts'))));
    }

    function updatePlayingPads() {
        if (tab !== 'library') return;
        const playing = playingMap();
        document.querySelectorAll('[data-pad]').forEach((pad) => {
            const id = pad.getAttribute('data-pad');
            const live = playing[id];
            pad.classList.toggle('is-playing', !!(live && !live.paused));
            pad.classList.toggle('is-paused', !!(live && live.paused));
            const art = pad.querySelector('.sb-pad-art, .sb-wave');
            if (live && !live.paused) {
                if (!pad.querySelector('.sb-wave')) {
                    const wave = document.createElement('div');
                    wave.className = 'sb-wave';
                    wave.setAttribute('aria-hidden', 'true');
                    wave.innerHTML = '<i></i><i></i><i></i><i></i>';
                    if (art) art.replaceWith(wave);
                }
            } else if (pad.querySelector('.sb-wave')) {
                const sound = SB().getSound(id);
                const wrap = document.createElement('div');
                wrap.className = 'sb-pad-art';
                wrap.innerHTML = ico((sound && sound.icon) || 'volume', 28);
                pad.querySelector('.sb-wave').replaceWith(wrap);
                if (window.TcIcons) TcIcons.hydrateAll(wrap);
            }
            let bar = pad.querySelector('.sb-pad-progress span');
            if (live) {
                if (!pad.querySelector('.sb-pad-progress')) {
                    const prog = document.createElement('div');
                    prog.className = 'sb-pad-progress';
                    prog.innerHTML = '<span></span>';
                    pad.appendChild(prog);
                    bar = prog.querySelector('span');
                }
                const pct = live.duration ? Math.min(100, (live.currentTime / live.duration) * 100) : 0;
                if (bar) bar.style.width = pct + '%';
            } else if (pad.querySelector('.sb-pad-progress')) {
                pad.querySelector('.sb-pad-progress').remove();
            }
            const playBtn = pad.querySelector('[data-play]');
            if (playBtn) playBtn.innerHTML = ico(live && !live.paused ? 'square' : 'play', 12);
        });
    }

    function hydrate(scope) {
        if (window.TcIcons) TcIcons.hydrateAll(scope || root());
    }

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function escapeAttr(str) { return escapeHtml(str).replace(/`/g, ''); }

    function openAdd(files, mode) {
        importMode = mode || 'add';
        addFiles = files ? Array.from(files) : [];
        const ov = document.getElementById('sbAddOverlay');
        const title = document.getElementById('sbAddTitle');
        if (title) title.textContent = importMode === 'import' ? 'นำเข้าเสียง' : 'เพิ่มเสียงใหม่';
        const cat = document.getElementById('sbAddCat');
        if (cat) {
            cat.innerHTML = SB().CATEGORIES.filter((c) => c.id !== 'all' && c.id !== 'favorites')
                .map((c) => `<option value="${c.id}">${c.label}</option>`).join('');
        }
        const name = document.getElementById('sbAddName');
        if (name) name.value = addFiles[0] ? addFiles[0].name.replace(/\.[^.]+$/, '') : '';
        const hk = document.getElementById('sbAddHotkey');
        if (hk) hk.value = SB().formatHotkey(SB().DEFAULT_HOTKEYS.find((k) => !SB().isHotkeyTaken(k)) || '');
        renderAddPreview();
        ov.style.display = 'flex';
        SB().suspendHotkeys();
    }

    function renderAddPreview() {
        const box = document.getElementById('sbAddPreview');
        if (!box) return;
        if (!addFiles.length) { box.innerHTML = ''; return; }
        box.innerHTML = addFiles.map((f, i) => `<div class="sb-field"><b>${escapeHtml(f.name)}</b> · ${SB().formatSize(f.size)}${i === 0 ? '<audio controls preload="metadata"></audio>' : ''}</div>`).join('');
        const audio = box.querySelector('audio');
        if (audio && addFiles[0]) audio.src = URL.createObjectURL(addFiles[0]);
    }

    function closeAdd() {
        const ov = document.getElementById('sbAddOverlay');
        if (ov) ov.style.display = 'none';
        addFiles = [];
        SB().resumeHotkeys();
    }

    async function saveAdd() {
        if (!addFiles.length) {
            SB().toast('error', 'กรุณาเลือกไฟล์เสียง');
            return;
        }
        const meta = {
            name: document.getElementById('sbAddName')?.value || '',
            categoryId: document.getElementById('sbAddCat')?.value || 'sfx',
            tags: String(document.getElementById('sbAddTags')?.value || '').split(',').map((t) => t.trim()).filter(Boolean),
            hotkey: SB().normalizeHotkey(document.getElementById('sbAddHotkey')?.value || ''),
            volume: parseInt(document.getElementById('sbAddVol')?.value, 10) || 80,
            playbackMode: document.getElementById('sbAddMode')?.value || 'oneshot'
        };
        let ok = 0;
        let fail = 0;
        for (let i = 0; i < addFiles.length; i++) {
            const file = addFiles[i];
            const m = i === 0 ? meta : Object.assign({}, meta, { name: file.name.replace(/\.[^.]+$/, ''), hotkey: '' });
            let res = await SB().addSoundFromFile(file, m);
            if (res.duplicate) {
                const replace = typeof tcConfirm === 'function'
                    ? await tcConfirm('ไฟล์ ' + file.name + ' มีอยู่แล้ว ต้องการแทนที่ไฟล์เดิมหรือไม่?', { title: 'ไฟล์ซ้ำ', okLabel: 'แทนที่', cancelLabel: 'ข้าม' })
                    : false;
                if (replace) res = await SB().addSoundFromFile(file, m, { replace: true });
            }
            if (res.ok) ok += 1;
            else { fail += 1; if (res.error) SB().toast('error', res.error, file.name); }
        }
        if (ok) SB().toast('success', 'เพิ่มเสียงเรียบร้อย', ok + ' ไฟล์');
        closeAdd();
        renderAll();
    }

    function openEdit(id) {
        const s = SB().getSound(id);
        if (!s) return;
        selectedId = id;
        const ov = document.getElementById('sbEditOverlay');
        const body = document.getElementById('sbEditBody');
        const cats = SB().CATEGORIES.filter((c) => c.id !== 'all' && c.id !== 'favorites')
            .map((c) => `<option value="${c.id}" ${s.categoryId === c.id ? 'selected' : ''}>${c.label}</option>`).join('');
        body.innerHTML = `
            <div class="sb-field">ชื่อ <input type="text" id="sbEdName" maxlength="80" value="${escapeAttr(s.name)}"></div>
            <div class="sb-info" style="margin:0;border:none;padding:0">
                ไฟล์ ${escapeHtml(s.filename)} · ${SB().formatDuration(s.duration)} · ${escapeHtml(s.format)} · ${SB().formatSize(s.fileSize)}
            </div>
            <label class="sb-field">หมวดหมู่ <select id="sbEdCat">${cats}</select></label>
            <label class="sb-field">แท็ก <input type="text" id="sbEdTags" value="${escapeAttr((s.tags || []).join(', '))}"></label>
            <label class="sb-field">ระดับเสียง <input type="range" id="sbEdVol" min="0" max="100" value="${s.volume}"></label>
            <label class="sb-field">Fade In <input type="range" id="sbEdFi" min="0" max="5000" value="${s.fadeIn || 0}"></label>
            <label class="sb-field">Fade Out <input type="range" id="sbEdFo" min="0" max="5000" value="${s.fadeOut || 0}"></label>
            <label class="sb-field">โหมดการเล่น
                <select id="sbEdMode">
                    <option value="oneshot" ${s.playbackMode === 'oneshot' ? 'selected' : ''}>One Shot</option>
                    <option value="toggle" ${s.playbackMode === 'toggle' ? 'selected' : ''}>Toggle</option>
                    <option value="hold" ${s.playbackMode === 'hold' ? 'selected' : ''}>Hold</option>
                </select>
            </label>
            <label class="sb-field">คีย์ลัด <input type="text" id="sbEdHotkey" readonly value="${escapeAttr(SB().formatHotkey(s.hotkey))}" placeholder="คลิกแล้วกดปุ่ม"></label>
        `;
        const hk = document.getElementById('sbEdHotkey');
        hk.addEventListener('click', () => captureHotkey(hk, (key) => { hk.value = SB().formatHotkey(key); hk.dataset.raw = key; }));
        ov.style.display = 'flex';
        SB().suspendHotkeys();
    }

    function closeEdit() {
        const ov = document.getElementById('sbEditOverlay');
        if (ov) ov.style.display = 'none';
        SB().resumeHotkeys();
    }

    function saveEdit() {
        if (!selectedId) return;
        const hk = document.getElementById('sbEdHotkey');
        const ok = SB().updateSound(selectedId, {
            name: document.getElementById('sbEdName')?.value,
            categoryId: document.getElementById('sbEdCat')?.value,
            tags: String(document.getElementById('sbEdTags')?.value || '').split(',').map((t) => t.trim()).filter(Boolean),
            volume: parseInt(document.getElementById('sbEdVol')?.value, 10),
            fadeIn: parseInt(document.getElementById('sbEdFi')?.value, 10),
            fadeOut: parseInt(document.getElementById('sbEdFo')?.value, 10),
            playbackMode: document.getElementById('sbEdMode')?.value,
            hotkey: hk?.dataset.raw != null ? hk.dataset.raw : SB().normalizeHotkey(hk?.value)
        });
        if (ok) {
            SB().toast('success', 'บันทึกคีย์ลัดแล้ว', 'อัปเดตเสียงเรียบร้อย');
            closeEdit();
        }
    }

    async function deleteEdit() {
        if (!selectedId) return;
        const ok = typeof tcConfirm === 'function'
            ? await tcConfirm('ลบเสียงนี้ออกจาก Soundboard?', { title: 'ลบเสียง', okLabel: 'ลบ', tone: 'danger' })
            : true;
        if (!ok) return;
        await SB().deleteSound(selectedId);
        SB().toast('success', 'ลบเสียงแล้ว');
        selectedId = null;
        closeEdit();
    }

    function captureHotkey(input, apply) {
        input.value = 'กดปุ่ม...';
        SB().suspendHotkeys();
        const onKey = (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.removeEventListener('keydown', onKey, true);
            SB().resumeHotkeys();
            if (e.key === 'Escape') {
                input.value = '';
                apply('');
                return;
            }
            const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            if (SB().isReservedHotkey(key, selectedId) || SB().isHotkeyTaken(key, selectedId)) {
                SB().toast('error', 'ปุ่มนี้ถูกใช้งานแล้ว');
                input.value = '';
                return;
            }
            apply(key);
        };
        window.addEventListener('keydown', onKey, true);
    }

    function onRootClick(e) {
        const act = e.target.closest('[data-act]')?.getAttribute('data-act');
        handlePlButtons(e);
        if (!act) {
            const tabBtn = e.target.closest('[data-tab]');
            if (tabBtn) {
                tab = tabBtn.getAttribute('data-tab');
                openPlaylistId = null;
                renderAll();
            }
            return;
        }
        if (act === 'fav-filter') {
            categoryId = categoryId === 'favorites' ? 'all' : 'favorites';
            renderAll();
            return;
        }
        if (act === 'add') openAdd(null, 'add');
        if (act === 'import') {
            importMode = 'import';
            document.getElementById('sbFileInput')?.click();
        }
        if (act === 'close-add') closeAdd();
        if (act === 'save-add') saveAdd();
        if (act === 'close-edit') closeEdit();
        if (act === 'save-edit') saveEdit();
        if (act === 'delete-edit') deleteEdit();
        if (act === 'test') {
            const id = selectedId || currentSounds()[0]?.id || SB().getSounds()[0]?.id;
            if (id) SB().play(id, { force: true });
            else SB().toast('error', 'ยังไม่มีเสียง');
        }
        if (act === 'stop-all') SB().stopAll();
        if (act === 'clear-search') {
            searchQuery = '';
            renderAll();
        }
        if (act === 'new-pl') {
            const p = SB().createPlaylist('เพลย์ลิสต์ใหม่');
            openPlaylistId = p.id;
            renderAll();
        }
        if (act === 'pl-back') {
            openPlaylistId = null;
            renderAll();
        }
        if (act === 'prev') SB().playAdjacent(-1);
        if (act === 'mini-pause') {
            const t = SB().getActivePlayback()[0];
            if (t) SB().pausePlayId(t.playId);
        }
        if (act === 'hide-mini') {
            const mini = document.getElementById('sbMini');
            if (mini) mini.style.display = 'none';
        }
        if (act === 'toggle-side') {
            document.getElementById('sbSide')?.classList.toggle('is-open');
        }
    }

    function handlePlButtons(e) {
        const play = e.target.closest('[data-play-pl]');
        const del = e.target.closest('[data-del-pl]');
        const dup = e.target.closest('[data-dup-pl]');
        const ren = e.target.closest('[data-ren-pl]');
        const rm = e.target.closest('[data-rm-pl]');
        const sh = e.target.closest('[data-shuffle-pl]');
        const lp = e.target.closest('[data-loop-pl]');
        if (play) SB().playPlaylist(play.getAttribute('data-play-pl'));
        if (dup) {
            SB().duplicatePlaylist(dup.getAttribute('data-dup-pl'));
            renderAll();
        }
        if (ren) {
            const id = ren.getAttribute('data-ren-pl');
            const p = SB().getPlaylist(id);
            const name = window.prompt('ชื่อเพลย์ลิสต์', p?.name || '');
            if (name) SB().renamePlaylist(id, name);
            renderAll();
        }
        if (del) {
            const id = del.getAttribute('data-del-pl');
            const go = typeof tcConfirm === 'function' ? tcConfirm('ลบเพลย์ลิสต์นี้?', { title: 'ลบเพลย์ลิสต์', tone: 'danger' }) : Promise.resolve(true);
            Promise.resolve(go).then((ok) => {
                if (!ok) return;
                SB().deletePlaylist(id);
                if (openPlaylistId === id) openPlaylistId = null;
                renderAll();
            });
        }
        if (rm && openPlaylistId) {
            const p = SB().getPlaylist(openPlaylistId);
            SB().setPlaylistSounds(openPlaylistId, (p.soundIds || []).filter((x) => x !== rm.getAttribute('data-rm-pl')));
            renderAll();
        }
        if (sh) SB().playPlaylist(sh.getAttribute('data-shuffle-pl'), { shuffle: true });
        if (lp) SB().playPlaylist(lp.getAttribute('data-loop-pl'), { loop: true });
    }

    function bindStatic() {
        const r = root();
        r.addEventListener('click', onRootClick);
        const file = document.getElementById('sbFileInput');
        if (file) {
            file.addEventListener('change', () => {
                const files = Array.from(file.files || []);
                file.value = '';
                if (files.length) openAdd(files, importMode);
            });
        }
        const drop = document.getElementById('sbDrop');
        if (drop) {
            drop.addEventListener('click', () => document.getElementById('sbFileInput')?.click());
            ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
                e.preventDefault();
                drop.classList.add('is-over');
            }));
            ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
                e.preventDefault();
                drop.classList.remove('is-over');
            }));
            drop.addEventListener('drop', (e) => {
                const files = Array.from(e.dataTransfer?.files || []);
                if (files.length) {
                    addFiles = addFiles.concat(files);
                    if (!document.getElementById('sbAddName').value && files[0]) {
                        document.getElementById('sbAddName').value = files[0].name.replace(/\.[^.]+$/, '');
                    }
                    renderAddPreview();
                }
            });
        }
        const addHk = document.getElementById('sbAddHotkey');
        if (addHk) addHk.addEventListener('click', () => captureHotkey(addHk, (key) => { addHk.value = SB().formatHotkey(key); }));
        document.getElementById('sbAddOverlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'sbAddOverlay') closeAdd();
        });
        document.getElementById('sbEditOverlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'sbEditOverlay') closeEdit();
        });
    }

    function renderAll() {
        renderToolbar();
        renderWorkspace();
        renderMini();
    }

    function showSkeleton() {
        const r = root();
        if (!r) return;
        r.innerHTML = `<div class="sb-workspace">
            <div class="sb-cats">${'<div class="sb-sk sb-sk-cat"></div>'.repeat(7)}</div>
            <div class="sb-pads-wrap"><div class="sb-pads">${'<div class="sb-sk sb-sk-pad"></div>'.repeat(8)}</div></div>
            <div class="sb-side">${'<div class="sb-sk sb-sk-side"></div>'.repeat(8)}</div>
        </div><div class="sb-mini"><div class="sb-sk" style="height:28px;flex:1"></div></div>`;
    }

    async function initSoundboardUI() {
        const mount = document.getElementById('sbRoot');
        if (!mount) return;
        if (!window.TokSoundboard) {
            mount.innerHTML = '<div class="sb-empty"><b>โหลด Soundboard ไม่สำเร็จ</b>ลองรีเฟรชหน้า</div>';
            return;
        }
        showSkeleton();
        await TokSoundboard.ready;
        categoryId = TokSoundboard.getSettings().lastCategory || 'all';
        if (!inited) {
            mount.innerHTML = shellHtml();
            bindStatic();
            unsub.push(TokSoundboard.on('change', () => {
                if (document.getElementById('soundboardView')?.classList.contains('active')) renderAll();
            }));
            unsub.push(TokSoundboard.on('playback', () => {
                if (document.getElementById('soundboardView')?.classList.contains('active')) {
                    updatePlayingPads();
                    renderMini();
                }
            }));
            inited = true;
        }
        renderAll();
        hydrate();
    }

    window.initSoundboardUI = initSoundboardUI;
})();
