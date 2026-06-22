const TOKEN_KEY = 'lawyerSystem_apiToken';
const USER_KEY = 'lawyerSystem_apiUser';

function getApiBaseUrl() {
    const configuredUrl = window.__ENV__?.NEXT_PUBLIC_API_URL || window.__LAWYER_API_BASE_URL || '';
    return configuredUrl.replace(/\/$/, '');
}

function selectTokenStore(preferLocal = false) {
    return preferLocal ? localStorage : sessionStorage;
}

export function readAccessToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function setAuthSession(token, user, remember = false) {
    clearAuthSession();
    const storage = selectTokenStore(remember);
    storage.setItem(TOKEN_KEY, token);
    storage.setItem(USER_KEY, JSON.stringify(user || null));
}

export function getStoredUser() {
    const rawUser = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
    if (!rawUser) return null;

    try {
        return JSON.parse(rawUser);
    } catch {
        return null;
    }
}

export function setStoredUser(user) {
    const storage = sessionStorage.getItem(TOKEN_KEY) ? sessionStorage : localStorage;
    storage.setItem(USER_KEY, JSON.stringify(user || null));
}

export function clearAuthSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
    constructor(message, status, code, details = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

export async function apiRequest(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = readAccessToken();

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const hasBody = options.body !== undefined && options.body !== null;
    if (hasBody && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${getApiBaseUrl()}${path}`, {
        ...options,
        headers,
        body: hasBody && !(options.body instanceof FormData) && typeof options.body !== 'string'
            ? JSON.stringify(options.body)
            : options.body
    });

    if (response.status === 401) {
        clearAuthSession();
    }

    if (!response.ok) {
        let problem = null;
        try {
            problem = await response.json();
        } catch {
            // Keep the generic fallback below.
        }

        throw new ApiError(
            problem?.detail || problem?.title || `API request failed with status ${response.status}`,
            response.status,
            problem?.code || problem?.title || 'api_error',
            problem
        );
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}
