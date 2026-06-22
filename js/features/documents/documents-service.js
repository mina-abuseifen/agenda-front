import { apiRequest, readAccessToken } from '../../api-client.js';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
]);

function getApiBaseUrl() {
    const configuredUrl = window.__ENV__?.NEXT_PUBLIC_API_URL || window.__LAWYER_API_BASE_URL || '';
    return configuredUrl.replace(/\/$/, '');
}

function validateDocumentFile(file) {
    if (!file) throw new Error('Document file is required');
    if (!ALLOWED_FILE_TYPES.has(file.type)) throw new Error('Unsupported document type');
    if (file.size > MAX_FILE_SIZE_BYTES) throw new Error('Document size must be 10MB or less');
}

function toTimestampCompat(value) {
    return {
        toDate: () => new Date(value)
    };
}

async function openAuthenticatedDownload(documentId, caseId = '') {
    const headers = new Headers();
    const token = readAccessToken();
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const path = caseId
        ? `/api/cases/${caseId}/documents/${documentId}/download`
        : `/api/documents/${documentId}/download`;
    const response = await fetch(`${getApiBaseUrl()}${path}`, { headers });
    if (!response.ok) {
        throw new Error(`Document download failed with status ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function normalizeDocument(document) {
    const downloadUrl = `/api/cases/${document.caseId}/documents/${document.id}/download`;

    return {
        id: document.id,
        caseId: document.caseId,
        clientId: document.clientId || '',
        fileName: document.fileName || '',
        originalFileName: document.originalFileName || document.fileName || '',
        fileType: document.fileType || '',
        contentType: document.contentType || document.fileType || '',
        fileSize: document.fileSize || 0,
        documentType: document.documentType || 'أخرى',
        storagePath: document.storagePath || '',
        uploadedAt: document.uploadedAt,
        uploadedByUserId: document.uploadedByUserId || '',
        notes: document.notes || '',
        isDeleted: Boolean(document.isDeleted),
        uploadDate: document.uploadedAt ? toTimestampCompat(document.uploadedAt) : null,
        downloadURL: downloadUrl,
        fileUrl: `javascript:void(window.__downloadDocumentById && window.__downloadDocumentById('${document.id}', '${document.caseId}'))`,
        open: () => openAuthenticatedDownload(document.id, document.caseId)
    };
}

if (typeof window !== 'undefined') {
    window.__downloadDocumentById = openAuthenticatedDownload;

    if (!window.__documentDownloadInterceptorRegistered) {
        window.__documentDownloadInterceptorRegistered = true;
        document.addEventListener('click', (event) => {
            const link = event.target?.closest?.('a[href*="__downloadDocumentById"]');
            if (!link) return;

            const href = link.getAttribute('href') || '';
            const match = href.match(/__downloadDocumentById\('([^']+)'(?:,\s*'([^']+)')?\)/);
            if (!match) return;

            event.preventDefault();
            openAuthenticatedDownload(match[1], match[2] || '').catch((error) => {
                console.error('downloadDocument error:', error);
            });
        });
    }
}

/**
 * @typedef {Object} Document
 * @property {string} id
 * @property {string} caseId
 * @property {string} fileName
 * @property {string} fileType
 * @property {string} fileUrl
 * @property {string} downloadURL
 * @property {string} storagePath
 * @property {any} uploadDate
 * @property {string} uploadedAt
 */

export async function uploadDocument(caseId, file, documentType = 'أخرى', notes = '') {
    try {
        validateDocumentFile(file);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('documentType', documentType || 'أخرى');
        formData.append('notes', notes || '');

        const document = await apiRequest(`/api/cases/${caseId}/documents`, {
            method: 'POST',
            body: formData
        });

        return normalizeDocument(document);
    } catch (error) {
        console.error('uploadDocument error:', error);
        throw error;
    }
}

export async function getDocumentsByCase(caseId) {
    try {
        const documents = await apiRequest(`/api/cases/${caseId}/documents`);
        return documents.map(normalizeDocument);
    } catch (error) {
        console.error('getDocumentsByCase error:', error);
        throw error;
    }
}

export async function downloadDocument(docId, caseId = '') {
    try {
        await openAuthenticatedDownload(docId, caseId);
    } catch (error) {
        console.error('downloadDocument error:', error);
        throw error;
    }
}

export async function deleteDocument(docId, caseId = '') {
    try {
        const path = caseId ? `/api/cases/${caseId}/documents/${docId}` : `/api/documents/${docId}`;
        await apiRequest(path, { method: 'DELETE' });
    } catch (error) {
        console.error('deleteDocument error:', error);
        throw error;
    }
}
