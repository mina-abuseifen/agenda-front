import { setupAuthListener } from './auth.js';
import { clearAllListeners } from './db-services.js';
import { hideSpinner, showSpinner } from './ui-utils.js';

// Central App Initialization
export function initApp(onUserAuthenticated) {
    // Show spinner immediately on app start
    showSpinner();

    // Ensure body starts hidden to prevent flicker
    document.body.style.opacity = '0';
    document.body.style.visibility = 'hidden';
    document.body.style.transition = 'opacity 0.3s ease';

    // Set up global auth listener
    setupAuthListener(
        // On Login
        async (user, userData) => {
            try {
                // Execute page-specific logic
                if (onUserAuthenticated) {
                    await onUserAuthenticated(user, userData);
                }

                // Fade in the app
                document.body.style.visibility = 'visible';
                document.body.style.opacity = '1';
            } catch (error) {
                console.error('Error during app initialization:', error);
            } finally {
                hideSpinner();
            }
        },
        // On Logout
        () => {
            const isAtRoot = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
            const isOnLoginPage = window.location.pathname.endsWith('login.html');

            if (!isOnLoginPage) {
                // If we are at root (index.html), we need to go to 'landing.html'
                // If we are already in 'pages/', we just go to 'login.html' (or landing)
                const redirectPath = isAtRoot ? 'landing.html' : 'login.html';
                window.location.replace(redirectPath);
            } else {
                // If already on login page, just show the page
                document.body.style.visibility = 'visible';
                document.body.style.opacity = '1';
                hideSpinner();
            }
        }
    );

    // Global listener cleanup on page navigation/unload
    window.addEventListener('beforeunload', () => {
        console.log('App is unloading, clearing active data listeners...');
        clearAllListeners();
    });
}
