// public.js - Super Bio Builder PRO Public Render Engine & Preview Sync



let profileUsername = '';

let isPreviewMode = false;

let canvas = null;

let ctx = null;

let animFrameId = null;

let canvasElements = [];

let activeAudio = null; // store currently playing HTML5 audio element



document.addEventListener('DOMContentLoaded', async () => {

    // 1. Route Detection

    const urlParams = new URLSearchParams(window.location.search);

    const username = urlParams.get('u');

    isPreviewMode = urlParams.get('mode') === 'preview' || urlParams.get('preview') === 'true';



    const profilePage = document.getElementById('profile-page');

    const landingPage = document.getElementById('landing-page');



    if (isPreviewMode) {

        // Preview mode: show profile page immediately

        landingPage.style.display = 'none';

        profilePage.style.display = 'flex';

        document.body.style.backgroundColor = '#0c081e'; // default dark bg



        // Load current session's profile from localStorage for initial render

        const session = window.DB.getCurrentSession();

        if (session) {

            const profile = window.DB.getProfile(session.username);

            if (profile) {

                applyProfileConfig(session.username, profile.blocks, profile.theme, profile.profileInfo, profile.widgets);

            }

        }

        // Tell parent dashboard that preview frame is ready to sync

        window.parent.postMessage({ type: 'PREVIEW_READY' }, '*');

    } else if (username) {

        // Render Public Bio Page

        profileUsername = username.toLowerCase().trim();

        landingPage.style.display = 'none';

        profilePage.style.display = 'flex';

        

        loadBioPage(profileUsername);

    } else {

        // Render Landing Page

        landingPage.style.display = 'block';

        profilePage.style.display = 'none';

        document.title = "Super Bio Builder PRO | รวมลิงก์โซเชียลของคุณได้ฟรี";

    }



    // 2. Setup Real-time postMessage preview sync (for live updates from dashboard)

    window.addEventListener('message', async (event) => {

        try {

            if (event.data && event.data.type === 'UPDATE_BIOLINK_PREVIEW') {

                const config = event.data.data;

                console.log("Received config in preview:", config);

                

                // Pause any playing audio first when updating

                if (activeAudio) {

                    activeAudio.pause();

                    activeAudio = null;

                }

                

                await applyProfileConfig(config.username, config.blocks, config.theme, config.profileInfo, config.widgets);

            }

        } catch (err) {

            console.error("Error in preview message listener:", err);

        }

    });

});



function loadBioPage(username) {
    let profile = window.DB.getProfile(username);
    // TokControl: ถ้ายังไม่มีโปรไฟล์ในเครื่องนี้ ให้สร้างค่าเริ่มต้น (เปิดหน้า Bio ได้ทันที)
    if (!profile && window.DB && typeof window.DB.ensureTokControlUser === 'function') {
        const boot = window.DB.ensureTokControlUser(username, { source: 'tokcontrol-public' });
        if (boot && boot.success) {
            profile = window.DB.getProfile(boot.username || username);
        }
    }
    if (!profile) {
        renderUserNotFound(username);
        return;
    }



    // Log Analytics View (if actual visitor)

    if (!isPreviewMode) {

        window.DB.logView(username);

    }



    applyProfileConfig(username, profile.blocks, profile.theme, profile.profileInfo, profile.widgets);

}



function renderUserNotFound(username) {

    const profilePage = document.getElementById('profile-page');

    document.title = "ไม่พบหน้าผู้ใช้งาน | Super Bio Builder";

    

    document.documentElement.style.setProperty('--bg-color', '#070512');

    document.documentElement.style.setProperty('--text-color', '#ffffff');

    

    profilePage.innerHTML = `

        <div class="bio-container" style="text-align: center; padding-top: 15vh;">

            <i class="fa-solid fa-triangle-exclamation" style="font-size: 4rem; color: #ff7675; margin-bottom: 20px;"></i>

            <h1 style="font-size: 1.8rem; margin-bottom: 10px;">ไม่พบหน้าผู้ใช้งานนี้</h1>

            <p style="color: #8b8b9e; margin-bottom: 30px;">ชื่อบัญชี @${username} ยังไม่มีในฐานข้อมูล คุณสามารถสมัครและจับจองชื่อนี้ได้ฟรีก่อนใคร!</p>

            <a href="/biolink/login.html?u=${username}" class="nav-btn-primary" style="padding:14px 28px; border-radius:50px; text-decoration:none;">จองชื่อ @${username} ตอนนี้</a>

        </div>

    `;

}



async function applyProfileConfig(username, blocks, theme, profileInfo, widgets) {

    try {

        document.title = `@${username} | Super Bio Builder`;



        // 1. Apply Styles & Fonts

        if (theme && theme.custom) {

            applyThemeStyles(theme.custom);

        }



        // 2. Render Blocks Loop

        if (blocks) {

            await renderBlocks(username, blocks, theme ? theme.custom : null);

        }



        // 1.5 Render Profile Header (call after renderBlocks because renderBlocks wipes container)

        if (profileInfo) {

            await renderProfileHeader(username, profileInfo, theme ? theme.custom : null);

        }



        // 1.7 Render Widgets Grid

        if (widgets && widgets.length > 0) {

            await renderPublicWidgets(widgets, theme ? theme.custom : null);

        }



        // 3. Apply Premium Fusions PRO Effects

        if (theme && theme.custom) {

            applyPremiumEffects(theme.custom);

        }

        

        await applyProAppearance(theme);

    } catch (err) {

        console.error("Error in applyProfileConfig:", err);

    }

}



async function applyThemeStyles(themeCustom) {

    const root = document.documentElement;



    // Apply main style tokens

    root.style.setProperty('--bg-color', themeCustom.backgroundColor);

    root.style.setProperty('--button-bg', themeCustom.buttonColor);

    root.style.setProperty('--button-text', themeCustom.buttonTextColor);

    root.style.setProperty('--button-radius', `${themeCustom.buttonBorderRadius}px`);

    root.style.setProperty('--button-shadow', themeCustom.buttonShadow);

    root.style.setProperty('--font-family', `'${themeCustom.fontFamily}', sans-serif`);



    // Dynamically load Google Font

    if (themeCustom.fontFamily && !document.getElementById(`font-${themeCustom.fontFamily}`)) {

        const link = document.createElement('link');

        link.id = `font-${themeCustom.fontFamily}`;

        link.rel = 'stylesheet';

        link.href = `https://fonts.googleapis.com/css2?family=${themeCustom.fontFamily.replace(/ /g, '+')}:wght@300;400;500;600;700;800&display=swap`;

        document.head.appendChild(link);

    }



    // Set background type styling

    const body = document.body;

    body.style.background = '';

    body.style.backgroundColor = '';



    if (themeCustom.backgroundType === 'solid') {

        body.style.backgroundColor = themeCustom.backgroundColor;

    } else if (themeCustom.backgroundType === 'gradient') {

        body.style.background = themeCustom.backgroundGradient;

    } else if (themeCustom.backgroundType === 'animated') {

        body.style.background = themeCustom.backgroundGradient; // fallback

    } else if (themeCustom.backgroundType === 'media') {

        body.style.backgroundColor = 'transparent';

        body.style.background = 'transparent';

        document.documentElement.style.backgroundColor = 'transparent';

        document.documentElement.style.background = 'transparent';

        const profilePage = document.getElementById('profile-page');

        if (profilePage) {

            profilePage.style.backgroundColor = 'transparent';

            profilePage.style.background = 'transparent';

        }

    }



    // Injected custom css stylesheet

    let styleTag = document.getElementById('custom-css-style');

    if (!styleTag) {

        styleTag = document.createElement('style');

        styleTag.id = 'custom-css-style';

        document.head.appendChild(styleTag);

    }

    styleTag.innerHTML = themeCustom.customCss || '';



    // Handle background media (Image / Video URL)

    const mediaBgContainer = document.getElementById('media-bg-container');

    mediaBgContainer.innerHTML = '';

    mediaBgContainer.className = '';



    if (themeCustom.backgroundType === 'media' && themeCustom.backgroundImage) {

        const url = themeCustom.backgroundImage;

        // Check if video link (MP4) or base64 video

        if (url.match(/\.(mp4|webm|mov)$/i) || url.startsWith('data:video')) {

            mediaBgContainer.innerHTML = `<video class="video-bg" data-idb-src="${url}" autoplay loop muted playsinline></video>`;

        } else {

            // Treat as GIF or standard image

            mediaBgContainer.innerHTML = `<div class="gif-bg" data-idb-src="${url}"></div>`;

        }

    }



    // Trigger canvas background animation loops

    initBgAnimation(themeCustom.backgroundType === 'animated' ? themeCustom.backgroundAnimation : 'none');

}



async function renderBlocks(username, blocks, themeCustom) {

    const container = document.getElementById('bio-render-container');

    container.innerHTML = '';

    let activeGrid50 = null;

    let activeGrid33 = null;

    let activeOverlayGrid = null;



    const iconMap = {

        globe: 'fa-solid fa-globe',

        facebook: 'fa-brands fa-facebook',

        instagram: 'fa-brands fa-instagram',

        tiktok: 'fa-brands fa-tiktok',

        youtube: 'fa-brands fa-youtube',

        line: 'fa-brands fa-line',

        twitter: 'fa-brands fa-twitter',

        github: 'fa-brands fa-github',

        'shopping-cart': 'fa-solid fa-cart-shopping'

    };



    const animClasses = {

        pulse: 'anim-pulse',

        bounce: 'anim-bounce',

        wobble: 'anim-wobble',

        none: ''

    };



    for (const block of blocks) {

        try {

            if (block.type !== 'link') {

                activeGrid50 = null;

                activeGrid33 = null;

                activeOverlayGrid = null;

            }

        if (block.type === 'social') {

            const div = document.createElement('div');

            div.className = 'social-block';



            const socialConfigs = {

                facebook: { icon: 'fa-brands fa-facebook' },

                instagram: { icon: 'fa-brands fa-instagram' },

                tiktok: { icon: 'fa-brands fa-tiktok' },

                youtube: { icon: 'fa-brands fa-youtube' },

                line: { icon: 'fa-brands fa-line' },

                github: { icon: 'fa-brands fa-github' },

                twitter: { icon: 'fa-brands fa-x-twitter' },

                twitch: { icon: 'fa-brands fa-twitch' },

                discord: { icon: 'fa-brands fa-discord' },

                linkedin: { icon: 'fa-brands fa-linkedin' },

                spotify: { icon: 'fa-brands fa-spotify' },

                whatsapp: { icon: 'fa-brands fa-whatsapp' }

            };



            let hasSocials = false;

            Object.keys(socialConfigs).forEach(key => {

                const url = block[key];

                if (url) {

                    hasSocials = true;

                    const a = document.createElement('a');

                    a.className = 'social-icon';

                    a.href = url;

                    a.target = '_blank';

                    a.innerHTML = `<i class="${socialConfigs[key].icon}"></i>`;

                    

                    a.addEventListener('click', () => {

                        logBlockClick(username, block.id);

                    });



                    div.appendChild(a);

                }

            });



            if (hasSocials) container.appendChild(div);

        }



                else if (block.type === 'linkgrid') {

            activeGrid50 = null;

            activeGrid33 = null;

            activeOverlayGrid = null;

            

            const div = document.createElement('div');

            div.className = 'linkgrid-block';

            div.style.display = 'grid';

            div.style.gap = '10px';

            div.style.width = '100%';

            div.style.marginBottom = '15px';

            

            const preset = block.preset || 'preset1';

            let slots = block.slots || [];

            

            // Set grid templates

            if (preset === 'preset1') {

                div.style.gridTemplateColumns = '1fr 1fr';

                div.style.gridTemplateRows = '1fr 1fr';

                div.style.height = '200px';

            } else if (preset === 'preset2') {

                div.style.gridTemplateColumns = '1fr 1.5fr';

                div.style.gridTemplateRows = '50px 1fr';

                div.style.height = '200px';

            } else if (preset === 'preset3') {

                div.style.gridTemplateColumns = '1fr 1fr 1fr';

                div.style.gridTemplateRows = '1fr 1fr';

                div.style.height = '200px';

            } else if (preset === 'preset4') {

                div.style.gridTemplateColumns = '1fr 2fr';

                div.style.height = '200px';

            } else if (preset === 'preset5') {

                div.style.gridTemplateColumns = '1fr 1fr';

                div.style.gridTemplateRows = '2fr 1fr';

                div.style.height = '250px';

            }

            

            const numSlots = (preset === 'preset4') ? 2 : (preset === 'preset3' ? 4 : 3);

            

            for (let i = 0; i < numSlots; i++) {

                const slot = slots[i] || { title: 'ลิงก์ ' + (i+1), subtitle: '', url: '#', bgImage: '' };

                const a = document.createElement('a');

                a.href = slot.url || '#';

                a.target = '_blank';

                a.className = 'linkgrid-item bio-btn';

                

                // Style individual item

                a.style.display = 'flex';

                a.style.flexDirection = 'column';

                a.style.textDecoration = 'none';

                a.style.position = 'relative';

                a.style.overflow = 'hidden';

                a.style.width = '100%';

                a.style.height = '100%';

                a.style.borderRadius = '16px';

                a.style.padding = '12px';

                a.style.boxSizing = 'border-box';

                

                // Default alignment is centered

                let alignItems = 'center';

                let justifyContent = 'center';

                let textAlign = 'center';

                

                // Determine if this is a large button and position its text to the corner

                if (preset === 'preset1' && i === 0) {

                    alignItems = 'flex-start'; justifyContent = 'flex-end'; textAlign = 'left';

                } else if (preset === 'preset2' && i === 0) {

                    alignItems = 'flex-start'; justifyContent = 'flex-end'; textAlign = 'left';

                } else if (preset === 'preset3') {

                    if (i === 0) {

                        alignItems = 'flex-start'; justifyContent = 'flex-end'; textAlign = 'left';

                    } else if (i === 3) {

                        alignItems = 'flex-end'; justifyContent = 'flex-end'; textAlign = 'right';

                    }

                } else if (preset === 'preset4' && i === 1) {

                    alignItems = 'flex-end'; justifyContent = 'flex-end'; textAlign = 'right';

                } else if (preset === 'preset5' && i === 0) {

                    alignItems = 'flex-end'; justifyContent = 'flex-end'; textAlign = 'right';

                }

                

                a.style.alignItems = alignItems;

                a.style.justifyContent = justifyContent;

                a.style.textAlign = textAlign;

                

                // Set Grid areas

                if (preset === 'preset1') {

                    if (i === 0) { a.style.gridColumn = '1'; a.style.gridRow = '1 / span 2'; }

                    else if (i === 1) { a.style.gridColumn = '2'; a.style.gridRow = '1'; }

                    else if (i === 2) { a.style.gridColumn = '2'; a.style.gridRow = '2'; }

                } else if (preset === 'preset2') {

                    if (i === 0) { a.style.gridColumn = '1'; a.style.gridRow = '1 / span 2'; }

                    else if (i === 1) { a.style.gridColumn = '2'; a.style.gridRow = '1'; }

                    else if (i === 2) { a.style.gridColumn = '2'; a.style.gridRow = '2'; }

                } else if (preset === 'preset3') {

                    if (i === 0) { a.style.gridColumn = '1 / span 2'; a.style.gridRow = '1'; }

                    else if (i === 1) { a.style.gridColumn = '3'; a.style.gridRow = '1'; }

                    else if (i === 2) { a.style.gridColumn = '1'; a.style.gridRow = '2'; }

                    else if (i === 3) { a.style.gridColumn = '2 / span 2'; a.style.gridRow = '2'; }

                } else if (preset === 'preset4') {

                    if (i === 0) { a.style.gridColumn = '1'; }

                    else if (i === 1) { a.style.gridColumn = '2'; }

                } else if (preset === 'preset5') {

                    if (i === 0) { a.style.gridColumn = '1 / span 2'; a.style.gridRow = '1'; }

                    else if (i === 1) { a.style.gridColumn = '1'; a.style.gridRow = '2'; }

                    else if (i === 2) { a.style.gridColumn = '2'; a.style.gridRow = '2'; }

                }

                

                // Set Background Image/Video if present

                if (slot.bgImage) {

                    let bgUrl = slot.bgImage;

                    let bgType = '';

                    if (slot.bgImage.startsWith('indexeddb://') && window.MediaDB) {

                        try {

                            const media = await window.MediaDB.getMediaUrl(slot.bgImage);

                            bgUrl = media.url;

                            bgType = media.type || '';

                        } catch (e) {

                            console.error("Failed to load slot bg from MediaDB:", e);

                        }

                    }

                    

                    const isVideo = bgUrl.startsWith('data:video/') || 

                                    bgType.startsWith('video/') ||

                                    bgUrl.endsWith('.mp4') || 

                                    bgUrl.endsWith('.webm') || 

                                    bgUrl.endsWith('.ogg');

                    

                    if (isVideo) {

                        const video = document.createElement('video');

                        video.src = bgUrl;

                        video.autoplay = true;

                        video.loop = true;

                        video.muted = true;

                        video.playsInline = true;

                        video.style.position = 'absolute';

                        video.style.top = '0';

                        video.style.left = '0';

                        video.style.width = '100%';

                        video.style.height = '100%';

                        video.style.objectFit = 'cover';

                        video.style.zIndex = '1';

                        video.style.pointerEvents = 'none';

                        a.appendChild(video);

                    } else {

                        a.style.backgroundImage = `url(${bgUrl})`;

                        a.style.backgroundSize = 'cover';

                        a.style.backgroundPosition = 'center';

                    }

                    

                    // Add text shadow to overlay text over background

                    a.style.color = '#ffffff';

                    a.style.textShadow = '0 2px 4px rgba(0,0,0,0.8), 0 0 10px rgba(0,0,0,0.5)';

                    

                    // Add a dark semi-transparent overlay to ensure text readability

                    const overlay = document.createElement('div');

                    overlay.style.position = 'absolute';

                    overlay.style.top = '0';

                    overlay.style.left = '0';

                    overlay.style.right = '0';

                    overlay.style.bottom = '0';

                    overlay.style.background = 'rgba(0,0,0,0.35)';

                    overlay.style.zIndex = '1';

                    a.appendChild(overlay);

                }

                

                // Create a container for text to align them together

                const textContainer = document.createElement('div');

                textContainer.style.position = 'relative';

                textContainer.style.zIndex = '2';

                textContainer.style.display = 'flex';

                textContainer.style.flexDirection = 'column';

                textContainer.style.width = '100%';

                textContainer.style.alignItems = alignItems;

                

                const titleSpan = document.createElement('span');

                titleSpan.textContent = slot.title || '';

                titleSpan.style.fontWeight = 'bold';

                titleSpan.style.fontSize = '0.95rem';

                titleSpan.style.lineHeight = '1.1';

                titleSpan.style.display = 'block';

                if (slot.titleColor) {

                    titleSpan.style.color = slot.titleColor;

                }

                textContainer.appendChild(titleSpan);

                

                if (slot.subtitle) {

                    const subtitleSpan = document.createElement('span');

                    subtitleSpan.textContent = slot.subtitle;

                    subtitleSpan.style.fontSize = '0.72rem';

                    subtitleSpan.style.opacity = '0.85';

                    subtitleSpan.style.fontWeight = 'normal';

                    subtitleSpan.style.marginTop = '2px';

                    subtitleSpan.style.lineHeight = '1.1';

                    subtitleSpan.style.display = 'block';

                    textContainer.appendChild(subtitleSpan);

                }

                

                a.appendChild(textContainer);

                

                a.addEventListener('click', () => {

                    logBlockClick(username, block.id);

                });

                

                div.appendChild(a);

            }

            container.appendChild(div);

        } else if (block.type === 'link' && block.enabled !== false) {

            const a = document.createElement('a');

            a.className = `bio-btn ${block.animation !== 'none' ? 'anim-' + block.animation : ''}`;

            a.href = block.url || '#';

            a.target = '_blank';

            

            let iconHtml = `<i class="fa-brands fa-${block.icon || 'globe'}"></i>`;

            if (block.customIconUrl) {

                iconHtml = `<img data-idb-src="${block.customIconUrl}" style="width:24px; height:24px; object-fit:contain; border-radius:4px; vertical-align:middle; margin-right:8px;">`;

            } else if (['globe', 'shopping-cart', 'link'].includes(block.icon)) {

                iconHtml = `<i class="fa-solid fa-${block.icon}"></i>`;

            }

            

            if (block.layout === '50') {

                activeGrid33 = null;

                if (!activeGrid50) {

                    activeGrid50 = document.createElement('div');

                    activeGrid50.style.display = 'flex';

                    activeGrid50.style.width = '100%';

                    activeGrid50.style.gap = '15px';

                    container.appendChild(activeGrid50);

                }

                

                a.style.flex = '1 1 calc(50% - 7.5px)';

                a.style.width = 'calc(50% - 7.5px)';

                a.style.display = 'flex';

                a.style.flexDirection = 'column';

                a.style.alignItems = 'center';

                a.style.justifyContent = 'center';

                a.style.textAlign = 'center';

                a.style.padding = '20px 10px';

                

                const iconRegex = /style="(.*?)"/;

                let modIcon = iconHtml;

                if (iconHtml.includes('img')) {

                    modIcon = iconHtml.replace(iconRegex, 'style="width:40px; height:40px; object-fit:contain; margin-bottom:8px;"');

                } else {

                    modIcon = iconHtml.replace('>', ' style="font-size:24px; margin-bottom:8px;">');

                }

                

                a.innerHTML = `${modIcon} <span>${block.title || 'Link'}</span>`;

                activeGrid50.appendChild(a);

                

            } else if (block.layout === '33') {

                activeGrid50 = null;

                if (!activeGrid33) {

                    activeGrid33 = document.createElement('div');

                    activeGrid33.style.display = 'flex';

                    activeGrid33.style.width = '100%';

                    activeGrid33.style.gap = '10px';

                    container.appendChild(activeGrid33);

                }

                

                a.style.flex = '1 1 calc(33.333% - 6.66px)';

                a.style.width = 'calc(33.333% - 6.66px)';

                a.style.display = 'flex';

                a.style.flexDirection = 'column';

                a.style.alignItems = 'center';

                a.style.justifyContent = 'center';

                a.style.textAlign = 'center';

                a.style.padding = '15px 5px';

                a.style.aspectRatio = '1 / 1';

                

                const iconRegex = /style="(.*?)"/;

                let modIcon = iconHtml;

                if (iconHtml.includes('img')) {

                    modIcon = iconHtml.replace(iconRegex, 'style="width:36px; height:36px; object-fit:contain; margin-bottom:8px;"');

                } else {

                    modIcon = iconHtml.replace('>', ' style="font-size:28px; margin-bottom:8px;">');

                }

                

                a.innerHTML = `${modIcon} <span style="font-size:0.85em; line-height:1.2;">${block.title || 'Link'}</span>`;

                activeGrid33.appendChild(a);

                

            } else {

                activeGrid50 = null;

                activeGrid33 = null;

                a.style.width = '100%';

                a.style.display = 'flex';

                a.style.alignItems = 'center';

                a.innerHTML = `${iconHtml} <span style="flex:1;">${block.title || 'Link'}</span>`;

                container.appendChild(a);

            }



            if (block.bgImage) {

                if (block.bgImage.match(/\.(mp4|webm)$/i) || block.bgImage.startsWith('data:video')) {

                    a.style.position = 'relative';

                    a.style.overflow = 'hidden';

                    a.style.zIndex = '1';

                    

                    const video = document.createElement('video');

                    video.setAttribute('data-idb-src', block.bgImage);

                    video.autoplay = true;

                    video.loop = true;

                    video.muted = true;

                    video.playsInline = true;

                    video.style.position = 'absolute';

                    video.style.top = '0';

                    video.style.left = '0';

                    video.style.width = '100%';

                    video.style.height = '100%';

                    video.style.objectFit = 'cover';

                    video.style.zIndex = '-1';

                    video.style.pointerEvents = 'none';

                    

                    const overlay = document.createElement('div');

                    overlay.style.position = 'absolute';

                    overlay.style.top = '0';

                    overlay.style.left = '0';

                    overlay.style.width = '100%';

                    overlay.style.height = '100%';

                    overlay.style.backgroundColor = 'rgba(0,0,0,0.4)';

                    overlay.style.zIndex = '-1';

                    overlay.style.pointerEvents = 'none';

                    

                    a.appendChild(video);

                    a.appendChild(overlay);

                } else {

                    a.setAttribute('data-idb-src', block.bgImage);

                    a.style.backgroundSize = 'cover';

                    a.style.backgroundPosition = 'center';

                    a.style.border = 'none';

                    a.style.textShadow = '0 2px 4px rgba(0,0,0,0.5)';

                }

            }

            a.addEventListener('click', () => { logBlockClick(username, block.id); });

        }



                else if (block.type === 'image') {

            const div = document.createElement('div');

            const isDouble = block.layout === 'double';

            div.className = `image-grid-block ${isDouble ? 'grid-double' : 'grid-single'}`;



            let html = `

                <a href="${block.linkUrl1 || '#'}" target="_blank" class="image-grid-item" data-id="${block.id}-img1">

                    <img data-idb-src="${block.imgUrl1 || 'https://picsum.photos/400/300'}" />

                </a>

            `;



            if (isDouble) {

                html += `

                    <a href="${block.linkUrl2 || '#'}" target="_blank" class="image-grid-item" data-id="${block.id}-img2">

                        <img data-idb-src="${block.imgUrl2 || 'https://picsum.photos/400/300'}" />

                    </a>

                `;

            }

            div.innerHTML = html;



            // Click logging for images

            div.querySelectorAll('.image-grid-item').forEach(item => {

                item.addEventListener('click', () => {

                    logBlockClick(username, block.id);

                });

            });



            container.appendChild(div);

        }



        else if (block.type === 'youtube') {

            const div = document.createElement('div');

            div.className = 'youtube-block';

            div.innerHTML = `<iframe src="https://www.youtube.com/embed/${block.videoId}" allowfullscreen></iframe>`;

            container.appendChild(div);

        }



        else if (block.type === 'music') {

            const div = document.createElement('div');

            div.className = 'music-player-block';



            if (block.sourceType === 'spotify') {

                // Parse Spotify track URL into embed frame URL

                let embedUrl = block.url;

                if (block.url.includes('open.spotify.com')) {

                    const trackMatch = block.url.match(/track\/([a-zA-Z0-9]+)/);

                    const albumMatch = block.url.match(/album\/([a-zA-Z0-9]+)/);

                    const playlistMatch = block.url.match(/playlist\/([a-zA-Z0-9]+)/);



                    if (trackMatch) embedUrl = `https://open.spotify.com/embed/track/${trackMatch[1]}`;

                    else if (albumMatch) embedUrl = `https://open.spotify.com/embed/album/${albumMatch[1]}`;

                    else if (playlistMatch) embedUrl = `https://open.spotify.com/embed/playlist/${playlistMatch[1]}`;

                }



                div.style.padding = '0';

                div.style.border = 'none';

                div.style.background = 'none';

                div.innerHTML = `<iframe src="${embedUrl}" width="100%" height="80" frameborder="0" allowtransparency="true" allow="encrypted-media" style="border-radius: var(--button-radius)"></iframe>`;

            } else {

                // Renders custom HTML5 Glassmorphism player

                const audioId = `audio-${block.id}`;

                div.innerHTML = `

                    <div class="music-player-cover" id="cover-${block.id}">

                        <i class="fa-solid fa-music"></i>

                    </div>

                    <div class="music-player-info">

                        <div class="music-player-title">${block.title}</div>

                        <div class="music-player-sub">Audio Player</div>

                    </div>

                    <div class="music-player-controls">

                        <button class="music-play-btn" onclick="toggleAudioPlayer('${block.url}', '${block.id}')">

                            <i class="fa-solid fa-play" id="play-icon-${block.id}"></i>

                        </button>

                        <audio id="${audioId}" data-idb-src="${block.url}" loop></audio>

                    </div>

                `;

            }



            container.appendChild(div);

        }



        

        else if (block.type === 'text') {

            const div = document.createElement('div');

            div.className = 'text-block';

            div.style.color = block.textColor || '#ffffff';

            div.style.textAlign = block.alignment || 'center';

            div.style.fontSize = (block.fontSize || '16') + 'px';

            div.style.margin = '15px 0';

            div.style.whiteSpace = 'pre-wrap';

            div.innerText = block.content || '';

            container.appendChild(div);

        }

        else if (block.type === 'album') {

            const div = document.createElement('div');

            div.className = 'album-player-block';

            const albumId = `album-${block.id}`;

            const tracks = block.tracks && block.tracks.length > 0 ? block.tracks : [];

            const tracksJson = JSON.stringify(tracks).replace(/"/g, '&quot;');

            

            div.innerHTML = `

                <div class="album-header">

                    <div class="album-cover" style="background-image: url('${block.coverUrl || 'https://via.placeholder.com/150'}');">

                        <div class="album-play-btn" onclick="playAlbumTrack('${albumId}', 0, this)">

                            <i class="fa-solid fa-play"></i>

                        </div>

                    </div>

                    <div class="album-info">

                        <div class="album-title">${block.title || 'Unknown Album'}</div>

                        <div class="album-artist">${block.artist || 'Unknown Artist'}</div>

                    </div>

                </div>

                <div class="album-tracklist" id="tracklist-${albumId}" data-tracks="${tracksJson}">

                    ${tracks.map((t, i) => `

                        <div class="album-track-row" id="track-row-${albumId}-${i}" onclick="playAlbumTrack('${albumId}', ${i}, this)">

                            <div class="track-num">${i + 1}</div>

                            <div class="track-name">${t.title || 'Unknown Track'}</div>

                            <div class="track-status" id="track-status-${albumId}-${i}">

                                <i class="fa-solid fa-play"></i>

                            </div>

                        </div>

                    `).join('')}

                </div>

                <audio id="audio-${albumId}" preload="none" onended="albumTrackEnded('${albumId}')"></audio>

            `;

            container.appendChild(div);

        }

        else if (block.type === 'spacer') {

            const div = document.createElement('div');

            div.className = 'spacer-block';

            div.style.height = `${block.height}px`;

            container.appendChild(div);

        }

        } catch (err) {

            console.error("Error rendering block " + block.id + ":", err);

        }

    }



    // Renders the page footer badge

    const footer = document.createElement('div');

    footer.className = 'bio-footer';

    footer.innerHTML = `

        <a href="index.html" class="footer-badge" target="_blank">

            <i class="fa-solid fa-wand-magic-sparkles"></i>

            <span>Super Bio Builder</span>

        </a>

    `;

    container.appendChild(footer);



    // Initialize 3D Tilt Effect on buttons and profile blocks

    initTiltEffect();

    if (window.MediaDB) await window.MediaDB.resolveAllMediaUrls(document.body);

}



function logBlockClick(username, blockId) {

    if (!isPreviewMode) {

        window.DB.logClick(username, blockId);

    }

}



// 3D Tilt Effect (Professional Dev-tier)

function initTiltEffect() {

    const tiltElements = document.querySelectorAll('.bio-btn.anim-wobble, .profile-block');

    

    tiltElements.forEach(el => {

        el.addEventListener('mousemove', e => {

            const rect = el.getBoundingClientRect();

            const x = e.clientX - rect.left;

            const y = e.clientY - rect.top;

            

            const centerX = rect.width / 2;

            const centerY = rect.height / 2;

            

            const rotateX = ((y - centerY) / centerY) * -10; // Max 10deg

            const rotateY = ((x - centerX) / centerX) * 10;

            

            el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;

            el.style.transition = 'transform 0.1s ease';

        });

        

        el.addEventListener('mouseleave', () => {

            el.style.transform = '';

            el.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.8, 0.25, 1)';

        });

    });

}



// Custom Glassmorphism Music Player toggle control

function toggleAudioPlayer(src, blockId) {

    const player = document.getElementById(`audio-${blockId}`);

    const playIcon = document.getElementById(`play-icon-${blockId}`);

    const cover = document.getElementById(`cover-${blockId}`);



    if (activeAudio && activeAudio !== player) {

        // Pause previously playing audio

        activeAudio.pause();

        const activeBlockId = activeAudio.id.replace('audio-', '');

        document.getElementById(`play-icon-${activeBlockId}`).className = 'fa-solid fa-play';

        document.getElementById(`cover-${activeBlockId}`).classList.remove('playing');

    }



    if (player.paused) {

        player.play().catch(err => {

            console.error("Audio playback blocked by browser security policy. Requires user interaction first.", err);

        });

        activeAudio = player;

        playIcon.className = 'fa-solid fa-pause';

        cover.classList.add('playing');

    } else {

        player.pause();

        playIcon.className = 'fa-solid fa-play';

        cover.classList.remove('playing');

    }

}

window.toggleAudioPlayer = toggleAudioPlayer; // expose to inline click event handler





// ==========================================

// BACKGROUND CANVAS ENGINE (ANIMATIONS)

// ==========================================



function initBgAnimation(type) {

    if (animFrameId) {

        cancelAnimationFrame(animFrameId);

        animFrameId = null;

    }

    

    canvas = document.getElementById('bg-canvas');

    if (!canvas) return;



    if (type === 'none') {

        canvas.style.display = 'none';

        return;

    }



    canvas.style.display = 'block';

    ctx = canvas.getContext('2d');

    

    resizeCanvas();

    window.addEventListener('resize', resizeCanvas);



    canvasElements = [];



    if (type === 'particles') {

        // Setup floating bubble elements

        for (let i = 0; i < 40; i++) {

            canvasElements.push({

                x: Math.random() * canvas.width,

                y: Math.random() * canvas.height,

                radius: Math.random() * 3 + 1,

                speedX: Math.random() * 0.4 - 0.2,

                speedY: Math.random() * -0.6 - 0.2, // floating up

                color: 'rgba(255, 255, 255, 0.22)'

            });

        }

        loopParticles();

    } else if (type === 'stars') {

        // Setup glowing stars

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



function resizeCanvas() {

    if (canvas) {

        canvas.width = window.innerWidth;

        canvas.height = window.innerHeight;

    }

}



function loopParticles() {

    ctx.clearRect(0, 0, canvas.width, canvas.height);



    canvasElements.forEach(p => {

        ctx.beginPath();

        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);

        ctx.fillStyle = p.color;

        ctx.fill();



        p.x += p.speedX;

        p.y += p.speedY;



        // Reset if float offscreen top

        if (p.y < 0) {

            p.y = canvas.height;

            p.x = Math.random() * canvas.width;

        }

    });



    animFrameId = requestAnimationFrame(loopParticles);

}



function loopStars() {

    ctx.clearRect(0, 0, canvas.width, canvas.height);



    canvasElements.forEach(s => {

        ctx.beginPath();

        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);

        ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;

        ctx.fill();



        s.alpha += s.twinkleSpeed * s.dir;

        if (s.alpha > 0.95) {

            s.dir = -1;

        } else if (s.alpha < 0.05) {

            s.dir = 1;

        }

    });



    animFrameId = requestAnimationFrame(loopStars);

}



// ==========================================

// FUSIONS PREMIUM EFFECTS SYSTEM

// ==========================================



let nekoImg = null;

let nekoX = 100;

let nekoY = 100;

let mouseX = 100;

let mouseY = 100;

let nekoFrameId = null;



let trailCanvas = null;

let trailCtx = null;

let trailPoints = [];

let trailFrameId = null;



function applyPremiumEffects(themeCustom) {

    if (!themeCustom) return;



    // A. Custom Cursor Image

    if (themeCustom.customCursorUrl) {

        document.body.style.cursor = `url('${themeCustom.customCursorUrl}'), auto`;

    } else {

        document.body.style.cursor = '';

    }



    // B. Hide Watermark

    const footer = document.querySelector('.bio-footer');

    if (footer) {

        if (themeCustom.hideWatermark) {

            footer.style.display = 'none';

        } else {

            footer.style.display = 'block';

        }

    }



    // C. Cursor Trails

    initCursorTrail(themeCustom.cursorEffect || 'none');



    // D. Neko Cat Follow

    initNekoCat(themeCustom.nekoEnabled || false);



    // E. Global Audio

    initGlobalAudio(themeCustom.bgmUrl || themeCustom.globalAudioUrl || '');



    // F. Page Overlay

    initPageOverlay(themeCustom.pageOverlay || 'none');



    // G. 3D Tilt Card

    initTiltEffect(themeCustom.tiltEffect || 'off');



    // H. Animated Frame Border on buttons

    initFrameBorder(themeCustom.frameBorder || 'none');



    // I. Entrance Animation

    initEntranceAnim(themeCustom.entranceAnim || 'slide-up');

}



function initFrameBorder(type) {

    // Remove old frame-border style tag

    let frameStyle = document.getElementById('frame-border-style');

    if (frameStyle) frameStyle.remove();



    if (type === 'none') return;



    frameStyle = document.createElement('style');

    frameStyle.id = 'frame-border-style';



    if (type === 'neon-pulse') {

        frameStyle.innerHTML = `

            .bio-btn, .music-player-block, .image-grid-item {

                border: 1px solid rgba(0, 242, 254, 0.5) !important;

                animation: neonPulseBorder 2s ease-in-out infinite !important;

            }

            @keyframes neonPulseBorder {

                0%, 100% { border-color: rgba(0, 242, 254, 0.5); box-shadow: 0 0 8px rgba(0, 242, 254, 0.2), var(--button-shadow); }

                50% { border-color: rgba(255, 0, 127, 0.6); box-shadow: 0 0 15px rgba(255, 0, 127, 0.3), var(--button-shadow); }

            }

        `;

    } else if (type === 'rainbow-spin') {

        frameStyle.innerHTML = `

            .bio-btn, .music-player-block, .image-grid-item {

                border: 2px solid transparent !important;

                background-clip: padding-box !important;

                position: relative;

            }

            .bio-btn::after, .music-player-block::after, .image-grid-item::after {

                content: '';

                position: absolute;

                top: -2px; left: -2px; right: -2px; bottom: -2px;

                border-radius: inherit;

                background: linear-gradient(90deg, #ff007f, #00f2fe, #39ff14, #ffff00, #ff007f);

                background-size: 400% 100%;

                animation: rainbowBorderSpin 3s linear infinite;

                z-index: -1;

                opacity: 0.7;

            }

            @keyframes rainbowBorderSpin {

                0% { background-position: 0% 50%; }

                100% { background-position: 400% 50%; }

            }

        `;

    } else if (type === 'gradient-flow') {

        frameStyle.innerHTML = `

            .bio-btn, .music-player-block, .image-grid-item {

                border: 1px solid transparent !important;

                background-clip: padding-box !important;

                box-shadow: 0 0 0 1px rgba(108, 92, 231, 0.4), var(--button-shadow) !important;

                animation: gradientFlowBorder 4s ease infinite !important;

            }

            @keyframes gradientFlowBorder {

                0%, 100% { box-shadow: 0 0 0 1px rgba(108, 92, 231, 0.4), 0 0 12px rgba(108, 92, 231, 0.15); }

                33% { box-shadow: 0 0 0 1px rgba(0, 242, 254, 0.5), 0 0 12px rgba(0, 242, 254, 0.15); }

                66% { box-shadow: 0 0 0 1px rgba(255, 0, 127, 0.4), 0 0 12px rgba(255, 0, 127, 0.15); }

            }

        `;

    }



    document.head.appendChild(frameStyle);

}



function initEntranceAnim(type) {

    let animStyle = document.getElementById('entrance-anim-style');

    if (animStyle) animStyle.remove();



    animStyle = document.createElement('style');

    animStyle.id = 'entrance-anim-style';



    const targets = '.profile-block, .social-block, .bio-btn, .music-player-block, .image-grid-block, .youtube-block';



    if (type === 'fade-in') {

        animStyle.innerHTML = `

            ${targets} { animation: entrFadeIn 0.6s ease-out both !important; }

            @keyframes entrFadeIn { from { opacity: 0; } to { opacity: 1; } }

        `;

    } else if (type === 'scale-in') {

        animStyle.innerHTML = `

            ${targets} { animation: entrScaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both !important; }

            @keyframes entrScaleIn { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }

        `;

    } else if (type === 'flip-in') {

        animStyle.innerHTML = `

            ${targets} { animation: entrFlipIn 0.6s ease-out both !important; perspective: 1000px; }

            @keyframes entrFlipIn { from { opacity: 0; transform: rotateX(-90deg); } to { opacity: 1; transform: rotateX(0); } }

        `;

    } else {

        // slide-up (default)

        animStyle.innerHTML = `

            ${targets} { animation: blockSlideIn 0.5s ease-out both !important; }

        `;

    }



    document.head.appendChild(animStyle);

}



function initCursorTrail(type) {

    // Cleanup first

    if (window.cleanupCursorTrail) {

        window.cleanupCursorTrail();

        window.cleanupCursorTrail = null;

    }

    if (trailFrameId) {

        cancelAnimationFrame(trailFrameId);

        trailFrameId = null;

    }

    trailCanvas = document.getElementById('cursor-trail-canvas');

    if (trailCanvas) {

        trailCanvas.remove();

        trailCanvas = null;

    }



    if (type === 'none') return;



    // Create canvas

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

                // Sparkle (neon blue)

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

                // Bubble (gradient white-purple)

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



    window.cleanupCursorTrail = () => {

        window.removeEventListener('mousemove', handleMouseMove);

        window.removeEventListener('resize', resizeTrail);

    };

}



function initNekoCat(enabled) {

    // Cleanup first

    if (window.cleanupNeko) {

        window.cleanupNeko();

        window.cleanupNeko = null;

    }

    if (nekoFrameId) {

        cancelAnimationFrame(nekoFrameId);

        nekoFrameId = null;

    }

    nekoImg = document.getElementById('neko-cat');

    if (nekoImg) {

        nekoImg.remove();

        nekoImg = null;

    }



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

            // Walking cat GIF

            if (!nekoImg.src.includes('8gXv8gDkXvV9r7G2k5')) {

                nekoImg.src = 'https://media.giphy.com/media/8gXv8gDkXvV9r7G2k5/giphy.gif';

            }

        } else {

            // Sitting cat GIF

            if (!nekoImg.src.includes('13CoXDiaCcC9R6')) {

                nekoImg.src = 'https://media.giphy.com/media/13CoXDiaCcC9R6/giphy.gif';

            }

        }



        nekoImg.style.left = `${nekoX - 16}px`;

        nekoImg.style.top = `${nekoY - 16}px`;



        nekoFrameId = requestAnimationFrame(updateNeko);

    }

    updateNeko();



    window.cleanupNeko = () => {

        window.removeEventListener('mousemove', trackMouse);

    };

}



// ==========================================

// NEW PREMIUM EFFECTS (AUDIO, OVERLAY, TILT)

// ==========================================



async function initGlobalAudio(url) {

    let globalAudioPlayer = document.getElementById('global-audio-player');

    let globalAudioBtn = document.getElementById('global-audio-btn');



    if (!url) {

        if (globalAudioPlayer) globalAudioPlayer.remove();

        if (globalAudioBtn) globalAudioBtn.remove();

        return;

    }



    // Resolve URL if it's from IndexedDB

    let resolvedUrl = url;

    if (url.startsWith('indexeddb://') && window.MediaDB) {

        try {

            const media = await window.MediaDB.getMediaUrl(url);

            resolvedUrl = media.url;

        } catch (e) {

            console.error("Failed to load global audio from IndexedDB:", e);

        }

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

    

    if (globalAudioPlayer.src !== resolvedUrl) {

        globalAudioPlayer.src = resolvedUrl;

        globalAudioBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';

        

        const tryPlay = () => {

            globalAudioPlayer.play().then(() => {

                globalAudioBtn.innerHTML = '<i class="fa-solid fa-music"></i>';

                globalAudioBtn.style.boxShadow = '0 0 15px var(--button-bg, rgba(255,255,255,0.5))';

            }).catch(() => {

                // Autoplay blocked by browser policy, wait for user click/touch anywhere on the page

                const playOnInteraction = () => {

                    globalAudioPlayer.play().then(() => {

                        globalAudioBtn.innerHTML = '<i class="fa-solid fa-music"></i>';

                        globalAudioBtn.style.boxShadow = '0 0 15px var(--button-bg, rgba(255,255,255,0.5))';

                    }).catch(e => console.log("Interaction playback blocked:", e));

                };

                document.body.addEventListener('click', playOnInteraction, { once: true });

                document.body.addEventListener('touchstart', playOnInteraction, { once: true });

            });

        };

        tryPlay();

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

        overlayDiv.innerHTML = '';

    } else {

        overlayDiv.style.display = 'block';

        overlayDiv.innerHTML = ''; // clear previous canvas content

        

        // Reset inline styles

        overlayDiv.style.backgroundImage = '';

        overlayDiv.style.backgroundSize = '';

        overlayDiv.style.animation = '';

        overlayDiv.style.mixBlendMode = '';

        overlayDiv.style.opacity = '';



        if (!document.getElementById('overlay-keyframes')) {

            const style = document.createElement('style');

            style.id = 'overlay-keyframes';

            style.innerHTML = `

                @keyframes rainAnim { 0% { background-position: 0px 0px; } 100% { background-position: 20px 100vh; } }

                @keyframes embersAnim { 0% { background-position: 0px 100vh; } 100% { background-position: -20px 0px; } }

                @keyframes snowFall { 0% { transform: translateY(-10px) rotate(0deg); } 100% { transform: translateY(100vh) rotate(360deg); } }

                @keyframes fireflyFloat { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }

            `;

            document.head.appendChild(style);

        }

        

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

        } else if (type === 'embers') {

            overlayDiv.style.backgroundImage = 'radial-gradient(circle, #ff9f43 10%, transparent 20%)';

            overlayDiv.style.backgroundSize = '30px 30px';

            overlayDiv.style.animation = 'embersAnim 3s linear infinite';

            overlayDiv.style.opacity = '0.4';

            overlayDiv.style.mixBlendMode = 'color-dodge';

        } else if (type === 'snow') {

            // Generate CSS snow particles

            let snowHtml = '';

            for (let i = 0; i < 40; i++) {

                const size = Math.random() * 4 + 2;

                const left = Math.random() * 100;

                const delay = Math.random() * 5;

                const duration = Math.random() * 3 + 4;

                const opacity = Math.random() * 0.6 + 0.3;

                snowHtml += `<div style="position:absolute;top:-10px;left:${left}%;width:${size}px;height:${size}px;background:white;border-radius:50%;opacity:${opacity};animation:snowFall ${duration}s ${delay}s linear infinite;"></div>`;

            }

            overlayDiv.innerHTML = snowHtml;

        } else if (type === 'fireflies') {

            let fireflyHtml = '';

            for (let i = 0; i < 25; i++) {

                const size = Math.random() * 5 + 3;

                const left = Math.random() * 100;

                const top = Math.random() * 100;

                const delay = Math.random() * 4;

                const duration = Math.random() * 3 + 2;

                fireflyHtml += `<div style="position:absolute;top:${top}%;left:${left}%;width:${size}px;height:${size}px;background:#39ff14;border-radius:50%;box-shadow:0 0 8px #39ff14, 0 0 15px #39ff14;animation:fireflyFloat ${duration}s ${delay}s ease-in-out infinite;"></div>`;

            }

            overlayDiv.innerHTML = fireflyHtml;

        }

    }

}



function initTiltEffect(state) {

    const container = document.getElementById('bio-render-container');

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

                

                el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;

                el.style.zIndex = "10";

            } else {

                el.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';

                el.style.zIndex = "1";

            }

        });

    };

    

    document.addEventListener('mousemove', window.tiltListener);

}



// --- ALBUM PLAYER LOGIC ---

let activeAlbumAudios = {}; // blockId -> { currentTrackIndex, audioCtx }



window.playAlbumTrack = function(albumId, trackIndex, element) {

    const tracklistEl = document.getElementById(`tracklist-${albumId}`);

    if (!tracklistEl) return;

    const tracksStr = tracklistEl.getAttribute('data-tracks');

    if (!tracksStr) return;

    const tracks = JSON.parse(tracksStr);

    if (!tracks || trackIndex >= tracks.length) return;



    const audioEl = document.getElementById(`audio-${albumId}`);

    if (!audioEl) return;



    const track = tracks[trackIndex];

    let state = activeAlbumAudios[albumId];



    // If clicking the currently playing track, toggle play/pause

    if (state && state.currentTrackIndex === trackIndex) {

        if (!audioEl.paused) {

            audioEl.pause();

            updateAlbumUI(albumId, trackIndex, false);

        } else {

            audioEl.play().catch(e => console.error(e));

            updateAlbumUI(albumId, trackIndex, true);

        }

        return;

    }



    // Changing track

    if (state) {

        // Reset old track UI

        updateAlbumUI(albumId, state.currentTrackIndex, false, true);

    }

    

    // Pause other global players if needed

    document.querySelectorAll('audio').forEach(a => { if(a.id !== `audio-${albumId}`) a.pause(); });

    

    // Play new track

    audioEl.src = track.url;

    audioEl.play().catch(e => console.error(e));

    

    activeAlbumAudios[albumId] = { currentTrackIndex: trackIndex };

    updateAlbumUI(albumId, trackIndex, true);

};



window.albumTrackEnded = function(albumId) {

    let state = activeAlbumAudios[albumId];

    if (!state) return;

    

    const tracklistEl = document.getElementById(`tracklist-${albumId}`);

    const tracks = JSON.parse(tracklistEl.getAttribute('data-tracks') || '[]');

    

    // Reset current UI

    updateAlbumUI(albumId, state.currentTrackIndex, false, true);

    

    // Next track

    const nextIndex = state.currentTrackIndex + 1;

    if (nextIndex < tracks.length) {

        window.playAlbumTrack(albumId, nextIndex);

    } else {

        // Finished album

        activeAlbumAudios[albumId] = null;

    }

};



function updateAlbumUI(albumId, trackIndex, isPlaying, isReset = false) {

    const row = document.getElementById(`track-row-${albumId}-${trackIndex}`);

    const statusIcon = document.getElementById(`track-status-${albumId}-${trackIndex}`);

    if (!row || !statusIcon) return;

    

    // Update tracklist row UI

    document.querySelectorAll(`#tracklist-${albumId} .album-track-row`).forEach(r => r.classList.remove('active'));

    document.querySelectorAll(`#tracklist-${albumId} .track-status`).forEach(s => s.innerHTML = '<i class="fa-solid fa-play"></i>');



    if (!isReset) {

        row.classList.add('active');

        if (isPlaying) {

            statusIcon.innerHTML = '<div class="music-bars"><div class="bar"></div><div class="bar"></div><div class="bar"></div></div>';

        } else {

            statusIcon.innerHTML = '<i class="fa-solid fa-pause"></i>';

        }

    }

    

    // Update main cover play button

    const coverPlayBtn = document.querySelector(`#audio-${albumId}`).parentElement.querySelector('.album-play-btn');

    if (coverPlayBtn) {

        coverPlayBtn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';

    }

}







async function renderProfileHeader(username, info, themeCustom) {

    const container = document.getElementById('bio-render-container');

    // Remove existing if any

    const existing = document.getElementById('profile-header');

    if (existing) existing.remove();



    const div = document.createElement('div');

    div.id = 'profile-header';

    div.className = `profile-block layout-${info.layout || 'floating'}`;

    

    // Pre-create container so it can be appended early (for correct order)

    if (container.firstChild) {

        container.insertBefore(div, container.firstChild);

    } else {

        container.appendChild(div);

    }

    

    // Badges & Effects

    let badgeHtml = '';

    if (themeCustom && themeCustom.verifiedBadge === 'verified') {

        badgeHtml = '<span class="verified-badge-inline" title="Verified"><i class="fa-solid fa-circle-check"></i></span>';

    } else if (themeCustom && themeCustom.verifiedBadge === 'crown') {

        badgeHtml = '<span class="crown-badge-inline" title="Crown"><i class="fa-solid fa-crown"></i></span>';

    }



    let effectClass = '';

    if (themeCustom && themeCustom.titleEffect && themeCustom.titleEffect !== 'none') {

        effectClass = `effect-${themeCustom.titleEffect}`;

    }



    // Avatar Shape

    let br = '50%';

    if (info.shape === 'square') br = '0%';

    else if (info.shape === 'rounded') br = '15px';

    else if (info.shape === 'squircle') br = '35%';



        // Decor

    let decorObj = DECORATIONS.find(d => d.id === info.decoration);

    let decorHtml = '';

    if (decorObj && decorObj.img) {

        decorHtml = `<div class="avatar-decoration-overlay" style="background-image:url('${decorObj.img}'); filter:hue-rotate(${info.decorationHue || 0}deg);"></div>`;

    }



    let avatarHtml = `<div class="bio-avatar-fallback" style="border-radius:${br}">${username.slice(0, 2).toUpperCase()}</div>`;

    

    if (info.avatar) {

        avatarHtml = `<div class="bio-avatar-img-wrap" style="border-radius:${br};">

            <img class="bio-avatar" data-idb-src="${info.avatar}" style="border-radius:${br};" />

        </div>`;

    }





    // Meta Badges

    let metaHtml = '';

    if (info.occupation || info.location || (info.tags && info.tags.length > 0)) {

        let items = [];

        if (info.occupation) items.push(`<div class="meta-badge"><i class="fa-solid fa-briefcase"></i> ${info.occupation}</div>`);

        if (info.location) items.push(`<div class="meta-badge"><i class="fa-solid fa-location-dot"></i> ${info.location}</div>`);

        if (info.tags) {

            info.tags.forEach(t => items.push(`<div class="meta-badge"># ${t}</div>`));

        }

        metaHtml = `<div class="profile-meta-badges">${items.join('')}</div>`;

    }



    div.innerHTML = `

        <div class="avatar-wrapper">

            ${avatarHtml}

            ${decorHtml}

        </div>

        <div class="profile-text">

            <h1 class="profile-name premium-gradient-text ${effectClass}" data-text="${info.displayName || ''}">${info.displayName || ''}${badgeHtml}</h1>

            ${metaHtml}

            <p class="profile-bio">${info.bio || ''}</p>

        </div>

    `;

    

    if (window.MediaDB) await window.MediaDB.resolveAllMediaUrls(div);

}



// ==========================================

// NEW APPEARANCE APPLY (RUU-PLAK)

// ==========================================

async function applyProAppearance(theme) {

    if (!theme) return;

    const body = document.body;

    const container = document.getElementById('bio-render-container');

    const root = document.documentElement;

    

    // 1. Background

    if (theme.background) {

        if (theme.background.startsWith('#')) {

            body.style.background = theme.background;

        } else if (theme.background.startsWith('indexeddb://') && window.MediaDB) {

            try {

                const media = await window.MediaDB.getMediaUrl(theme.background);

                if (media.type.startsWith('video/')) {

                    // It's a video, handle video background

                    body.style.background = 'black';

                    let vidWrap = document.getElementById('bg-vid-wrap');

                    if (!vidWrap) {

                        vidWrap = document.createElement('div');

                        vidWrap.id = 'bg-vid-wrap';

                        vidWrap.style.position = 'fixed';

                        vidWrap.style.top = '0';

                        vidWrap.style.left = '0';

                        vidWrap.style.width = '100vw';

                        vidWrap.style.height = '100vh';

                        vidWrap.style.zIndex = '-1';

                        vidWrap.style.overflow = 'hidden';

                        body.appendChild(vidWrap);

                    }

                    vidWrap.innerHTML = `<video autoplay loop muted playsinline style="width:100%; height:100%; object-fit:cover;"><source src="${media.url}" type="${media.type}"></video>`;

                } else {

                    body.style.backgroundImage = `url("${media.url}")`;

                    body.style.backgroundSize = 'cover';

                    body.style.backgroundPosition = 'center';

                    body.style.backgroundAttachment = 'fixed';

                    const vid = document.getElementById('bg-vid-wrap');

                    if(vid) vid.remove();

                }

            } catch(e) { console.error('Failed to load bg', e); }

        }

    }

    

    // 2. Card Style (Container)

    container.className = 'bio-container'; // reset

    if (theme.cardStyle) {

        container.classList.add(`style-${theme.cardStyle}`);

    }

    

    // Custom Card Color

    if (theme.customCardColor && theme.cardBgColor) {

        let opacity = theme.cardOpacity !== undefined ? parseInt(theme.cardOpacity) / 100 : 1;

        // Convert hex to rgba

        let hex = theme.cardBgColor.replace('#','');

        let r = parseInt(hex.substring(0,2), 16);

        let g = parseInt(hex.substring(2,4), 16);

        let b = parseInt(hex.substring(4,6), 16);

        container.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;

    } else {

        container.style.backgroundColor = '';

    }

    

    if (theme.cardBorder) {

        container.style.border = `2px solid ${theme.cardBorder}`;

    } else {

        container.style.border = '';

    }

    

    if (theme.cardRadius !== undefined) {

        const radiusMap = ['0px', '8px', '16px', '24px', '50px'];

        container.style.borderRadius = radiusMap[parseInt(theme.cardRadius)] || '16px';

    }

    

    // 3. Name & Bio Color

    if (theme.nameColor) root.style.setProperty('--name-color', theme.nameColor);

    if (theme.bioColor) root.style.setProperty('--bio-color', theme.bioColor);

    

    // 4. Fonts

    if (theme.fontEng) {

        root.style.setProperty('--font-eng', `"${theme.fontEng}", sans-serif`);

        loadGoogleFont(theme.fontEng);

    }

    if (theme.fontThai) {

        root.style.setProperty('--font-thai', `"${theme.fontThai}", sans-serif`);

        loadGoogleFont(theme.fontThai);

    }

    

    // 5. Banner

    const existingBanner = document.getElementById('pro-banner-img');

    if (existingBanner) existingBanner.remove();

    

    if (theme.banner) {

        const bannerDiv = document.createElement('div');

        bannerDiv.id = 'pro-banner-img';

        bannerDiv.style.width = '100%';

        bannerDiv.style.aspectRatio = '16/9';

        bannerDiv.style.backgroundSize = 'cover';

        bannerDiv.style.backgroundPosition = 'center';

        bannerDiv.style.borderTopLeftRadius = container.style.borderRadius || '16px';

        bannerDiv.style.borderTopRightRadius = container.style.borderRadius || '16px';

        

        bannerDiv.style.position = 'relative';

        bannerDiv.style.zIndex = '0';

        bannerDiv.style.marginBottom = '-80px';

        bannerDiv.style.maskImage = 'linear-gradient(to bottom, black 50%, transparent 100%)';

        bannerDiv.style.webkitMaskImage = 'linear-gradient(to bottom, black 50%, transparent 100%)';

        

        if (theme.banner.startsWith('indexeddb://') && window.MediaDB) {

            window.MediaDB.getMediaUrl(theme.banner).then(media => {

                bannerDiv.style.backgroundImage = `url("${media.url}")`;

            });

        } else {

            bannerDiv.style.backgroundImage = `url("${theme.banner}")`;

        }

        container.insertBefore(bannerDiv, container.firstChild);

    }

    

    

// 6. Effects & Popups

    // Cleanup old ones

    document.querySelectorAll('.pro-pet, .custom-mouse-decor, .mouse-trail-particle').forEach(el => el.remove());

    document.body.classList.remove('has-mouse-decor');

    document.body.onmousemove = null; // Clear old global mousemove if any



    const eConf = theme.effectsConfig;

    

    if (eConf) {

        // Name Effect (2 Layers)

        const nameEl = document.querySelector('.profile-name');

        if (nameEl && eConf.nameEffect && (eConf.nameEffect.layer1 !== 'none' || eConf.nameEffect.layer2 !== 'none')) {

            const originalText = nameEl.textContent;

            nameEl.innerHTML = ''; // clear text

            nameEl.style.position = 'relative';

            

            const wrapper = document.createElement('span');

            wrapper.className = 'name-effect-wrapper';

            wrapper.textContent = originalText;

            

            if (eConf.nameEffect.layer1 !== 'none') {

                wrapper.classList.add(`fx-${eConf.nameEffect.layer1}`);

                wrapper.setAttribute('data-text', originalText);

                if (eConf.nameEffect.hue1 && eConf.nameEffect.hue1 > 0) {

                    wrapper.style.filter = `hue-rotate(${eConf.nameEffect.hue1}deg)`;

                }

            }

            

            if (eConf.nameEffect.layer2 !== 'none') {

                const layer2 = document.createElement('span');

                layer2.className = `name-layer fx-${eConf.nameEffect.layer2}`;

                layer2.textContent = originalText;

                layer2.setAttribute('data-text', originalText);

                if (eConf.nameEffect.hue2 && eConf.nameEffect.hue2 > 0) {

                    layer2.style.filter = `hue-rotate(${eConf.nameEffect.hue2}deg)`;

                }

                wrapper.appendChild(layer2);

                

                // If it's sparkles, add extra particles

                if(eConf.nameEffect.layer2.startsWith('sparkle')) {

                    for(let i=0; i<5; i++) {

                        const sp = document.createElement('div');

                        sp.className = 'sparkle-particle';

                        sp.innerHTML = '✨';

                        let color = '#fff';

                        if(eConf.nameEffect.layer2 === 'sparkle-rainbow') color = 'gold';

                        if(eConf.nameEffect.layer2 === 'sparkle-green') color = '#0f0';

                        sp.style.color = color;

                        sp.style.left = (Math.random() * 100) + '%';

                        sp.style.top = (Math.random() * 100) + '%';

                        sp.style.fontSize = (Math.random() * 10 + 10) + 'px';

                        sp.style.animationDelay = (Math.random() * 1) + 's';

                        wrapper.appendChild(sp);

                    }

                }

            }

            nameEl.appendChild(wrapper);

        }



        // Mouse Decor

        let mouseDecorEl = null;

        if (eConf.mouseDecor && eConf.mouseDecor.enabled && eConf.mouseDecor.image) {

            document.body.classList.add('has-mouse-decor');

            mouseDecorEl = document.createElement('img');

            mouseDecorEl.src = eConf.mouseDecor.image;

            mouseDecorEl.className = 'custom-mouse-decor';

            mouseDecorEl.style.width = eConf.mouseDecor.size + 'px';

            document.body.appendChild(mouseDecorEl);

        }



        

        // Mouse Trails

        let trailType = eConf.mouseTrail;

        

        // Stop canvas ribbon if changing to something else

        if (trailType !== 'ribbons') {

            stopCanvasRibbon();

        } else {

            startCanvasRibbon();

        }

        

        // Setup global mousemove listener for both Decor and Trails

        if (mouseDecorEl || (trailType && trailType !== 'none')) {

            document.onmousemove = (e) => {

                // Update Ribbon Pos

                ribbonPos.x = e.clientX;

                ribbonPos.y = e.clientY;



                // Update Decor position

                if (mouseDecorEl) {

                    mouseDecorEl.style.left = e.clientX + 'px';

                    mouseDecorEl.style.top = e.clientY + 'px';

                }

                

                // Create Trail Particle

                if (trailType && trailType !== 'none' && trailType !== 'ribbons') {

                    // throttle trail creation slightly

                    if(Math.random() > 0.5) return; 



                    const t = document.createElement('div');

                    t.className = 'mouse-trail-particle';

                    t.style.position = 'fixed';

                    t.style.left = e.clientX + 'px';

                    t.style.top = e.clientY + 'px';

                    t.style.pointerEvents = 'none';

                    t.style.zIndex = '999998';

                    t.style.transform = 'translate(-50%, -50%)';

                    

                    if(trailType === 'smooth' || trailType === 'dots') {

                        t.style.width = '10px';

                        t.style.height = '10px';

                        t.style.background = 'var(--primary)';

                        t.style.borderRadius = '50%';

                        t.style.transition = 'all 0.5s ease-out';

                        t.style.opacity = '0.8';

                        document.body.appendChild(t);

                        setTimeout(() => {

                            t.style.transform = 'translate(-50%, -50%) scale(0)';

                            t.style.opacity = '0';

                        }, 10);

                        setTimeout(() => t.remove(), 500);

                    } else if (trailType === 'glow') {

                        t.style.width = '30px';

                        t.style.height = '30px';

                        t.style.border = '2px solid var(--primary)';

                        t.style.borderRadius = '50%';

                        t.style.transition = 'all 0.8s ease-out';

                        document.body.appendChild(t);

                        setTimeout(() => {

                            t.style.transform = 'translate(-50%, -50%) scale(2)';

                            t.style.opacity = '0';

                        }, 10);

                        setTimeout(() => t.remove(), 800);

                    } else if (trailType === 'sparkles') {

                        t.innerHTML = '✨';

                        t.style.color = 'var(--primary)';

                        t.style.fontSize = '14px';

                        t.style.transition = 'all 0.8s ease-out';

                        document.body.appendChild(t);

                        setTimeout(() => {

                            t.style.transform = `translate(-50%, -50%) translate(${(Math.random()-0.5)*50}px, ${(Math.random()-0.5)*50}px) rotate(${Math.random()*180}deg)`;

                            t.style.opacity = '0';

                        }, 10);

                        setTimeout(() => t.remove(), 800);

                    }

                }

            };

        } else {

            document.onmousemove = null;

        }



        // Neko & Duck

        if (eConf.neko) {

            const neko = document.createElement('img');

            neko.className = 'pro-pet neko';

            neko.src = 'https://i.pinimg.com/originals/16/00/f6/1600f684dc3cf1eb62817d1e89ce0c71.gif';

            document.body.appendChild(neko);

        }

        if (eConf.duck) {

            const duck = document.createElement('img');

            duck.className = 'pro-pet duck';

            duck.src = 'https://media.tenor.com/9GzR5X2O_Z8AAAAi/duck-walking.gif';

            document.body.appendChild(duck);

        }

        

        // Icon Border Effect

        let iconStyle = document.getElementById('icon-border-style');

        if (iconStyle) iconStyle.remove();

        

        if (eConf.iconBorder) {

            iconStyle = document.createElement('style');

            iconStyle.id = 'icon-border-style';

            iconStyle.innerHTML = `

                .social-icon {

                    position: relative;

                    border: 2px solid rgba(108, 92, 231, 0.6) !important;

                    border-radius: 50% !important;

                    padding: 8px !important;

                    width: 45px !important;

                    height: 45px !important;

                    display: inline-flex !important;

                    align-items: center !important;

                    justify-content: center !important;

                    box-shadow: 0 0 10px rgba(108, 92, 231, 0.4) !important;

                    animation: iconBorderGlow 2s ease-in-out infinite alternate !important;

                    background: rgba(108, 92, 231, 0.1) !important;

                }

                @keyframes iconBorderGlow {

                    0% { border-color: rgba(108, 92, 231, 0.6); box-shadow: 0 0 5px rgba(108, 92, 231, 0.4); }

                    100% { border-color: rgba(255, 0, 127, 0.8); box-shadow: 0 0 15px rgba(255, 0, 127, 0.6); }

                }

            `;

            document.head.appendChild(iconStyle);

        }

    }

    

    // Old legacy toggle logic check just in case

    if (theme.effects && theme.effects.includes('name-rainbow') && (!eConf || !eConf.nameEffect)) {

        root.style.setProperty('--name-effect', 'rainbow');

    }



    // 7. Background Music

    if (theme.bgm && !window.bgmAudio) {

        if (theme.bgm.startsWith('indexeddb://') && window.MediaDB) {

            window.MediaDB.getMediaUrl(theme.bgm).then(media => {

                window.bgmAudio = new Audio(media.url);

                window.bgmAudio.loop = true;

                // Try autoplay

                window.bgmAudio.play().catch(e => {

                    // Need user interaction

                    document.body.addEventListener('click', () => {

                        if(window.bgmAudio) window.bgmAudio.play();

                    }, {once:true});

                });

            });

        }

    } else if (!theme.bgm && window.bgmAudio) {

        window.bgmAudio.pause();

        window.bgmAudio = null;

    }

}



function loadGoogleFont(fontName) {

    if(!fontName) return;

    if(!document.getElementById(`font-${fontName}`)) {

        const link = document.createElement('link');

        link.id = `font-${fontName}`;

        link.rel = 'stylesheet';

        link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@300;400;500;600;700&display=swap`;

        document.head.appendChild(link);

    }

}



function handleCardTilt(e) {

    const card = e.currentTarget;

    const rect = card.getBoundingClientRect();

    const x = e.clientX - rect.left;

    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;

    const centerY = rect.height / 2;

    const tiltX = (y - centerY) / 20;

    const tiltY = (centerX - x) / 20;

    card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.02, 1.02, 1.02)`;

}

function resetCardTilt(e) {

    e.currentTarget.style.transform = `perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)`;

}



// ==========================================

// CANVAS RIBBON EFFECT

// ==========================================

let ribbonCtx = null;

let ribbonF = null;

let ribbonPos = {x: window.innerWidth / 2, y: window.innerHeight / 2};

let ribbonLines = [];

let ribbonConfig = {

    friction: 0.5,

    trails: 20,

    size: 50,

    dampening: 0.25,

    tension: 0.98,

};

let ribbonIsRunning = false;



function Oscillator(e) {

    this.init(e || {});

}

Oscillator.prototype = {

    init: function (e) {

        this.phase = e.phase || 0;

        this.offset = e.offset || 0;

        this.frequency = e.frequency || 0.001;

        this.amplitude = e.amplitude || 1;

    },

    update: function () {

        this.phase += this.frequency;

        this.value = this.offset + Math.sin(this.phase) * this.amplitude;

        return this.value;

    }

};



function RibbonNode() {

    this.x = ribbonPos.x;

    this.y = ribbonPos.y;

    this.vy = 0;

    this.vx = 0;

}



function RibbonLine(e) {

    this.init(e || {});

}

RibbonLine.prototype = {

    init: function (e) {

        this.spring = e.spring + 0.1 * Math.random() - 0.02;

        this.friction = ribbonConfig.friction + 0.01 * Math.random() - 0.002;

        this.nodes = [];

        for (let n = 0; n < ribbonConfig.size; n++) {

            this.nodes.push(new RibbonNode());

        }

    },

    update: function () {

        let e = this.spring;

        let t = this.nodes[0];

        t.vx += (ribbonPos.x - t.x) * e;

        t.vy += (ribbonPos.y - t.y) * e;

        for (let i = 0, a = this.nodes.length; i < a; i++) {

            t = this.nodes[i];

            if (i > 0) {

                let n = this.nodes[i - 1];

                t.vx += (n.x - t.x) * e;

                t.vy += (n.y - t.y) * e;

                t.vx += n.vx * ribbonConfig.dampening;

                t.vy += n.vy * ribbonConfig.dampening;

            }

            t.vx *= this.friction;

            t.vy *= this.friction;

            t.x += t.vx;

            t.y += t.vy;

            e *= ribbonConfig.tension;

        }

    },

    draw: function () {

        let e, t, n = this.nodes[0].x, i = this.nodes[0].y;

        ribbonCtx.beginPath();

        ribbonCtx.moveTo(n, i);

        let a = 1;

        for (let o = this.nodes.length - 2; a < o; a++) {

            e = this.nodes[a];

            t = this.nodes[a + 1];

            n = 0.5 * (e.x + t.x);

            i = 0.5 * (e.y + t.y);

            ribbonCtx.quadraticCurveTo(e.x, e.y, n, i);

        }

        e = this.nodes[a];

        t = this.nodes[a + 1];

        ribbonCtx.quadraticCurveTo(e.x, e.y, t.x, t.y);

        ribbonCtx.stroke();

        ribbonCtx.closePath();

    }

};



function startCanvasRibbon() {

    if (document.getElementById('ribbon-canvas')) return;



    let canvas = document.createElement('canvas');

    canvas.id = 'ribbon-canvas';

    canvas.style.position = 'fixed';

    canvas.style.top = '0';

    canvas.style.left = '0';

    canvas.style.width = '100vw';

    canvas.style.height = '100vh';

    canvas.style.pointerEvents = 'none';

    canvas.style.zIndex = '999997'; 

    document.body.appendChild(canvas);



    ribbonCtx = canvas.getContext('2d');

    ribbonIsRunning = true;

    

    ribbonF = new Oscillator({

        phase: Math.random() * 2 * Math.PI,

        amplitude: 85,

        frequency: 0.0015,

        offset: 285

    });



    ribbonLines = [];

    for (let e = 0; e < ribbonConfig.trails; e++) {

        ribbonLines.push(new RibbonLine({ spring: 0.4 + (e / ribbonConfig.trails) * 0.025 }));

    }



    function resizeCanvas() {

        if(ribbonCtx && ribbonCtx.canvas) {

            ribbonCtx.canvas.width = window.innerWidth;

            ribbonCtx.canvas.height = window.innerHeight;

        }

    }

    window.addEventListener('resize', resizeCanvas);

    resizeCanvas();



    function renderRibbon() {

        if (!ribbonIsRunning) return;

        ribbonCtx.globalCompositeOperation = 'source-over';

        ribbonCtx.clearRect(0, 0, ribbonCtx.canvas.width, ribbonCtx.canvas.height);

        ribbonCtx.globalCompositeOperation = 'lighter';

        ribbonCtx.strokeStyle = 'hsla(' + Math.round(ribbonF.update()) + ',50%,50%,0.2)';

        ribbonCtx.lineWidth = 1;

        for (let t = 0; t < ribbonConfig.trails; t++) {

            let line = ribbonLines[t];

            line.update();

            line.draw();

        }

        window.requestAnimationFrame(renderRibbon);

    }

    renderRibbon();

}



function stopCanvasRibbon() {

    ribbonIsRunning = false;

    let canvas = document.getElementById('ribbon-canvas');

    if (canvas) canvas.remove();

}





// ==========================================

// REAL-TIME PUBLIC WIDGET RENDERER

// ==========================================



// Store active tab ID globally on the public page for the Tabbed View

let activeWidgetTabId = null;

let activeWidgetRadialId = null;



async function renderPublicWidgets(widgets, themeCustom) {
    const container = document.getElementById('bio-render-container');
    if (!container) return;
    
    // Remove existing widgets container if any
    const existing = document.getElementById('widgets-grid-container');
    if (existing) existing.remove();
    
    if (!widgets || widgets.length === 0) return;
    
    const grid = document.createElement('div');
    grid.id = 'widgets-grid-container';
    grid.className = 'widgets-grid';
    
    // Original 2-column grid layout inline CSS
    grid.style.cssText = `
        width: 100%;
        margin-top: 15px;
        margin-bottom: 25px;
        box-sizing: border-box;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
    `;
    
    // Helper to get platform brand properties
    const getBrandProps = (type) => {
        let color = '#6c5ce7';
        let icon = 'fa-solid fa-puzzle-piece';
        if (type === 'youtube') { color = '#ff0000'; icon = 'fa-brands fa-youtube'; }
        else if (type === 'discord') { color = '#5865F2'; icon = 'fa-brands fa-discord'; }
        else if (type === 'spotify') { color = '#1DB954'; icon = 'fa-brands fa-spotify'; }
        else if (type === 'instagram') { color = '#E1306C'; icon = 'fa-brands fa-instagram'; }
        else if (type === 'tiktok') { color = '#000000'; icon = 'fa-brands fa-tiktok'; }
        else if (type === 'github') { color = '#24292e'; icon = 'fa-brands fa-github'; }
        else if (type === 'twitch') { color = '#9146FF'; icon = 'fa-brands fa-twitch'; }
        return { color, icon };
    };

    widgets.forEach((w) => {
        const { color: brandColor, icon: brandIcon } = getBrandProps(w.type);
        const card = document.createElement('a');
        card.href = w.url;
        card.target = '_blank';
        card.style.textDecoration = 'none';
        
        const fallbackAvatar = `https://api.dicebear.com/7.x/identicon/svg?seed=${w.type}`;
        const avatarImg = w.avatar || fallbackAvatar;
        
        card.style.cssText = `
            background: rgba(255, 255, 255, 0.03);
            border: 1.5px solid ${brandColor}33;
            border-radius: 20px;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            color: #fff;
            box-sizing: border-box;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 0 10px ${brandColor}11;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 18px 12px;
            text-align: center;
            gap: 10px;
            position: relative;
        `;
        
        // Hover effects
        card.onmouseover = () => { 
            card.style.transform = 'translateY(-3px)'; 
            card.style.boxShadow = `0 8px 25px rgba(0,0,0,0.25), 0 0 15px ${brandColor}33`;
            card.style.borderColor = `${brandColor}66`;
        };
        card.onmouseout = () => { 
            card.style.transform = 'none'; 
            card.style.boxShadow = `0 4px 20px rgba(0,0,0,0.15), 0 0 10px ${brandColor}11`;
            card.style.borderColor = `${brandColor}33`;
        };
        
        let statsHtml = '';
        
        // Generate Stats markup
        if (w.type === 'youtube') {
            statsHtml = `<span id="pub-yt-subcount-${w.id}"><strong>${w.count1}</strong> subscribers</span>`;
        } else if (w.type === 'discord') {
            statsHtml = `
                <span style="display:inline-flex; align-items:center; gap:4px; white-space:nowrap;">
                    <span style="display:inline-block; width:6px; height:6px; background:#23a55a; border-radius:50%; box-shadow:0 0 4px #23a55a;"></span>
                    <strong id="pub-disc-online-${w.id}">${w.count1}</strong> online
                </span>
            `;
        } else if (w.type === 'spotify') {
            statsHtml = `<span id="pub-spot-followers-${w.id}"><strong>${w.count1}</strong> followers</span>`;
        } else if (w.type === 'instagram') {
            statsHtml = `<span id="pub-ig-followers-${w.id}"><strong>${w.count1}</strong> followers</span>`;
        } else if (w.type === 'tiktok') {
            statsHtml = `<span id="pub-tt-followers-${w.id}"><strong>${w.count1}</strong> followers</span>`;
        } else if (w.type === 'github') {
            statsHtml = `<span id="pub-gh-followers-${w.id}"><strong>${w.count1}</strong> followers</span>`;
        } else if (w.type === 'twitch') {
            statsHtml = `<span id="pub-tw-followers-${w.id}"><strong>${w.count1}</strong> followers</span>`;
        }
        
        card.innerHTML = `
            <div style="position: absolute; top: 12px; right: 12px; color: ${brandColor}; font-size: 1.1rem; opacity: 0.85;">
                <i class="${brandIcon}"></i>
            </div>
            <img src="${avatarImg}" style="width: 46px; height: 46px; border-radius: 50%; object-fit: cover; border: 2px solid ${brandColor}aa;" onerror="this.src='${fallbackAvatar}'">
            <div style="width: 100%; min-width: 0;">
                <h5 style="margin: 0 0 2px 0; color: #fff; font-size: 0.9rem; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.2;">
                    ${w.title || 'Loading...'}
                </h5>
                <div style="color: rgba(255,255,255,0.5); font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 6px;">
                    ${w.handle || '@Handle'}
                </div>
                <div style="color: rgba(255,255,255,0.75); font-size: 0.72rem; font-weight: 600; display: flex; justify-content: center; gap: 4px;">
                    ${statsHtml}
                </div>
            </div>
        `;
        
        grid.appendChild(card);
        
        if (!isPreviewMode) {
            triggerRealtimeWidgetUpdate(w);
        }
    });
    
    const profileHeader = document.getElementById('profile-header');
    if (profileHeader) {
        profileHeader.parentNode.insertBefore(grid, profileHeader.nextSibling);
    } else {
        container.insertBefore(grid, container.firstChild);
    }
}

async function triggerRealtimeWidgetUpdate(w) {

    try {

        if (w.type === 'discord') {

            const match = w.url.match(/(?:discord\.(?:gg|com\/invite)\/)([a-zA-Z0-9-]+)/i) || w.url.match(/^[a-zA-Z0-9-]+$/);

            if (!match) return;

            const code = match[1];

            

            const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent('https://discord.com/api/v9/invites/' + code + '?with_counts=true')}`);

            if (!response.ok) return;

            const resData = await response.json();

            const contents = JSON.parse(resData.contents);

            

            if (contents.guild) {

                const onlineEl = document.getElementById(`pub-disc-online-${w.id}`);

                const totalEl = document.getElementById(`pub-disc-total-${w.id}`);

                if (onlineEl) onlineEl.textContent = contents.approximate_presence_count;

                if (totalEl) totalEl.textContent = contents.approximate_member_count;

            }

        } else if (w.type === 'youtube') {

            const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(w.url)}`);

            if (!response.ok) return;

            const resData = await response.json();

            const html = resData.contents;

            

            const subMatch = html.match(/"subscriberCountText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"\}/) ||

                             html.match(/"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)\s+subscribers?"\s*\}\s*\]/) ||

                             html.match(/(\d+(?:\.\d+)?[KMB]?)\s*subscribers/i);

            if (subMatch) {

                const subEl = document.getElementById(`pub-yt-subcount-${w.id}`);

                if (subEl) {

                    subEl.textContent = subMatch[1].replace(' subscribers', '').replace(' subscriber', '').trim();

                }

            }

        } else if (w.type === 'github') {

            const match = w.url.match(/github\.com\/([a-zA-Z0-9-]+)/i);

            if (!match) return;

            const ghUser = match[1];

            const response = await fetch(`https://api.github.com/users/${ghUser}`);

            if (!response.ok) return;

            const data = await response.json();

            const followersEl = document.getElementById(`pub-gh-followers-${w.id}`);

            const reposEl = document.getElementById(`pub-gh-repos-${w.id}`);

            if (followersEl) followersEl.innerHTML = `<strong>${data.followers || 0}</strong> followers`;

            if (reposEl) reposEl.innerHTML = `<strong>${data.public_repos || 0}</strong> repos`;

        }

    } catch (e) {

        console.error("Realtime widget update failed:", e);

    }

}

