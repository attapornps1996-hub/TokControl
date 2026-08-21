/**
 * TokControl themed confirm/alert dialogs (replaces native confirm/alert).
 */
(function () {
    let confirmActionCallback = null;
    let confirmCancelCallback = null;

    function playConfirmSfx() {
        if (typeof playSFX === 'function') playSFX('snd-warning', 0.5);
    }

    function showConfirmModal(title, message, callback, opts = {}) {
        const overlay = document.getElementById('confirmModalOverlay');
        const panel = document.getElementById('confirmPanel');
        const iconEl = document.getElementById('confirmIcon');
        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = overlay && overlay.querySelector('.tc-confirm-btn--ghost');
        const titleEl = document.getElementById('confirmTitle');
        const textEl = document.getElementById('confirmText');
        if (!overlay || !panel || !titleEl || !textEl || !okBtn) {
            const ok = typeof window.confirm === 'function' ? window.confirm(String(message || title || 'ยืนยัน?')) : true;
            if (ok && typeof callback === 'function') callback();
            return;
        }

        titleEl.textContent = title || 'ยืนยัน';
        textEl.textContent = message || '';
        if (iconEl) iconEl.textContent = opts.icon || '⚠️';
        panel.classList.toggle('tc-confirm-panel--accent', opts.tone === 'accent');
        panel.classList.toggle('tc-confirm-panel--danger', opts.tone !== 'accent');
        okBtn.textContent = opts.okLabel || 'ตกลง';
        okBtn.classList.toggle('tc-confirm-btn--accent', opts.tone === 'accent');
        if (cancelBtn) cancelBtn.textContent = opts.cancelLabel || 'ยกเลิก';

        confirmActionCallback = typeof callback === 'function' ? callback : null;
        confirmCancelCallback = typeof opts.onCancel === 'function' ? opts.onCancel : null;

        overlay.style.display = 'flex';
        playConfirmSfx();
        setTimeout(() => { try { okBtn.focus(); } catch (e) { /* ignore */ } }, 30);
    }

    function closeConfirmModal() {
        const overlay = document.getElementById('confirmModalOverlay');
        if (overlay) overlay.style.display = 'none';
        if (confirmCancelCallback) {
            const fn = confirmCancelCallback;
            confirmCancelCallback = null;
            confirmActionCallback = null;
            fn();
            return;
        }
        confirmActionCallback = null;
        confirmCancelCallback = null;
    }

    function executeConfirm() {
        confirmCancelCallback = null;
        if (confirmActionCallback) confirmActionCallback();
        confirmActionCallback = null;
        const overlay = document.getElementById('confirmModalOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    /**
     * Promise-based confirm. Resolves true (OK) or false (Cancel).
     * @param {string} message
     * @param {{ title?: string, okLabel?: string, cancelLabel?: string, tone?: 'danger'|'accent', icon?: string }} opts
     */
    function tcConfirm(message, opts = {}) {
        const title = opts.title || 'ยืนยัน';
        return new Promise((resolve) => {
            showConfirmModal(title, message, () => resolve(true), {
                ...opts,
                onCancel: () => resolve(false)
            });
        });
    }

    function tcAlert(message, opts = {}) {
        const title = opts.title || 'แจ้งเตือน';
        const type = opts.type || 'warning';
        if (typeof showCustomMsg === 'function') {
            showCustomMsg(type, title, message);
            return Promise.resolve();
        }
        return tcConfirm(message, {
            title,
            icon: opts.icon || (type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️'),
            tone: type === 'error' ? 'danger' : 'accent',
            okLabel: 'ตกลง',
            cancelLabel: null
        }).then(() => undefined);
    }

    function initConfirmModalUi() {
        const overlay = document.getElementById('confirmModalOverlay');
        if (!overlay || overlay.dataset.tcDialogInit === '1') return;
        overlay.dataset.tcDialogInit = '1';
        if (!overlay.style.display) overlay.style.display = 'none';
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeConfirmModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (overlay.style.display === 'flex') closeConfirmModal();
        });
        const panel = document.getElementById('confirmPanel');
        if (panel) {
            panel.addEventListener('click', (e) => e.stopPropagation());
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initConfirmModalUi);
    } else {
        initConfirmModalUi();
    }

    window.showConfirmModal = showConfirmModal;
    window.closeConfirmModal = closeConfirmModal;
    window.executeConfirm = executeConfirm;
    window.tcConfirm = tcConfirm;
    window.tcAlert = tcAlert;
})();
