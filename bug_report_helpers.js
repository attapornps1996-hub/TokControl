/**
 * Shared bug-report validation / normalization for SQLite + Firestore.
 */
const CATEGORIES = new Set(['bug', 'suggestion', 'usability', 'other']);
const STATUSES = new Set(['pending', 'investigating', 'resolved', 'closed']);
const PRIORITIES = new Set(['low', 'medium', 'high']);
const FREQUENCIES = new Set(['once', 'sometimes', 'always', 'unsure']);

function parseJson(value, fallback) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(String(value));
    } catch {
        return fallback;
    }
}

function stringifyJson(value) {
    if (value == null) return null;
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
}

function normalizeCategory(value) {
    const s = String(value || '').toLowerCase().trim();
    if (s === 'feature' || s === 'idea') return 'suggestion';
    if (s === 'ux' || s === 'usage') return 'usability';
    if (CATEGORIES.has(s)) return s;
    return 'bug';
}

function normalizeStatus(value) {
    const s = String(value || '').toLowerCase().trim();
    if (s === 'open' || s === 'new' || s === 'todo') return 'pending';
    if (s === 'fixed' || s === 'done') return 'resolved';
    if (STATUSES.has(s)) return s;
    return 'pending';
}

function normalizePriority(value, category) {
    const s = String(value || '').toLowerCase().trim();
    if (PRIORITIES.has(s)) return s;
    if (category === 'suggestion' || category === 'other') return 'low';
    return 'medium';
}

function normalizeFrequency(value) {
    const s = String(value || '').toLowerCase().trim();
    return FREQUENCIES.has(s) ? s : '';
}

function formatReportCode(id) {
    const raw = String(id || '').trim();
    if (/^\d+$/.test(raw)) return `RPT-${raw.padStart(4, '0')}`;
    const digits = raw.replace(/\D/g, '').slice(-6);
    if (digits) return `RPT-${digits.padStart(4, '0')}`;
    return `RPT-${raw.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || '0000'}`;
}

function defaultPriorityFor(category) {
    return category === 'bug' || category === 'usability' ? 'medium' : 'low';
}

function buildActivityEntry(actor, type, extra) {
    return {
        at: new Date().toISOString(),
        type,
        actorId: actor?.id != null ? String(actor.id) : '',
        actorName: String(actor?.name || actor?.username || 'ระบบ'),
        ...extra
    };
}

function appendActivity(existing, entry) {
    const list = Array.isArray(parseJson(existing, [])) ? parseJson(existing, []) : [];
    list.push(entry);
    return list.slice(-80);
}

function normalizeAttachments(raw, screenshotAssetId) {
    const list = parseJson(raw, []);
    const items = Array.isArray(list) ? list.filter((x) => x && x.assetId) : [];
    if (!items.length && screenshotAssetId) {
        items.push({ assetId: screenshotAssetId, name: 'screenshot', mime: 'image/webp' });
    }
    return items.slice(0, 8);
}

function publicReport(row) {
    if (!row) return null;
    const category = normalizeCategory(row.category);
    const attachments = normalizeAttachments(row.attachments, row.screenshotAssetId);
    return {
        ...row,
        reportCode: formatReportCode(row.id),
        category,
        status: normalizeStatus(row.status),
        priority: normalizePriority(row.priority, category),
        frequency: normalizeFrequency(row.frequency),
        location: String(row.location || ''),
        displayName: String(row.displayName || row.username || ''),
        title: String(row.title || '').trim(),
        attachments,
        systemInfo: parseJson(row.systemInfo, {}) || {},
        activity: parseJson(row.activity, []) || [],
        assignedTo: row.assignedTo != null ? String(row.assignedTo) : '',
        assignedName: String(row.assignedName || '')
    };
}

function deriveTitle(message) {
    const text = String(message || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const line = text.split(/[\n.]/)[0].trim();
    return (line || text).slice(0, 80);
}

module.exports = {
    CATEGORIES,
    STATUSES,
    PRIORITIES,
    FREQUENCIES,
    parseJson,
    stringifyJson,
    normalizeCategory,
    normalizeStatus,
    normalizePriority,
    normalizeFrequency,
    formatReportCode,
    defaultPriorityFor,
    buildActivityEntry,
    appendActivity,
    normalizeAttachments,
    publicReport,
    deriveTitle
};
