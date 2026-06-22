import { memoryCache } from './db-services.js';
import { getProfile, updateProfile } from './auth.js';
import { showToast, showSpinner, hideSpinner, formatCurrency, getEmptyStateHTML } from './ui-utils.js';

export async function initDashboard() {
    console.log('initDashboard: starting');

    // Initial render from cache
    if (memoryCache.stats) {
        renderDashboard(memoryCache.stats);
    } else {
        showSpinner();
    }

    // Load and wire the single-owner office profile.
    await loadProfile();
    setupProfileForm();

    // Listen for real-time updates (remove existing first to avoid duplicates)
    window.removeEventListener('statsUpdated', window._onStatsUpdate);
    window._onStatsUpdate = (e) => {
        console.log('statsUpdated event received');
        const stats = e.detail;
        if (stats) {
            renderDashboard(stats);
            hideSpinner();
        }
    };
    window.addEventListener('statsUpdated', window._onStatsUpdate);

    // Search functionality for upcoming hearings
    const searchInput = document.getElementById('upcomingHearingsSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const stats = memoryCache.stats;
            if (!stats || !stats.upcomingHearings) return;

            const filtered = stats.upcomingHearings.filter(h =>
                (h.caseNo && h.caseNo.toLowerCase().includes(searchTerm)) ||
                (h.court && h.court.toLowerCase().includes(searchTerm)) ||
                (h.nextHearingDate && h.nextHearingDate.toLowerCase().includes(searchTerm))
            );

            renderUpcomingHearings(filtered);
        });
    }
}

export async function loadProfile() {
    try {
        const result = await getProfile();
        
        let profile = {};
        if (result.success && result.data) {
            profile = result.data;
        }

        // Check for empty state (if profile is empty, or missing core fields)
        const emptyStateBanner = document.getElementById('profileEmptyState');
        if (!profile.lawyerName || !profile.officeName) {
            if (emptyStateBanner) emptyStateBanner.classList.remove('d-none');
            if (emptyStateBanner) emptyStateBanner.classList.add('d-flex');
        } else {
            if (emptyStateBanner) emptyStateBanner.classList.add('d-none');
            if (emptyStateBanner) emptyStateBanner.classList.remove('d-flex');
        }

        // Map data to Hero Section (Fallback to empty strings if undefined to prevent crashes)
        const elements = {
            'heroLawyerName': profile.lawyerName || '',
            'heroLawyerTitle': profile.lawyerSpecialization || 'التخصص غير محدد',
            'heroOfficeName': profile.officeName || '',
            'heroBarNumber': profile.barNumber || '',
            
            // Map to old modal inputs if they exist
            'profileLawyerName': profile.lawyerName || '',
            'profileOfficeName': profile.officeName || '',
            'profileTaxNumber': profile.taxNumber || '',
            'profileBarNumber': profile.barNumber || '',
            'profileAddress': profile.address || '',
            'profileEmail': profile.email || ''
        };

        for (const [id, value] of Object.entries(elements)) {
            const el = document.getElementById(id);
            if (el) {
                if (value && value.trim() !== '') {
                    el.textContent = value;
                } else if (id.startsWith('hero')) {
                    el.textContent = 'غير محدد';
                } else {
                    el.textContent = '-';
                }
            }
        }

        const form = document.getElementById('editProfileForm');
        if (form) {
            form.lawyerName.value = profile.lawyerName || '';
            form.officeName.value = profile.officeName || '';
            if (form.lawyerSpecialization) {
                form.lawyerSpecialization.value = profile.lawyerSpecialization || '';
            }
            form.taxNumber.value = profile.taxNumber || '';
            form.barNumber.value = profile.barNumber || '';
            form.address.value = profile.address || '';
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        
        // Show empty state banner on error just in case
        const emptyStateBanner = document.getElementById('profileEmptyState');
        if (emptyStateBanner) {
            emptyStateBanner.classList.remove('d-none');
            emptyStateBanner.classList.add('d-flex');
        }
    }
}

function validateProfileData(data) {
    const lawyerName = String(data.lawyerName || '').trim();
    const officeName = String(data.officeName || '').trim();
    const lawyerSpecialization = String(data.lawyerSpecialization || '').trim();
    const taxNumber = String(data.taxNumber || '').trim();
    const barNumber = String(data.barNumber || '').trim();
    const address = String(data.address || '').trim();

    if (lawyerName.length < 2) throw new Error('اسم المحامي مطلوب ويجب ألا يقل عن حرفين');
    if (officeName.length < 2) throw new Error('اسم المكتب مطلوب ويجب ألا يقل عن حرفين');
    if (lawyerSpecialization.length > 150) throw new Error('تخصص المحامي يجب ألا يزيد عن 150 حرفا');
    if (taxNumber && !/^[\d\-\s]+$/.test(taxNumber)) throw new Error('الرقم الضريبي يجب أن يحتوي على أرقام فقط');
    if (barNumber && barNumber.length > 40) throw new Error('رقم الكارنية طويل جداً');

    return { lawyerName, officeName, lawyerSpecialization, taxNumber, barNumber, address };
}

function setupProfileForm() {
    const form = document.getElementById('editProfileForm');
    if (!form) return;

    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);

    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
            showSpinner();
            const profileData = validateProfileData(Object.fromEntries(formData.entries()));
            const result = await updateProfile(profileData);
            if (!result.success) throw new Error(result.error || 'تعذر تحديث بيانات المكتب');

            await loadProfile();

            const modalEl = document.getElementById('editProfileModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            showToast('success', 'تم تحديث بيانات المكتب بنجاح');
        } catch (error) {
            showToast('error', error.message || 'حدث خطأ أثناء تحديث بيانات المكتب', error);
        } finally {
            hideSpinner();
        }
    });
}

function renderDashboard(stats) {
    // Update summary cards
    const activeCasesEl = document.getElementById('activeCases');
    const totalPendingFeesEl = document.getElementById('totalPendingFees');
    const sessionsTodayEl = document.getElementById('upcomingSessionsToday');

    if (activeCasesEl) activeCasesEl.innerText = stats.activeCases || 0;
    if (totalPendingFeesEl) totalPendingFeesEl.innerText = formatCurrency(stats.totalPendingFees || 0);

    // Calculate Today's Sessions
    let todaySessionsCount = 0;
    if (stats.upcomingHearings && stats.upcomingHearings.length > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        todaySessionsCount = stats.upcomingHearings.filter(h => h.nextHearingDateIso === todayStr).length;
    }
    if (sessionsTodayEl) sessionsTodayEl.innerText = todaySessionsCount;

    // Update upcoming hearings table
    renderUpcomingHearings(stats.upcomingHearings);
}

function renderUpcomingHearings(hearingsData) {
    const tbody = document.getElementById('upcomingHearingsBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!hearingsData || hearingsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-5"><i class="fas fa-calendar-check fa-3x mb-3 d-block text-light"></i>لا توجد جلسات قادمة خلال الأسبوع</td></tr>';
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    hearingsData.forEach(h => {
        const isToday = h.nextHearingDateIso === todayStr;
        const statusBadge = isToday 
            ? '<span class="badge bg-danger rounded-pill px-3 py-2"><i class="fas fa-exclamation-circle me-1"></i> جلسة اليوم</span>' 
            : '<span class="badge bg-light text-dark border rounded-pill px-3 py-2">قادمة</span>';
            
        tbody.innerHTML += `
            <tr>
                <td class="ps-4 fw-bold text-primary">${h.caseNo}</td>
                <td><i class="fas fa-university text-muted me-2"></i>${h.court}</td>
                <td><span class="${isToday ? 'text-danger fw-bold' : ''}"><i class="far fa-calendar-alt me-2"></i>${h.nextHearingDate}</span></td>
                <td class="pe-4 text-end">${statusBadge}</td>
            </tr>
        `;
    });
}

// Global functions for buttons in dashboard.html
