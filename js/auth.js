import {
    apiRequest,
    clearAuthSession,
    readAccessToken,
    getStoredUser,
    setAuthSession,
    setStoredUser
} from './api-client.js';

export let currentUser = null;

function toLegacyUser(user) {
    if (!user) return null;

    return {
        ...user,
        uid: user.id,
        displayName: user.lawyerName || user.officeName || user.email,
        email: user.email
    };
}

async function loadCurrentUser() {
    if (!readAccessToken()) {
        currentUser = null;
        return null;
    }

    const user = await apiRequest('/api/me');
    setStoredUser(user);
    currentUser = toLegacyUser(user);
    return currentUser;
}

// Check Auth State
export function setupAuthListener(onLogin, onLogout) {
    let disposed = false;

    const checkAuth = async () => {
        try {
            const user = await loadCurrentUser();
            if (disposed) return;

            if (user) {
                onLogin(user, getStoredUser());
            } else {
                onLogout();
            }
        } catch (error) {
            console.error("API auth check failed:", error);
            clearAuthSession();
            currentUser = null;
            if (!disposed) onLogout(error);
        }
    };

    window.addEventListener('apiAuthChanged', checkAuth);
    checkAuth();

    return () => {
        disposed = true;
        window.removeEventListener('apiAuthChanged', checkAuth);
    };
}

// Login Function
export async function login(email, password, rememberMe = false) {
    try {
        const response = await apiRequest('/api/auth/login', {
            method: 'POST',
            body: { email, password, rememberMe }
        });

        setAuthSession(response.token, response.user, rememberMe);
        currentUser = toLegacyUser(response.user);
        window.dispatchEvent(new CustomEvent('apiAuthChanged'));
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Register Function
export async function register(email, password, profileData) {
    try {
        const response = await apiRequest('/api/auth/register', {
            method: 'POST',
            body: {
                email,
                password,
                lawyerName: profileData.lawyerName || '',
                officeName: profileData.officeName || '',
                lawyerSpecialization: profileData.lawyerSpecialization || '',
                taxNumber: profileData.taxNumber || '',
                barNumber: profileData.barNumber || '',
                address: profileData.address || ''
            }
        });

        setAuthSession(response.token, response.user);
        currentUser = toLegacyUser(response.user);
        window.dispatchEvent(new CustomEvent('apiAuthChanged'));
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Update Profile Function
export async function updateProfile(profileData) {
    try {
        const user = await apiRequest('/api/me/profile', {
            method: 'PUT',
            body: {
                lawyerName: profileData.lawyerName || '',
                officeName: profileData.officeName || '',
                lawyerSpecialization: profileData.lawyerSpecialization || '',
                taxNumber: profileData.taxNumber || '',
                barNumber: profileData.barNumber || '',
                address: profileData.address || ''
            }
        });

        setStoredUser(user);
        currentUser = toLegacyUser(user);
        return { success: true, data: user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Get Profile Function
export async function getProfile() {
    try {
        const user = await apiRequest('/api/me');
        setStoredUser(user);
        currentUser = toLegacyUser(user);
        return { success: true, data: user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Logout Function
export async function logout() {
    try {
        try {
            await apiRequest('/api/auth/logout', { method: 'POST' });
        } finally {
            sessionStorage.removeItem('lawyerSystem_clients');
            sessionStorage.removeItem('lawyerSystem_cases');
            clearAuthSession();
            currentUser = null;
            location.reload();
        }
    } catch (err) {
        console.error("Logout Error:", err);
    }
}
