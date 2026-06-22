import { apiRequest } from '../../api-client.js';
import { memoryCache, refreshCasesCache } from '../../db-services.js';

function toIsoDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
}

function toIsoDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return new Date().toISOString();
    return date.toISOString();
}

function normalizeSession(session) {
    return {
        id: session.id,
        caseId: session.caseId,
        caseNo: session.caseNo || '',
        clientName: session.clientName || '',
        court: session.court || '',
        circuit: session.circuit || '',
        rollNumber: session.rollNumber || '',
        sessionDate: session.sessionDate,
        status: session.status || 'PendingAttendance',
        decision: session.decision || '',
        notes: session.notes || '',
        attendedAt: session.attendedAt || null,
        outcomeType: session.outcomeType || '',
        courtDecision: session.courtDecision || '',
        lawyerNotes: session.lawyerNotes || '',
        nextSessionDate: session.nextSessionDate || null,
        nextSessionReason: session.nextSessionReason || '',
        outcomeAt: session.outcomeAt || null,
        outcomeByUserId: session.outcomeByUserId || null,
        archiveNumber: session.archiveNumber || '',
        archivedAt: session.archivedAt || null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
    };
}

function normalizeSessions(sessions) {
    return sessions
        .map(normalizeSession)
        .sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate));
}

function dispatchSessionsUpdated(sessions) {
    memoryCache.sessions = normalizeSessions(sessions);
    window.dispatchEvent(new CustomEvent('sessionsUpdated', { detail: memoryCache.sessions }));
    return memoryCache.sessions;
}

async function refreshSessionsByDate(date, dispatchEvent = true) {
    const sessions = await apiRequest(`/api/sessions?date=${encodeURIComponent(toIsoDate(date))}`);
    const normalized = normalizeSessions(sessions);
    if (dispatchEvent) {
        dispatchSessionsUpdated(normalized);
    }
    return normalized;
}

export async function refreshAllSessions(dispatchEvent = true) {
    const sessions = await apiRequest('/api/sessions');
    const normalized = normalizeSessions(sessions);
    if (dispatchEvent) {
        dispatchSessionsUpdated(normalized);
    } else {
        memoryCache.sessions = normalized;
    }
    return normalized;
}

function toSessionCreateRequest(data) {
    return {
        sessionDate: toIsoDateTime(data.sessionDate || data.date),
        rollNumber: data.rollNumber || null,
        decision: data.decision || null,
        notes: data.notes || null,
        status: data.status || 'PendingAttendance'
    };
}

function toSessionUpdateRequest(data) {
    const payload = {
        sessionDate: data.sessionDate || data.date ? toIsoDateTime(data.sessionDate || data.date) : null,
        rollNumber: data.rollNumber || null,
        status: data.status || null,
        decision: data.decision || null,
        notes: data.notes || null,
        postponedToDate: data.postponedToDate ? toIsoDateTime(data.postponedToDate) : null
    };

    Object.keys(payload).forEach((key) => {
        if (payload[key] === null || payload[key] === undefined || payload[key] === '') {
            delete payload[key];
        }
    });

    return payload;
}

export async function addSession(data) {
    try {
        if (!data.caseId) throw new Error('Case is required');
        const session = await apiRequest(`/api/cases/${data.caseId}/sessions`, {
            method: 'POST',
            body: toSessionCreateRequest(data)
        });

        await Promise.all([
            refreshAllSessions(),
            refreshCasesCache()
        ]);
        return { id: session.id, ...normalizeSession(session) };
    } catch (error) {
        console.error('addSession error:', error);
        throw error;
    }
}

export async function getSessionsByDate(date) {
    try {
        return await refreshSessionsByDate(date, false);
    } catch (error) {
        console.error('getSessionsByDate error:', error);
        throw error;
    }
}

export function subscribeToDailySessions(date, callback) {
    let active = true;

    const load = () => {
        refreshSessionsByDate(date, false)
            .then((sessions) => {
                if (active) callback(sessions);
            })
            .catch((error) => {
                console.error('subscribeToDailySessions error:', error);
            });
    };

    const onSessionsUpdated = () => load();
    window.addEventListener('sessionsUpdated', onSessionsUpdated);
    load();

    return () => {
        active = false;
        window.removeEventListener('sessionsUpdated', onSessionsUpdated);
    };
}

export async function getSessionsByCase(caseId) {
    try {
        const sessions = await apiRequest(`/api/cases/${caseId}/sessions`);
        return normalizeSessions(sessions).sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate));
    } catch (error) {
        console.error('getSessionsByCase error:', error);
        throw error;
    }
}

export async function updateSession(id, data) {
    try {
        const session = await apiRequest(`/api/sessions/${id}`, {
            method: 'PUT',
            body: toSessionUpdateRequest(data)
        });

        await Promise.all([
            refreshAllSessions(),
            refreshCasesCache()
        ]);
        return normalizeSession(session);
    } catch (error) {
        console.error('updateSession error:', error);
        throw error;
    }
}

export async function attendSession(id, notes = '') {
    try {
        const session = await apiRequest(`/api/sessions/${id}/attend`, {
            method: 'PATCH',
            body: { notes }
        });

        await refreshAllSessions();
        return normalizeSession(session);
    } catch (error) {
        console.error('attendSession error:', error);
        throw error;
    }
}

export async function postponeSession(id, newSessionDate, notes = '') {
    try {
        const result = await apiRequest(`/api/sessions/${id}/postpone`, {
            method: 'PATCH',
            body: {
                newSessionDate: toIsoDateTime(newSessionDate),
                notes
            }
        });

        await Promise.all([
            refreshAllSessions(),
            refreshCasesCache()
        ]);
        return {
            originalSession: normalizeSession(result.originalSession),
            newSession: normalizeSession(result.newSession)
        };
    } catch (error) {
        console.error('postponeSession error:', error);
        throw error;
    }
}

export async function archiveSession(id, archiveNumber = '', notes = '') {
    try {
        const archive = await apiRequest(`/api/sessions/${id}/archive`, {
            method: 'PATCH',
            body: {
                archiveNumber,
                notes
            }
        });

        await refreshAllSessions();
        window.dispatchEvent(new CustomEvent('sessionArchived', { detail: archive }));
        return archive;
    } catch (error) {
        console.error('archiveSession error:', error);
        throw error;
    }
}

export async function addSessionOutcome(id, data = {}) {
    const result = await apiRequest(`/api/sessions/${id}/outcome`, {
        method: 'PATCH',
        body: {
            outcomeType: data.outcomeType || '',
            courtDecision: data.courtDecision || null,
            lawyerNotes: data.lawyerNotes || null,
            nextSessionDate: data.nextSessionDate ? toIsoDateTime(data.nextSessionDate) : null,
            nextSessionReason: data.nextSessionReason || null
        }
    });

    await Promise.all([
        refreshAllSessions(),
        refreshCasesCache()
    ]);
    window.dispatchEvent(new CustomEvent('sessionOutcomeUpdated', { detail: result }));
    return {
        session: normalizeSession(result.session),
        newSession: result.newSession ? normalizeSession(result.newSession) : null
    };
}

export async function getSessionArchives(search = '') {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiRequest(`/api/archive/sessions${query}`);
}

function toManualArchivePayload(data) {
    const payload = {
        archiveNumber: data.archiveNumber || null,
        oldCaseNumber: data.oldCaseNumber || null,
        clientName: data.clientName || '',
        opponentName: data.opponentName || null,
        caseTitle: data.caseTitle || '',
        caseType: data.caseType || null,
        courtName: data.courtName || null,
        caseYear: data.caseYear ? Number(data.caseYear) : null,
        archiveDate: data.archiveDate ? toIsoDateTime(data.archiveDate) : null,
        boxNumber: data.boxNumber || null,
        shelfNumber: data.shelfNumber || null,
        physicalLocation: data.physicalLocation || null,
        lawyerName: data.lawyerName || null,
        notes: data.notes || null,
        tags: data.tags || null,
        status: data.status || 'Active'
    };

    Object.keys(payload).forEach((key) => {
        if (payload[key] === null || payload[key] === undefined || payload[key] === '') {
            delete payload[key];
        }
    });

    return payload;
}

function buildArchiveQuery(filters = {}) {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.source && filters.source !== 'all') params.set('source', filters.source);
    if (filters.caseYear) params.set('caseYear', filters.caseYear);
    if (filters.courtName) params.set('courtName', filters.courtName);
    if (filters.boxNumber) params.set('boxNumber', filters.boxNumber);
    if (filters.page) params.set('page', filters.page);
    if (filters.pageSize) params.set('pageSize', filters.pageSize);
    return params.toString() ? `?${params.toString()}` : '';
}

export async function getAllArchives(filters = {}) {
    return apiRequest(`/api/archive/all${buildArchiveQuery(filters)}`);
}

export async function getManualArchives(filters = {}) {
    return apiRequest(`/api/archive/manual${buildArchiveQuery(filters)}`);
}

export async function createManualArchive(data) {
    const archive = await apiRequest('/api/archive/manual', {
        method: 'POST',
        body: toManualArchivePayload(data)
    });

    window.dispatchEvent(new CustomEvent('manualArchiveUpdated', { detail: archive }));
    return archive;
}

export async function updateManualArchive(id, data) {
    const archive = await apiRequest(`/api/archive/manual/${id}`, {
        method: 'PUT',
        body: toManualArchivePayload(data)
    });

    window.dispatchEvent(new CustomEvent('manualArchiveUpdated', { detail: archive }));
    return archive;
}

export async function deleteManualArchive(id) {
    await apiRequest(`/api/archive/manual/${id}`, { method: 'DELETE' });
    window.dispatchEvent(new CustomEvent('manualArchiveUpdated', { detail: { id } }));
}

export async function deleteSession(id) {
    try {
        await apiRequest(`/api/sessions/${id}`, { method: 'DELETE' });
        await refreshAllSessions();
    } catch (error) {
        console.error('deleteSession error:', error);
        throw error;
    }
}

export function subscribeAllSessions(callback) {
    let active = true;

    const load = () => {
        refreshAllSessions(false)
            .then((sessions) => {
                if (active) callback(sessions);
            })
            .catch((error) => {
                console.error('subscribeAllSessions error:', error);
            });
    };

    const onSessionsUpdated = (event) => {
        if (active) callback(event.detail || []);
    };

    window.addEventListener('sessionsUpdated', onSessionsUpdated);
    load();

    return () => {
        active = false;
        window.removeEventListener('sessionsUpdated', onSessionsUpdated);
    };
}
