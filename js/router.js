/**
 * Simple SPA Router
 */

import { initDashboard } from './dashboard-ui.js';
import { initClientsUI } from './clients-ui.js';
import { initCasesUI } from './cases-ui.js';
import { initFinancesUI } from './finances-ui.js';
import { initSessionsUI } from './features/sessions/sessions-ui.js';
import { initCalendarUI } from './calendar-ui.js';
import { initArchiveUI } from './archive-ui.js';
import { initSearchUI } from './search-ui.js';

const routes = {
    'dashboard': {
        title: 'الرئيسية',
        file: 'pages/dashboard.html',
        init: initDashboard
    },
    'clients': {
        title: 'الموكلين',
        file: 'pages/clients.html',
        init: initClientsUI
    },
    'cases': {
        title: 'القضايا',
        file: 'pages/cases.html',
        init: initCasesUI
    },
    'finances': {
        title: 'إدارة الأموال',
        file: 'pages/finances.html',
        init: initFinancesUI
    },
    'sessions': {
        title: 'الأجندة اليومية',
        file: 'pages/sessions.html',
        init: initSessionsUI
    },
    'calendar': {
        title: 'تقويم الجلسات',
        file: 'pages/calendar.html',
        init: initCalendarUI
    },
    'archive': {
        title: 'أرشيف المكتب',
        file: 'pages/archive.html',
        init: initArchiveUI
    },
    'search': {
        title: 'البحث الشامل',
        file: 'pages/search.html',
        init: initSearchUI
    }
};

export function initRouter() {
    console.log('Router: Initializing');

    // Handle initial route based on URL hash or default to dashboard
    const currentHash = window.location.hash.replace('#/', '');
    const initialRoute = routes[currentHash] ? currentHash : 'dashboard';

    navigateTo(initialRoute, false);

    // Listen for back/forward navigation
    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.path) {
            navigateTo(e.state.path, false);
        } else {
            // Check hash as fallback
            const hash = window.location.hash.replace('#/', '');
            if (routes[hash]) {
                navigateTo(hash, false);
            }
        }
    });

    // Intercept sidebar clicks
    document.querySelectorAll('.nav-item-spa').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const path = item.getAttribute('data-path');
            if (path) {
                navigateTo(path);
            }
        });
    });
}

export async function navigateTo(path, updateHistory = true) {
    const route = routes[path] || routes['dashboard'];
    console.log(`Current View: ${path}`);

    const contentArea = document.getElementById('content-area');
    if (!contentArea) {
        console.error('Router: Content area element not found!');
        return;
    }

    try {
        // 1. Cleanup before navigation
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(b => b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';

        // Update active state in sidebar
        document.querySelectorAll('.nav-item-spa').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-path') === path) {
                item.classList.add('active');
            }
        });

        // Update Title and Section Header
        document.title = `${route.title} | نظام إدارة المحاماة`;
        const sectionTitleEl = document.getElementById('sectionTitle');
        if (sectionTitleEl) sectionTitleEl.innerText = route.title;

        // Update History
        if (updateHistory) {
            window.history.pushState({ path }, route.title, `#/${path}`);
        }

        // 2. Clear content area strictly and show spinner
        contentArea.style.opacity = '0';
        contentArea.innerHTML = `
            <div class="d-flex justify-content-center align-items-center p-5" style="min-height: 200px;">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>
        `;

        // 3. Fetch and inject new content
        const response = await fetch(route.file);
        if (!response.ok) throw new Error(`Failed to fetch ${route.file}`);
        const html = await response.text();

        // Strictly replace content
        contentArea.innerHTML = html;

        // Initialize the module
        if (route.init) {
            await route.init();
        }

        // Fade back in
        setTimeout(() => {
            contentArea.style.opacity = '1';
        }, 50);

        // Sidebar remains persistent as per user request

    } catch (error) {
        console.error('Router: Navigation error:', error);
        contentArea.innerHTML = '<div class="alert alert-danger">حدث خطأ أثناء تحميل الصفحة</div>';
        contentArea.style.opacity = '1';
    }
}
