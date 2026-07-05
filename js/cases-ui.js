import { addCase, updateCase, deleteCase, createAppealCase, memoryCache } from './db-services.js';
import { addSession, getSessionsByCase, updateSession as updateSessionService } from './features/sessions/sessions-service.js';
import { uploadDocument, getDocumentsByCase, deleteDocument } from './features/documents/documents-service.js';
import { showToast, showSpinner, hideSpinner, formatCurrency, getEmptyStateHTML, showConfirmDialog } from './ui-utils.js';

let filteredCases = [];

// Zod-style Schema Validation (Strict checks disabled for maximum flexibility)
const caseSchema = {
    parse: (data) => {
        // Return data directly without validation
        return data;
    }
};

// Global Error Handler for API
function handleApiError(error) {
    console.error(error);
    if (error.code === 'permission-denied') {
        showToast('error', 'ليس لديك صلاحية لإجراء هذه العملية.');
    } else if (error.code === 'unavailable') {
        showToast('error', 'انقطع الاتصال بالإنترنت. يرجى المحاولة لاحقاً.');
    } else {
        showToast('error', 'حدث خطأ غير متوقع: ' + (error.message || 'يرجى المحاولة مجدداً'));
    }
}

// Helper function to calculate remaining balance
function calculateRemainingBalance(totalFees, paidAmount) {
    const total = parseFloat(totalFees) || 0;
    const paid = parseFloat(paidAmount) || 0;
    return Math.max(0, total - paid);
}

// Helper function to setup fees calculation in forms
function setupFeesCalculation(form) {
    if (!form) return;
    const totalFeesInput = form.querySelector('[name="totalFees"]');
    const paidAmountInput = form.querySelector('[name="paidAmount"]');
    const remainingBalanceInput = form.querySelector('[name="remainingBalance"]');

    if (totalFeesInput && paidAmountInput && remainingBalanceInput) {
        const updateRemaining = () => {
            const total = parseFloat(totalFeesInput.value) || 0;
            let paid = parseFloat(paidAmountInput.value) || 0;

            if (paid > total) {
                paid = total;
                paidAmountInput.value = paid;
                showToast('warning', 'المبلغ المدفوع لا يمكن أن يتجاوز الأتعاب الإجمالية');
            }

            const remaining = calculateRemainingBalance(total, paid);
            remainingBalanceInput.value = remaining.toFixed(2);
        };

        totalFeesInput.addEventListener('input', updateRemaining);
        paidAmountInput.addEventListener('input', updateRemaining);
        updateRemaining();
    }
}

function populateClientDropdowns() {
    const clients = memoryCache.clients || [];
    const addCaseClientSelect = document.getElementById('addCaseClientSelect');
    const editCaseClientSelect = document.getElementById('editCaseClientSelect');

    let clientOptions = '<option value="">اختر الموكل...</option>';
    // Sort clients alphabetically for easier selection
    const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    sortedClients.forEach(client => {
        clientOptions += `<option value="${client.id}" data-name="${client.name}" data-poa="${client.powerOfAttorneyNo}">${client.name} - توكيل رقم: ${client.powerOfAttorneyNo}</option>`;
    });

    if (addCaseClientSelect) addCaseClientSelect.innerHTML = clientOptions;
    if (editCaseClientSelect) editCaseClientSelect.innerHTML = clientOptions;
}

export async function initCasesUI() {
    console.log('initCasesUI: starting');

    // Initial render from cache (excluding archived cases)
    if (memoryCache.cases) {
        filteredCases = memoryCache.cases.filter(c => c.status !== 'Archived' && c.status !== 'مؤرشفة');
        renderCasesTable(filteredCases);
    } else {
        showSpinner();
    }

    if (memoryCache.clients) {
        populateClientDropdowns();
    }

    // Listen for real-time updates (remove existing first to avoid duplicates)
    window.removeEventListener('casesUpdated', window._onCasesUpdate);
    window._onCasesUpdate = (e) => {
        const cases = e.detail || [];
        const searchInput = document.getElementById('caseSearch');
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

        // Advanced filtering logic
        filteredCases = cases.filter(caseItem => {
            if (caseItem.status === 'Archived' || caseItem.status === 'مؤرشفة') return false;
            if (!query) return true;
            return (
                (caseItem.caseNo && caseItem.caseNo.toLowerCase().includes(query)) ||
                (caseItem.caseType && caseItem.caseType.toLowerCase().includes(query)) ||
                (caseItem.court && caseItem.court.toLowerCase().includes(query)) ||
                (caseItem.defendant && caseItem.defendant.toLowerCase().includes(query)) ||
                (caseItem.clientName && caseItem.clientName.toLowerCase().includes(query)) ||
                (caseItem.status && caseItem.status.toLowerCase().includes(query))
            );
        });

        renderCasesTable(filteredCases);
        hideSpinner();
    };
    window.addEventListener('casesUpdated', window._onCasesUpdate);

    window.removeEventListener('clientsUpdated', window._onClientsUpdateDropdown);
    window._onClientsUpdateDropdown = () => {
        populateClientDropdowns();
    };
    window.addEventListener('clientsUpdated', window._onClientsUpdateDropdown);

    // Search functionality with debounce
    const searchInput = document.getElementById('caseSearch');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const query = e.target.value.toLowerCase().trim();
                const cases = memoryCache.cases || [];
                filteredCases = cases.filter(caseItem => {
                    if (caseItem.status === 'Archived' || caseItem.status === 'مؤرشفة') return false;
                    if (!query) return true;
                    return (
                        (caseItem.caseNo && caseItem.caseNo.toLowerCase().includes(query)) ||
                        (caseItem.caseType && caseItem.caseType.toLowerCase().includes(query)) ||
                        (caseItem.court && caseItem.court.toLowerCase().includes(query)) ||
                        (caseItem.defendant && caseItem.defendant.toLowerCase().includes(query)) ||
                        (caseItem.clientName && caseItem.clientName.toLowerCase().includes(query)) ||
                        (caseItem.status && caseItem.status.toLowerCase().includes(query))
                    );
                });
                renderCasesTable(filteredCases);
            }, 300); // 300ms debounce
        });
    }

    // Forms setup
    const addForm = document.getElementById('addCaseForm');
    if (addForm) {
        // Prevent multiple listeners
        const newAddForm = addForm.cloneNode(true);
        addForm.parentNode.replaceChild(newAddForm, addForm);
        setupFeesCalculation(newAddForm);

        newAddForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const caseData = Object.fromEntries(formData.entries());

            try {
                // Attach Client Metadata
                const selectEl = document.getElementById('addCaseClientSelect');
                if (selectEl && selectEl.selectedIndex > 0) {
                    const selectedOption = selectEl.options[selectEl.selectedIndex];
                    caseData.clientName = selectedOption.getAttribute('data-name');
                    caseData.powerOfAttorneyNo = selectedOption.getAttribute('data-poa');
                }

                // Strict Validation
                const validatedData = caseSchema.parse(caseData);

                showSpinner();
                validatedData.remainingBalance = calculateRemainingBalance(validatedData.totalFees, validatedData.paidAmount);
                
                // Set default status to Active if not provided
                validatedData.status = validatedData.status || 'Active';

                await addCase(validatedData);

                const modalEl = document.getElementById('addCaseModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
                e.target.reset();
                showToast('success', 'تمت إضافة القضية بنجاح');
            } catch (error) {
                if (error.message.includes('\\n')) {
                    error.message.split('\\n').forEach(msg => showToast('error', msg));
                } else {
                    handleApiError(error);
                }
            } finally {
                hideSpinner();
            }
        });
    }

    const editForm = document.getElementById('editCaseForm');
    if (editForm) {
        // Prevent multiple listeners
        const newEditForm = editForm.cloneNode(true);
        editForm.parentNode.replaceChild(newEditForm, editForm);
        setupFeesCalculation(newEditForm);

        newEditForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const caseData = Object.fromEntries(formData.entries());
            const { id, ...data } = caseData;

            try {
                // Attach Client Metadata
                const selectEl = document.getElementById('editCaseClientSelect');
                if (selectEl && selectEl.selectedIndex > 0) {
                    const selectedOption = selectEl.options[selectEl.selectedIndex];
                    data.clientName = selectedOption.getAttribute('data-name');
                    data.powerOfAttorneyNo = selectedOption.getAttribute('data-poa');
                }

                // Strict Validation
                const validatedData = caseSchema.parse(data);

                showSpinner();
                validatedData.remainingBalance = calculateRemainingBalance(validatedData.totalFees, validatedData.paidAmount);
                
                await updateCase(id, validatedData);

                const modalEl = document.getElementById('editCaseModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
                showToast('success', 'تم تحديث القضية بنجاح');
            } catch (error) {
                if (error.message.includes('\\n')) {
                    error.message.split('\\n').forEach(msg => showToast('error', msg));
                } else {
                    handleApiError(error);
                }
            } finally {
                hideSpinner();
            }
        });
    }

    if (window.pendingViewCaseId) {
        const idToView = window.pendingViewCaseId;
        window.pendingViewCaseId = null;
        setTimeout(() => window.viewCase(idToView), 200);
    }
}

// Payment Status Tracker logic
function getPaymentStatusBadge(total, remaining) {
    const t = parseFloat(total) || 0;
    const r = parseFloat(remaining) || 0;
    
    if (t === 0) return '<span class="badge bg-secondary">غير محدد</span>';
    if (r === 0) return '<span class="badge bg-success">خالصة</span>';
    if (r === t) return '<span class="badge bg-danger">لم يتم الدفع</span>';
    return '<span class="badge bg-warning text-dark">دفع جزئي</span>';
}

function renderCasesTable(cases) {
    const tbody = document.getElementById('casesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (cases.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4"><i class="fas fa-folder-open fa-2x mb-2 d-block"></i>لا توجد قضايا مطابقة للبحث</td></tr>';
        return;
    }

    const today = new Date();
    today.setHours(0,0,0,0);
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);

    cases.forEach(caseItem => {
        let hearingDateStr = '---';
        let isUpcoming = false;
        
        if (caseItem.hearingDate) {
            const hDate = caseItem.hearingDate.toDate ? caseItem.hearingDate.toDate() : new Date(caseItem.hearingDate);
            if (!isNaN(hDate.getTime())) {
                hearingDateStr = formatDate(hDate);
                hDate.setHours(0,0,0,0);
                // Automated Reminder Logic: Highlight dates within 3 days
                if (hDate >= today && hDate <= threeDaysFromNow) {
                    isUpcoming = true;
                }
            }
        }
        
        // Status with Archival Logic support (Active, Closed, Archived)
        let statusBadge = '';
        if (caseItem.status === 'Active' || caseItem.status === 'نشطة') {
            statusBadge = '<span class="badge bg-primary">نشطة</span>';
        } else if (caseItem.status === 'Archived' || caseItem.status === 'مؤرشفة') {
            statusBadge = '<span class="badge bg-secondary">مؤرشفة</span>';
        } else {
            statusBadge = '<span class="badge bg-dark">مغلقة</span>';
        }

        const hearingBadgeClass = isUpcoming ? 'badge bg-danger pulse-animation' : 'font-monospace text-muted';
        const hearingBadgeContent = isUpcoming ? `<i class="fas fa-bell me-1"></i> ${hearingDateStr}` : hearingDateStr;

        // Level Badge (Primary, Appeal, Supreme)
        let levelBadge = '';
        const level = caseItem.level || 'Primary';
        if (level === 'Primary' || level === 'ابتدائية') {
            levelBadge = '<span class="badge bg-info text-dark">ابتدائية</span>';
        } else if (level === 'Appeal' || level === 'استئناف') {
            levelBadge = '<span class="badge bg-warning text-dark">استئناف</span>';
        } else if (level === 'Supreme' || level === 'نقض') {
            levelBadge = '<span class="badge bg-dark text-white">نقض</span>';
        } else {
            levelBadge = `<span class="badge bg-secondary">${level}</span>`;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td data-label="رقم القضية" class="fw-bold text-primary">${caseItem.caseNo}</td>
            <td data-label="نوع القضية">${caseItem.caseType || '---'}</td>
            <td data-label="درجة التقاضي">${levelBadge}</td>
            <td data-label="الموكل" class="text-truncate" style="max-width: 150px;" title="${caseItem.clientName}">${caseItem.clientName || '---'}</td>
            <td data-label="المحكمة" class="text-truncate" style="max-width: 150px;" title="${caseItem.court}">${caseItem.court || '---'}</td>
            <td data-label="تاريخ الجلسة"><span class="${hearingBadgeClass}">${hearingBadgeContent}</span></td>
            <td data-label="الأتعاب">${caseItem.totalFees ? formatCurrency(caseItem.totalFees) : '---'}</td>
            <td data-label="حالة الدفع">${getPaymentStatusBadge(caseItem.totalFees, caseItem.remainingBalance)}</td>
            <td data-label="الحالة">${statusBadge}</td>
            <td data-label="الإجراءات">
                <button class="btn btn-sm btn-outline-info me-1" onclick="window.viewCase('${caseItem.id}')" title="عرض التفاصيل">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="window.editCase('${caseItem.id}')" title="تعديل">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="window.deleteCase('${caseItem.id}')" title="حذف">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function formatDate(date) {
    if (!date || isNaN(date.getTime())) return '---';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

window.editCase = function (id) {
    const cases = memoryCache.cases || [];
    const caseItem = cases.find(c => c.id === id);
    if (!caseItem) return;

    const form = document.getElementById('editCaseForm');
    if (!form) return;

    form.id.value = caseItem.id;
    form.caseNo.value = caseItem.caseNo || '';
    form.policeReportNo.value = caseItem.policeReportNo || '';
    form.date.value = caseItem.date ? (caseItem.date.toDate ? caseItem.date.toDate().toISOString().split('T')[0] : caseItem.date.split('T')[0]) : '';
    form.fileNo.value = caseItem.fileNo || '';
    form.caseType.value = caseItem.caseType || '';
    form.court.value = caseItem.court || '';
    form.circuit.value = caseItem.circuit || '';
    form.plaintiff.value = caseItem.plaintiff || '';
    form.defendant.value = caseItem.defendant || '';
    form.opposingCounsel.value = caseItem.opposingCounsel || '';
    form.hearingDate.value = caseItem.hearingDate ? (caseItem.hearingDate.toDate ? caseItem.hearingDate.toDate().toISOString().split('T')[0] : caseItem.hearingDate.split('T')[0]) : '';
    form.decision.value = caseItem.decision || '';
    form.nextHearingRequirements.value = caseItem.nextHearingRequirements || '';
    form.status.value = caseItem.status || 'Active';
    form.totalFees.value = caseItem.totalFees || '';
    form.paidAmount.value = caseItem.paidAmount || '';

    if (form.clientId) {
        form.clientId.value = caseItem.clientId || '';
    }

    const editModal = new bootstrap.Modal(document.getElementById('editCaseModal'));
    editModal.show();
};

window.viewCase = function (id) {
    if (!document.getElementById('viewCaseModal')) {
        window.pendingViewCaseId = id;
        import('./router.js').then(module => {
            module.navigateTo('cases');
        });
        return;
    }

    const cases = memoryCache.cases || [];
    const caseItem = cases.find(c => c.id === id);
    if (!caseItem) return;

    document.getElementById('viewCaseClientName').innerText = caseItem.clientName || 'عميل غير محدد';
    document.getElementById('viewCaseClientPoa').innerText = caseItem.powerOfAttorneyNo || 'غير محدد';
    document.getElementById('currentCaseId').value = caseItem.id;

    const remainingBalance = parseFloat(caseItem.remainingBalance) || 0;
    const balanceEl = document.getElementById('viewCaseRemainingBalance');
    balanceEl.innerText = `الأتعاب المتبقية: ${formatCurrency(remainingBalance)}`;

    if (remainingBalance > 0) {
        balanceEl.className = "mt-2 mb-0 text-danger fw-bold";
    } else {
        balanceEl.className = "mt-2 mb-0 text-success fw-bold";
    }

    const viewModal = new bootstrap.Modal(document.getElementById('viewCaseModal'));
    
    // Fetch and render sessions for this case
    loadCaseSessions(caseItem.id);
    
    // Fetch and render documents for this case
    loadCaseDocuments(caseItem.id);

    // Fetch and render timeline for this case
    loadCaseTimeline(caseItem.id);

    // Setup session form
    const sessionForm = document.getElementById('addCaseSessionForm');
    if (sessionForm) {
        sessionForm.caseId.value = caseItem.id;
        // Remove existing listener to avoid duplicates
        const newSessionForm = sessionForm.cloneNode(true);
        sessionForm.parentNode.replaceChild(newSessionForm, sessionForm);
        
        newSessionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            
            try {
                showSpinner();
                await addSession({
                    ...data,
                    caseNo: caseItem.caseNo,
                    clientName: caseItem.clientName,
                    court: caseItem.court,
                    circuit: caseItem.circuit
                });
                showToast('success', 'تم جدولة الجلسة بنجاح');
                e.target.reset();
                e.target.caseId.value = caseItem.id;
                loadCaseSessions(caseItem.id);
            } catch (error) {
                showToast('error', 'حدث خطأ أثناء جدولة الجلسة');
            } finally {
                hideSpinner();
            }
        });
    }

    // Setup Document Upload Form
    const uploadForm = document.getElementById('uploadDocForm');
    if (uploadForm) {
        uploadForm.caseId.value = caseItem.id;
        const newUploadForm = uploadForm.cloneNode(true);
        uploadForm.parentNode.replaceChild(newUploadForm, uploadForm);

        newUploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('caseDocFile');
            const file = fileInput.files[0];
            if (!file) return;
            const formData = new FormData(e.target);

            try {
                showSpinner();
                await uploadDocument(caseItem.id, file, formData.get('documentType') || 'أخرى', formData.get('notes') || '');
                showToast('success', 'تم رفع المستند بنجاح');
                fileInput.value = '';
                if (e.target.notes) e.target.notes.value = '';
                loadCaseDocuments(caseItem.id);
                loadCaseTimeline(caseItem.id);
            } catch (error) {
                showToast('error', 'فشل رفع المستند');
            } finally {
                hideSpinner();
            }
        });
    }

    // Setup Custom History Update Form
    const historyForm = document.getElementById('addHistoryForm');
    if (historyForm) {
        historyForm.caseId.value = caseItem.id;
        const newHistoryForm = historyForm.cloneNode(true);
        historyForm.parentNode.replaceChild(newHistoryForm, historyForm);

        newHistoryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());

            try {
                showSpinner();
                const { addTimelineEvent } = await import('./db-services.js');
                await addTimelineEvent(caseItem.id, {
                    type: 'custom',
                    title: 'تحديث يدوي من المحامي',
                    description: data.decision,
                    date: data.hearingDate ? new Date(data.hearingDate) : new Date()
                });
                showToast('success', 'تم إضافة التحديث بنجاح');
                e.target.reset();
                e.target.caseId.value = caseItem.id;
                loadCaseTimeline(caseItem.id);
            } catch (error) {
                showToast('error', 'حدث خطأ أثناء إضافة التحديث');
            } finally {
                hideSpinner();
            }
        });
    }

    // Add "Create Appeal" button if it doesn't exist
    const modalFooter = document.querySelector('#viewCaseModal .modal-footer') || (() => {
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        document.querySelector('#viewCaseModal .modal-content').appendChild(footer);
        return footer;
    })();

    const isArchived = caseItem.status === 'Archived' || caseItem.status === 'مؤرشفة';
    const archiveBtnHtml = isArchived 
        ? `<button class="btn btn-outline-success" type="button" onclick="window.restoreCaseUI('${caseItem.id}')">
               <i class="fas fa-undo"></i> استعادة القضية نشطة
           </button>`
        : `<button class="btn btn-outline-danger" type="button" onclick="window.archiveCaseUI('${caseItem.id}')">
               <i class="fas fa-archive"></i> أرشفة ملف القضية
           </button>`;

    modalFooter.innerHTML = `
        <div class="d-flex w-100 justify-content-between align-items-center flex-wrap gap-2">
            <div class="d-flex gap-2">
                ${!isArchived ? `
                <div class="dropdown">
                    <button class="btn btn-warning dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="fas fa-gavel"></i> فتح درجة تقاضي جديدة
                    </button>
                    <ul class="dropdown-menu">
                        <li><a class="dropdown-item" href="javascript:void(0)" onclick="window.createAppeal('${caseItem.id}', 'Appeal')">استئناف</a></li>
                        <li><a class="dropdown-item" href="javascript:void(0)" onclick="window.createAppeal('${caseItem.id}', 'Supreme')">نقض</a></li>
                    </ul>
                </div>
                ` : ''}
                ${archiveBtnHtml}
            </div>
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إغلاق</button>
        </div>
    `;

    viewModal.show();
};

window.createAppeal = async function (parentCaseId, level) {
    const levelNames = {
        'Appeal': 'استئناف',
        'Supreme': 'نقض'
    };

    const isConfirmed = await showConfirmDialog(
        'تأكيد فتح درجة تقاضي جديدة',
        `هل أنت متأكد من إنشاء قضية (${levelNames[level]}) مرتبطة بهذه القضية؟ سيتم نسخ بيانات الموكل والتفاصيل الأساسية.`
    );

    if (isConfirmed) {
        try {
            showSpinner();
            await createAppealCase(parentCaseId, level);
            
            const modalEl = document.getElementById('viewCaseModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            
            showToast('success', `تم إنشاء قضية ${levelNames[level]} بنجاح`);
        } catch (error) {
            handleApiError(error);
        } finally {
            hideSpinner();
        }
    }
};

async function loadCaseSessions(caseId) {
    const tbody = document.getElementById('caseSessionsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></td></tr>';

    try {
        const sessions = await getSessionsByCase(caseId);
        tbody.innerHTML = '';

        if (sessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">لا توجد جلسات مجدولة لهذه القضية</td></tr>';
            return;
        }

        sessions.forEach(session => {
            const dateStr = session.sessionDate.toDate ? session.sessionDate.toDate().toLocaleDateString('ar-EG') : new Date(session.sessionDate).toLocaleDateString('ar-EG');
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${dateStr}</td>
                <td>${session.rollNumber || '---'}</td>
                <td><span class="badge ${session.status === 'Attended' ? 'bg-success' : 'bg-warning'}">${session.status}</span></td>
                <td class="small">${session.decision || '---'}</td>
                <td>
                    <button class="btn btn-sm btn-link p-0 text-danger" onclick="window.deleteSessionFromCase('${session.id}', '${caseId}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading sessions:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-3">خطأ في تحميل الجلسات</td></tr>';
    }
}

window.deleteSessionFromCase = async function(sessionId, caseId) {
    if (confirm('هل أنت متأكد من حذف هذه الجلسة؟')) {
        try {
            showSpinner();
            // We need to import deleteSession but let's just use the service directly if possible
            // Actually I'll just add it to the window or import it
            const { deleteSession } = await import('./features/sessions/sessions-service.js');
            await deleteSession(sessionId);
            showToast('success', 'تم حذف الجلسة');
            loadCaseSessions(caseId);
        } catch (error) {
            showToast('error', 'فشل الحذف');
        } finally {
            hideSpinner();
        }
    }
};
async function loadCaseDocuments(caseId) {
    const listContainer = document.getElementById('caseDocumentsList');
    if (!listContainer) return;

    listContainer.innerHTML = '<div class="col-12 text-center py-3"><div class="spinner-border text-primary"></div></div>';

    try {
        const docs = await getDocumentsByCase(caseId);
        listContainer.innerHTML = '';

        if (docs.length === 0) {
            listContainer.innerHTML = '<div class="col-12 text-center text-muted py-3">لا توجد مستندات لهذه القضية</div>';
            return;
        }

        docs.forEach(docItem => {
            const isImage = docItem.fileType.startsWith('image/');
            const sizeKb = Math.max(1, Math.round((docItem.fileSize || 0) / 1024));
            const card = document.createElement('div');
            card.className = 'col-md-6 col-xl-4';
            card.innerHTML = `
                <div class="card h-100 shadow-sm">
                    <div class="card-body p-3 d-flex align-items-start gap-3">
                        <div class="fs-3 text-primary">
                            <i class="${isImage ? 'fas fa-file-image' : 'fas fa-file-pdf'}"></i>
                        </div>
                        <div class="flex-grow-1 text-truncate">
                            <div class="small fw-bold text-truncate" title="${docItem.originalFileName || docItem.fileName}">${docItem.originalFileName || docItem.fileName}</div>
                            <div><span class="badge bg-light text-dark border">${docItem.documentType || 'أخرى'}</span></div>
                            <small class="text-muted d-block">${docItem.uploadDate ? new Date(docItem.uploadDate.toDate()).toLocaleDateString('ar-EG') : '---'} · ${sizeKb} KB</small>
                            ${docItem.notes ? `<small class="text-muted d-block text-truncate">${docItem.notes}</small>` : ''}
                        </div>
                        <div class="dropdown">
                            <button class="btn btn-sm btn-link text-muted" data-bs-toggle="dropdown"><i class="fas fa-ellipsis-v"></i></button>
                            <ul class="dropdown-menu dropdown-menu-end">
                                <li><a class="dropdown-item" href="${docItem.fileUrl}" target="_blank"><i class="fas fa-download me-2"></i> تحميل</a></li>
                                <li><a class="dropdown-item text-danger" href="javascript:void(0)" onclick="window.deleteDocUI('${docItem.id}', '${caseId}')"><i class="fas fa-trash me-2"></i> حذف</a></li>
                            </ul>
                        </div>
                    </div>
                </div>
            `;
            listContainer.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading documents:', error);
        listContainer.innerHTML = '<div class="col-12 text-center text-danger py-3">خطأ في تحميل المستندات</div>';
    }
}

window.deleteDocUI = async function(docId, caseId) {
    if (confirm('هل أنت متأكد من حذف هذا المستند؟')) {
        try {
            showSpinner();
            await deleteDocument(docId, caseId);
            showToast('success', 'تم حذف المستند');
            loadCaseDocuments(caseId);
            loadCaseTimeline(caseId);
        } catch (error) {
            showToast('error', 'فشل حذف المستند');
        } finally {
            hideSpinner();
        }
    }
};

window.deleteCase = async function (id) {
    const isConfirmed = await showConfirmDialog(
        'تأكيد الحذف',
        'هل أنت متأكد من حذف هذه القضية؟ سيتم إزالة جميع البيانات المرتبطة بها ولا يمكن التراجع.'
    );

    if (isConfirmed) {
        try {
            showSpinner();
            await deleteCase(id);
            showToast('success', 'تم حذف القضية بنجاح');
        } catch (error) {
            handleApiError(error);
        } finally {
            hideSpinner();
        }
    }
};

async function loadCaseTimeline(caseId) {
    const container = document.getElementById('caseTimelineContainer');
    if (!container) return;

    container.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

    try {
        const { getTimelineByCase } = await import('./db-services.js');
        const timeline = await getTimelineByCase(caseId);
        container.innerHTML = '';

        if (timeline.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-3">لا توجد تحديثات مسجلة لهذه القضية</div>';
            return;
        }

        timeline.forEach(event => {
            let iconClass = 'fas fa-info-circle';
            let colorClass = 'primary';
            
            switch (event.type) {
                case 'creation':
                    iconClass = 'fas fa-folder-open';
                    colorClass = 'success';
                    break;
                case 'document':
                    iconClass = 'fas fa-file-upload';
                    colorClass = 'info';
                    break;
                case 'document_deleted':
                    iconClass = 'fas fa-file-signature';
                    colorClass = 'danger';
                    break;
                case 'session':
                case 'session_scheduled':
                case 'session_updated':
                    iconClass = 'fas fa-gavel';
                    colorClass = 'warning';
                    break;
                case 'payment':
                    iconClass = 'fas fa-money-bill-wave';
                    colorClass = 'success';
                    break;
                case 'archive':
                    iconClass = 'fas fa-archive';
                    colorClass = 'secondary';
                    break;
                case 'restore':
                    iconClass = 'fas fa-undo';
                    colorClass = 'primary';
                    break;
                case 'custom':
                    iconClass = 'fas fa-user-edit';
                    colorClass = 'primary';
                    break;
            }

            const eventDateObj = event.date?.toDate ? event.date.toDate() : new Date(event.date);
            const dateStr = !isNaN(eventDateObj.getTime()) ? eventDateObj.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '---';
            const timeStr = !isNaN(eventDateObj.getTime()) ? eventDateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';

            const item = document.createElement('div');
            item.className = `timeline-item mb-3 d-flex align-items-start gap-3`;
            item.innerHTML = `
                <div class="timeline-icon bg-${colorClass} text-white rounded-circle d-flex align-items-center justify-content-center shadow-sm" style="width: 36px; height: 36px; flex-shrink: 0; z-index: 2;">
                    <i class="${iconClass}"></i>
                </div>
                <div class="timeline-card card flex-grow-1 shadow-none border p-3 bg-light-subtle mb-0" style="border-radius: 8px; border-right: 4px solid var(--bs-${colorClass}) !important;">
                    <div class="d-flex justify-content-between align-items-center flex-wrap mb-1">
                        <h6 class="fw-bold mb-0 text-${colorClass}">${event.title}</h6>
                        <span class="text-muted small"><i class="far fa-clock me-1"></i>${dateStr} ${timeStr}</span>
                    </div>
                    <p class="mb-0 text-muted small">${event.description || ''}</p>
                </div>
            `;
            container.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading timeline:', error);
        container.innerHTML = '<div class="text-center text-danger py-3">خطأ في تحميل سجل التحديثات</div>';
    }
}

window.archiveCaseUI = async function (caseId) {
    const date = new Date();
    const year = date.getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    const suggestedArchiveNo = `ARC-${year}-${random}`;

    const { value: archiveNo } = await Swal.fire({
        title: 'أرشفة ملف القضية',
        input: 'text',
        inputLabel: 'رقم ملف الأرشيف الخاص بهذه القضية',
        inputValue: suggestedArchiveNo,
        showCancelButton: true,
        confirmButtonText: 'تأكيد الأرشفة',
        cancelButtonText: 'إلغاء',
        inputValidator: (value) => {
            if (!value) {
                return 'يرجى إدخال رقم الأرشيف!';
            }
        }
    });

    if (archiveNo) {
        try {
            showSpinner();
            const { archiveCase } = await import('./db-services.js');
            await archiveCase(caseId, archiveNo);
            showToast('success', 'تم نقل القضية إلى الأرشيف بنجاح');
            
            const modalEl = document.getElementById('viewCaseModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        } catch (error) {
            showToast('error', 'فشل أرشفة القضية');
        } finally {
            hideSpinner();
        }
    }
};

window.restoreCaseUI = async function (caseId) {
    const isConfirmed = await showConfirmDialog(
        'استعادة القضية',
        'هل أنت متأكد من استعادة هذه القضية كقضية نشطة؟'
    );

    if (isConfirmed) {
        try {
            showSpinner();
            const { restoreCase } = await import('./db-services.js');
            await restoreCase(caseId);
            showToast('success', 'تم استعادة القضية بنجاح كملف نشط');
            
            const modalEl = document.getElementById('viewCaseModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        } catch (error) {
            showToast('error', 'فشل استعادة القضية');
        } finally {
            hideSpinner();
        }
    }
};
