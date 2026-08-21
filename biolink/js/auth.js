// auth.js - Sign In & Sign Up flows

let authMode = 'login'; // 'login' or 'register'
let usernameChecked = false;
let usernameAvailable = false;

document.addEventListener('DOMContentLoaded', () => {
    // Redirect if already logged in
    const currentSession = window.DB.getCurrentSession();
    if (currentSession) {
        window.location.href = 'dashboard.html';
        return;
    }

    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const groupUsername = document.getElementById('group-username');
    const submitBtn = document.getElementById('submit-btn');
    const usernameInput = document.getElementById('username');
    const usernameStatus = document.getElementById('username-status');
    const errorBox = document.getElementById('error-box');

    // Switch Tabs
    tabLogin.addEventListener('click', () => {
        authMode = 'login';
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        groupUsername.style.display = 'none';
        submitBtn.textContent = 'เข้าสู่ระบบ';
        document.getElementById('username').removeAttribute('required');
        hideError();
    });

    tabRegister.addEventListener('click', () => {
        authMode = 'register';
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        groupUsername.style.display = 'block';
        submitBtn.textContent = 'สมัครสมาชิก';
        document.getElementById('username').setAttribute('required', 'true');
        hideError();
    });

    // Username Realtime Check
    let debounceTimer;
    usernameInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
        e.target.value = val; // Force alphanumeric and underscores

        if (val.length < 3) {
            usernameStatus.innerHTML = '';
            usernameChecked = false;
            return;
        }

        usernameStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color: var(--text-muted)"></i>';

        debounceTimer = setTimeout(() => {
            const available = window.DB.checkUsernameAvailable(val);
            if (available) {
                usernameStatus.innerHTML = '<i class="fa-solid fa-circle-check status-available"></i>';
                usernameAvailable = true;
            } else {
                usernameStatus.innerHTML = '<i class="fa-solid fa-circle-xmark status-taken"></i>';
                usernameAvailable = false;
            }
            usernameChecked = true;
        }, 300);
    });

    // Check URL parameters for tab=register or reg=username
    const urlParams = new URLSearchParams(window.location.search);
    const regUsername = urlParams.get('reg');
    const tabParam = urlParams.get('tab');

    if (tabParam === 'register' || regUsername) {
        tabRegister.click();
    }
    if (regUsername) {
        usernameInput.value = regUsername.toLowerCase().trim();
        // Trigger input event to check availability
        usernameInput.dispatchEvent(new Event('input'));
    }
});

function fillDemo() {
    document.getElementById('email').value = 'demo@example.com';
    document.getElementById('password').value = 'password123';
    // Switch to login tab if on register
    document.getElementById('tab-login').click();
}

function showError(msg) {
    const errorBox = document.getElementById('error-box');
    const errorText = document.getElementById('error-text');
    errorText.textContent = msg;
    errorBox.style.display = 'flex';
}

function hideError() {
    const errorBox = document.getElementById('error-box');
    errorBox.style.display = 'none';
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    hideError();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const submitBtn = document.getElementById('submit-btn');

    // Add Loading effect
    submitBtn.classList.add('btn-loading');
    submitBtn.disabled = true;

    // Simulate Network latency (300ms) for premium feel
    await new Promise(resolve => setTimeout(resolve, 500));

    if (authMode === 'login') {
        const res = window.DB.login(email, password);
        submitBtn.classList.remove('btn-loading');
        submitBtn.disabled = false;

        if (res.success) {
            window.location.href = 'dashboard.html';
        } else {
            showError(res.message);
        }
    } else {
        const username = document.getElementById('username').value;

        if (!usernameChecked || !usernameAvailable) {
            submitBtn.classList.remove('btn-loading');
            submitBtn.disabled = false;
            showError('กรุณาเลือก Username ที่ใช้งานได้');
            return;
        }

        const res = window.DB.register(email, username, password);
        submitBtn.classList.remove('btn-loading');
        submitBtn.disabled = false;

        if (res.success) {
            window.location.href = 'dashboard.html';
        } else {
            showError(res.message);
        }
    }
}
