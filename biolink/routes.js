/**
 * Bio-link module — Super Bio PRO embedded in TokControl.
 * Serves dashboard + public bio pages under /biolink/*
 */
const path = require('path');
const express = require('express');

function registerBiolinkRoutes(app, { rootDir = path.join(__dirname, '..') } = {}) {
    const biolinkRoot = path.join(rootDir, 'biolink');

    app.use('/biolink', express.static(biolinkRoot, {
        index: false,
        extensions: ['html']
    }));

    // แดชบอร์ดตั้งค่า / โปรไฟล์ / ตกแต่ง
    app.get(['/biolink', '/biolink/', '/biolink/dashboard'], (req, res) => {
        res.sendFile(path.join(biolinkRoot, 'dashboard.html'));
    });

    app.get('/biolink/login.html', (req, res) => {
        res.sendFile(path.join(biolinkRoot, 'login.html'));
    });

    app.get('/biolink/login', (req, res) => {
        res.redirect(302, '/biolink/login.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''));
    });

    // หน้าไบโอสาธารณะ: /biolink/u/username หรือ /b/username
    app.get('/biolink/u/:username', (req, res) => {
        res.redirect(302, `/biolink/index.html?u=${encodeURIComponent(req.params.username)}`);
    });

    app.get('/b/:username', (req, res) => {
        res.redirect(302, `/biolink/index.html?u=${encodeURIComponent(req.params.username)}`);
    });

    // API stub — เก็บโปรไฟล์ฝั่ง client (localStorage) เป็นหลัก; เผื่อ sync ภายหลัง
    app.get('/api/biolink/health', (req, res) => {
        res.json({
            success: true,
            module: 'biolink',
            dashboard: '/biolink/dashboard',
            publicPattern: '/biolink/u/{username}'
        });
    });
}

module.exports = { registerBiolinkRoutes };
