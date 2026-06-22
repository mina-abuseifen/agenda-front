import { memoryCache } from './db-services.js';
import { formatCurrency } from './ui-utils.js';

let activeCategory = 'all'; // 'all', 'clients', 'cases', 'sessions', 'archives'
let searchQuery = '';

export async function initSearchUI() {
    console.log('initSearchUI: starting');

    const searchInput = document.getElementById('globalSearchInput');
    if (searchInput) {
        searchInput.value = searchQuery;
        searchInput.focus();
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            performSearch();
        });
    }

    // Set up tabs
    const tabs = document.querySelectorAll('#searchCategoryTabs .nav-link');
    tabs.forEach(tab => {
        tab.onclick = (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            activeCategory = e.target.getAttribute('data-category');
            performSearch();
        };
    });

    performSearch();
}

function performSearch() {
    const container = document.getElementById('searchResultsContainer');
    if (!container) return;

    if (!searchQuery) {
        container.innerHTML = `
            <div class="col-12 text-center text-muted py-5">
                <i class="fas fa-search fa-3x mb-3 opacity-25"></i>
                <h5>ابدأ كتابة الكلمات للبحث</h5>
                <p class="small">اكتب أي كلمة أو رقم للبحث الفوري في كافة البيانات</p>
            </div>
        `;
        updateTabsCounters(0, 0, 0, 0, 0);
        return;
    }

    const clients = memoryCache.clients || [];
    const allCases = memoryCache.cases || [];
    const sessions = memoryCache.sessions || [];

    // Separate active cases and archived cases
    const activeCases = allCases.filter(c => c.status !== 'Archived' && c.status !== 'مؤرشفة');
    const archivedCases = allCases.filter(c => c.status === 'Archived' || c.status === 'مؤرشفة');

    // 1. Search Clients
    const matchedClients = clients.filter(c => 
        (c.name && c.name.toLowerCase().includes(searchQuery)) ||
        (c.mobile && c.mobile.includes(searchQuery)) ||
        (c.nationalId && c.nationalId.includes(searchQuery)) ||
        (c.powerOfAttorneyNo && c.powerOfAttorneyNo.toLowerCase().includes(searchQuery)) ||
        (c.address && c.address.toLowerCase().includes(searchQuery))
    );

    // 2. Search Active Cases
    const matchedCases = activeCases.filter(c => 
        (c.caseNo && c.caseNo.toLowerCase().includes(searchQuery)) ||
        (c.clientName && c.clientName.toLowerCase().includes(searchQuery)) ||
        (c.defendant && c.defendant.toLowerCase().includes(searchQuery)) ||
        (c.plaintiff && c.plaintiff.toLowerCase().includes(searchQuery)) ||
        (c.court && c.court.toLowerCase().includes(searchQuery)) ||
        (c.caseType && c.caseType.toLowerCase().includes(searchQuery))
    );

    // 3. Search Sessions
    const matchedSessions = sessions.filter(s => 
        (s.caseNo && s.caseNo.toLowerCase().includes(searchQuery)) ||
        (s.clientName && s.clientName.toLowerCase().includes(searchQuery)) ||
        (s.court && s.court.toLowerCase().includes(searchQuery)) ||
        (s.rollNumber && s.rollNumber.toLowerCase().includes(searchQuery)) ||
        (s.decision && s.decision.toLowerCase().includes(searchQuery)) ||
        (s.notes && s.notes.toLowerCase().includes(searchQuery))
    );

    // 4. Search Archived Cases
    const matchedArchives = archivedCases.filter(c => 
        (c.caseNo && c.caseNo.toLowerCase().includes(searchQuery)) ||
        (c.archiveNo && c.archiveNo.toLowerCase().includes(searchQuery)) ||
        (c.clientName && c.clientName.toLowerCase().includes(searchQuery)) ||
        (c.defendant && c.defendant.toLowerCase().includes(searchQuery)) ||
        (c.court && c.court.toLowerCase().includes(searchQuery))
    );

    const totalAll = matchedClients.length + matchedCases.length + matchedSessions.length + matchedArchives.length;
    updateTabsCounters(totalAll, matchedClients.length, matchedCases.length, matchedSessions.length, matchedArchives.length);

    container.innerHTML = '';

    if (totalAll === 0) {
        container.innerHTML = `
            <div class="col-12 text-center text-muted py-5">
                <i class="fas fa-search-minus fa-3x mb-3 opacity-25"></i>
                <h5>لا توجد نتائج مطابقة لبحثك</h5>
                <p class="small">تأكد من كتابة الكلمات بشكل صحيح أو جرب كلمات بحث أخرى</p>
            </div>
        `;
        return;
    }

    // Render results based on active tab
    if (activeCategory === 'all' || activeCategory === 'clients') {
        if (matchedClients.length > 0) renderClientsResults(matchedClients, container);
    }
    if (activeCategory === 'all' || activeCategory === 'cases') {
        if (matchedCases.length > 0) renderCasesResults(matchedCases, container);
    }
    if (activeCategory === 'all' || activeCategory === 'sessions') {
        if (matchedSessions.length > 0) renderSessionsResults(matchedSessions, container);
    }
    if (activeCategory === 'all' || activeCategory === 'archives') {
        if (matchedArchives.length > 0) renderArchivesResults(matchedArchives, container);
    }
}

function updateTabsCounters(all, clients, cases, sessions, archives) {
    const cAll = document.getElementById('countAll');
    const cClients = document.getElementById('countClients');
    const cCases = document.getElementById('countCases');
    const cSessions = document.getElementById('countSessions');
    const cArchives = document.getElementById('countArchives');

    if (cAll) cAll.innerText = all;
    if (cClients) cClients.innerText = clients;
    if (cCases) cCases.innerText = cases;
    if (cSessions) cSessions.innerText = sessions;
    if (cArchives) cArchives.innerText = archives;
}

function renderClientsResults(items, container) {
    const section = document.createElement('div');
    section.className = 'col-12 mb-4';
    section.innerHTML = `<h5 class="fw-bold text-dark border-bottom pb-2 mb-3"><i class="fas fa-users text-primary me-2"></i> الموكلين المطابقين (${items.length})</h5>`;
    
    const row = document.createElement('div');
    row.className = 'row g-3';

    items.forEach(c => {
        row.innerHTML += `
            <div class="col-md-6 col-lg-4">
                <div class="card shadow-sm border h-100">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="fw-bold mb-0 text-primary">${c.name}</h6>
                            <span class="badge bg-light text-dark border" style="font-size:0.65rem;">توكيل رقم: ${c.powerOfAttorneyNo || '---'}</span>
                        </div>
                        <div class="small text-muted mb-1"><i class="fas fa-phone me-1"></i> الهاتف: ${c.mobile || '---'}</div>
                        <div class="small text-muted mb-1"><i class="fas fa-id-card me-1"></i> الرقم القومي: ${c.nationalId || '---'}</div>
                        <div class="small text-muted mb-3"><i class="fas fa-map-marker-alt me-1"></i> العنوان: ${c.address || '---'}</div>
                        <div class="text-end">
                            <a href="#/clients" class="btn btn-sm btn-outline-primary"><i class="fas fa-external-link-alt me-1"></i> عرض الموكلين</a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    section.appendChild(row);
    container.appendChild(section);
}

function renderCasesResults(items, container) {
    const section = document.createElement('div');
    section.className = 'col-12 mb-4';
    section.innerHTML = `<h5 class="fw-bold text-dark border-bottom pb-2 mb-3"><i class="fas fa-gavel text-warning me-2"></i> القضايا النشطة المطابقة (${items.length})</h5>`;
    
    const row = document.createElement('div');
    row.className = 'row g-3';

    items.forEach(c => {
        let statusColor = 'primary';
        if (c.status === 'Closed' || c.status === 'مغلقة') statusColor = 'dark';
        
        row.innerHTML += `
            <div class="col-md-6 col-lg-4">
                <div class="card shadow-sm border h-100">
                    <div class="card-body p-3 d-flex flex-column justify-content-between">
                        <div>
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <h6 class="fw-bold mb-0 text-dark">${c.caseNo}</h6>
                                <span class="badge bg-${statusColor}">${c.status || 'نشطة'}</span>
                            </div>
                            <div class="small text-muted mb-1"><i class="fas fa-user-tie me-1"></i> الموكل: <strong>${c.clientName || '---'}</strong></div>
                            <div class="small text-muted mb-1"><i class="fas fa-user-times me-1"></i> الخصم: <strong>${c.defendant || '---'}</strong></div>
                            <div class="small text-muted mb-1"><i class="fas fa-university me-1"></i> المحكمة: ${c.court || '---'}</div>
                            <div class="small text-muted mb-3"><i class="fas fa-tag me-1"></i> نوع القضية: ${c.caseType || '---'}</div>
                        </div>
                        <div class="d-flex justify-content-between align-items-center mt-2 border-top pt-2">
                            <span class="small fw-bold text-danger">${formatCurrency(c.remainingBalance)} متبقي</span>
                            <button class="btn btn-sm btn-primary" onclick="window.viewCase('${c.id}')"><i class="fas fa-eye me-1"></i> عرض التفاصيل</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    section.appendChild(row);
    container.appendChild(section);
}

function renderSessionsResults(items, container) {
    const section = document.createElement('div');
    section.className = 'col-12 mb-4';
    section.innerHTML = `<h5 class="fw-bold text-dark border-bottom pb-2 mb-3"><i class="fas fa-calendar-alt text-success me-2"></i> الجلسات المطابقة (${items.length})</h5>`;
    
    const row = document.createElement('div');
    row.className = 'row g-3';

    items.forEach(s => {
        let badgeColor = 'warning';
        if (s.status === 'Attended') badgeColor = 'success';
        if (s.status === 'Postponed') badgeColor = 'danger';

        const sDate = s.sessionDate?.toDate ? s.sessionDate.toDate() : new Date(s.sessionDate);
        const dateStr = !isNaN(sDate.getTime()) ? sDate.toLocaleDateString('ar-EG') : '---';

        row.innerHTML += `
            <div class="col-md-6 col-lg-4">
                <div class="card shadow-sm border h-100">
                    <div class="card-body p-3 d-flex flex-column justify-content-between">
                        <div>
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <span class="fw-bold text-primary small">${s.caseNo}</span>
                                <span class="badge bg-${badgeColor}-subtle text-dark border border-${badgeColor}">${s.status}</span>
                            </div>
                            <div class="small text-muted mb-1"><i class="far fa-calendar-alt me-1"></i> التاريخ: ${dateStr}</div>
                            <div class="small text-muted mb-1"><i class="fas fa-user-circle me-1"></i> العميل: ${s.clientName || '---'}</div>
                            <div class="small text-muted mb-1"><i class="fas fa-university me-1"></i> المحكمة: ${s.court || '---'} (${s.circuit || '---'})</div>
                            ${s.decision ? `<div class="bg-light p-2 rounded mb-2 small text-muted text-truncate" title="${s.decision}">${s.decision}</div>` : ''}
                        </div>
                        <div class="text-end border-top pt-2">
                            <button class="btn btn-sm btn-outline-primary" onclick="window.viewCase('${s.caseId}')"><i class="fas fa-arrow-left me-1"></i> عرض ملف القضية</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    section.appendChild(row);
    container.appendChild(section);
}

function renderArchivesResults(items, container) {
    const section = document.createElement('div');
    section.className = 'col-12 mb-4';
    section.innerHTML = `<h5 class="fw-bold text-secondary border-bottom pb-2 mb-3"><i class="fas fa-archive me-2"></i> القضايا المؤرشفة المطابقة (${items.length})</h5>`;
    
    const row = document.createElement('div');
    row.className = 'row g-3';

    items.forEach(c => {
        row.innerHTML += `
            <div class="col-md-6 col-lg-4">
                <div class="card shadow-sm border h-100 border-secondary-subtle">
                    <div class="card-body p-3 d-flex flex-column justify-content-between">
                        <div>
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <h6 class="fw-bold mb-0 text-muted">${c.caseNo}</h6>
                                <span class="badge bg-secondary">أرشيف: ${c.archiveNo || '---'}</span>
                            </div>
                            <div class="small text-muted mb-1"><i class="fas fa-user-shield me-1"></i> الموكل: ${c.clientName || '---'}</div>
                            <div class="small text-muted mb-1"><i class="fas fa-user-times me-1"></i> الخصم: ${c.defendant || '---'}</div>
                            <div class="small text-muted mb-3"><i class="fas fa-university me-1"></i> المحكمة: ${c.court || '---'}</div>
                        </div>
                        <div class="d-flex justify-content-between align-items-center border-top pt-2 mt-2">
                            <button class="btn btn-sm btn-outline-success" onclick="window.restoreCaseUI('${c.id}')"><i class="fas fa-undo me-1"></i> استعادة</button>
                            <button class="btn btn-sm btn-outline-secondary" onclick="window.viewCase('${c.id}')"><i class="fas fa-eye me-1"></i> تفاصيل</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    section.appendChild(row);
    container.appendChild(section);
}
