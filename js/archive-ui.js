import { showSpinner, hideSpinner } from './ui-utils.js';
import {
    createManualArchive,
    deleteManualArchive,
    getAllArchives,
    updateManualArchive
} from './features/sessions/sessions-service.js';

let archiveItems = [];
let manualArchiveModal;

export async function initArchiveUI() {
    manualArchiveModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('manualArchiveModal'));
    bindArchiveEvents();
    await refreshArchiveList();
}

function bindArchiveEvents() {
    document.getElementById('btnAddManualArchive')?.addEventListener('click', () => openManualArchiveModal());
    document.getElementById('manualArchiveForm')?.addEventListener('submit', handleManualArchiveSubmit);
    document.getElementById('btnClearArchiveSearch')?.addEventListener('click', async () => {
        ['archiveSearch', 'archiveYearFilter', 'archiveCourtFilter', 'archiveBoxFilter'].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });
        const source = document.getElementById('archiveSourceFilter');
        if (source) source.value = 'all';
        await refreshArchiveList();
    });

    ['archiveSearch', 'archiveSourceFilter', 'archiveYearFilter', 'archiveCourtFilter', 'archiveBoxFilter'].forEach(id => {
        const element = document.getElementById(id);
        if (!element) return;
        let timer;
        element.addEventListener(id === 'archiveSourceFilter' ? 'change' : 'input', () => {
            clearTimeout(timer);
            timer = setTimeout(refreshArchiveList, 250);
        });
    });

    window.editManualArchive = (id) => {
        const item = archiveItems.find(entry => entry.id === id && entry.source === 'ManualArchive');
        if (item) openManualArchiveModal(item);
    };
    window.viewManualArchive = (id) => {
        const item = archiveItems.find(entry => entry.id === id);
        if (item) showManualArchiveDetails(item);
    };
    window.deleteManualArchiveUI = deleteManualArchiveUI;
    window.printArchiveCard = printArchiveCard;

    window.removeEventListener('manualArchiveUpdated', window._onManualArchiveUpdated);
    window._onManualArchiveUpdated = () => refreshArchiveList();
    window.addEventListener('manualArchiveUpdated', window._onManualArchiveUpdated);

    window.removeEventListener('sessionArchived', window._onSessionArchivedForCombinedArchive);
    window._onSessionArchivedForCombinedArchive = () => refreshArchiveList();
    window.addEventListener('sessionArchived', window._onSessionArchivedForCombinedArchive);
}

async function refreshArchiveList() {
    try {
        showSpinner();
        archiveItems = await getAllArchives(getArchiveFilters());
        renderArchiveTable(archiveItems);
    } catch (error) {
        const tbody = document.getElementById('archiveTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-4">تعذر تحميل الأرشيف: ${escapeHtml(error.message)}</td></tr>`;
        }
    } finally {
        hideSpinner();
    }
}

function getArchiveFilters() {
    return {
        search: document.getElementById('archiveSearch')?.value?.trim() || '',
        source: document.getElementById('archiveSourceFilter')?.value || 'all',
        caseYear: document.getElementById('archiveYearFilter')?.value || '',
        courtName: document.getElementById('archiveCourtFilter')?.value?.trim() || '',
        boxNumber: document.getElementById('archiveBoxFilter')?.value?.trim() || ''
    };
}

function renderArchiveTable(items) {
    const tbody = document.getElementById('archiveTableBody');
    const countBadge = document.getElementById('archiveCountBadge');
    if (!tbody) return;

    if (countBadge) countBadge.textContent = `${items.length} سجل`;

    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-5"><i class="fas fa-archive fa-3x mb-3 d-block opacity-25"></i>لا توجد سجلات أرشيف مطابقة</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(item => `
        <tr>
            <td class="ps-4">${renderSourceBadge(item.source)}</td>
            <td class="fw-bold text-secondary">${escapeHtml(item.archiveNumber || '---')}</td>
            <td>${escapeHtml(item.caseNumber || '---')}</td>
            <td>${escapeHtml(item.clientName || '---')}</td>
            <td>${escapeHtml(item.caseTitle || '---')}</td>
            <td>${escapeHtml(item.courtName || '---')}</td>
            <td>${renderLocation(item)}</td>
            <td>${formatDate(item.archiveDate)}</td>
            <td class="pe-4 text-end">${renderActions(item)}</td>
        </tr>
    `).join('');
}

function renderSourceBadge(source) {
    return source === 'ManualArchive'
        ? '<span class="badge bg-info-subtle text-info border border-info-subtle">قضية قديمة</span>'
        : '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">أرشيف جلسة</span>';
}

function renderLocation(item) {
    const pieces = [];
    if (item.boxNumber) pieces.push(`صندوق ${escapeHtml(item.boxNumber)}`);
    if (item.shelfNumber) pieces.push(`رف ${escapeHtml(item.shelfNumber)}`);
    if (item.physicalLocation) pieces.push(escapeHtml(item.physicalLocation));
    return pieces.length ? pieces.join(' / ') : '---';
}

function renderActions(item) {
    if (item.source === 'SessionArchive') {
        return `
            <button class="btn btn-sm btn-outline-primary" onclick="window.viewCase('${item.caseId}')">
                <i class="fas fa-folder-open"></i> عرض ملف القضية
            </button>
            <button class="btn btn-sm btn-outline-secondary" onclick="window.printArchiveCard('${item.id}')">
                <i class="fas fa-print"></i>
            </button>
        `;
    }

    return `
        <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-info" onclick="window.viewManualArchive('${item.id}')"><i class="fas fa-eye"></i> عرض</button>
            <button class="btn btn-outline-primary" onclick="window.editManualArchive('${item.id}')"><i class="fas fa-edit"></i> تعديل</button>
            <button class="btn btn-outline-danger" onclick="window.deleteManualArchiveUI('${item.id}')"><i class="fas fa-trash"></i></button>
            <button class="btn btn-outline-secondary" onclick="window.printArchiveCard('${item.id}')"><i class="fas fa-print"></i></button>
        </div>
    `;
}

function openManualArchiveModal(item = null) {
    document.getElementById('manualArchiveModalTitle').textContent = item ? 'تعديل قضية مؤرشفة قديمة' : 'إضافة قضية مؤرشفة قديمة';
    setValue('manualArchiveId', item?.id || '');
    setValue('manualArchiveNumber', item?.archiveNumber || '');
    setValue('manualOldCaseNumber', item?.caseNumber || '');
    setValue('manualCaseYear', item?.caseYear || '');
    setValue('manualClientName', item?.clientName || '');
    setValue('manualOpponentName', item?.opponentName || '');
    setValue('manualCaseTitle', item?.caseTitle || '');
    setValue('manualCaseType', item?.caseType || '');
    setValue('manualCourtName', item?.courtName || '');
    setValue('manualArchiveDate', toDateInput(item?.archiveDate || new Date()));
    setValue('manualBoxNumber', item?.boxNumber || '');
    setValue('manualShelfNumber', item?.shelfNumber || '');
    setValue('manualPhysicalLocation', item?.physicalLocation || '');
    setValue('manualLawyerName', item?.lawyerName || '');
    setValue('manualTags', item?.tags || '');
    setValue('manualNotes', item?.notes || '');
    manualArchiveModal.show();
}

async function handleManualArchiveSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const id = getValue('manualArchiveId');
    const payload = collectManualArchiveForm();

    try {
        showSpinner();
        const result = id
            ? await updateManualArchive(id, payload)
            : await createManualArchive(payload);
        manualArchiveModal.hide();
        await refreshArchiveList();
        await Swal.fire({
            icon: 'success',
            title: 'تم حفظ سجل الأرشيف',
            text: `رقم الأرشيف: ${result.archiveNumber}`,
            confirmButtonText: 'حسنا'
        });
    } catch (error) {
        await Swal.fire({
            icon: 'error',
            title: 'تعذر حفظ سجل الأرشيف',
            text: error.message,
            confirmButtonText: 'إغلاق'
        });
    } finally {
        hideSpinner();
    }
}

function collectManualArchiveForm() {
    return {
        archiveNumber: getValue('manualArchiveNumber'),
        oldCaseNumber: getValue('manualOldCaseNumber'),
        clientName: getValue('manualClientName'),
        opponentName: getValue('manualOpponentName'),
        caseTitle: getValue('manualCaseTitle'),
        caseType: getValue('manualCaseType'),
        courtName: getValue('manualCourtName'),
        caseYear: getValue('manualCaseYear'),
        archiveDate: getValue('manualArchiveDate'),
        boxNumber: getValue('manualBoxNumber'),
        shelfNumber: getValue('manualShelfNumber'),
        physicalLocation: getValue('manualPhysicalLocation'),
        lawyerName: getValue('manualLawyerName'),
        tags: getValue('manualTags'),
        notes: getValue('manualNotes'),
        status: 'Active'
    };
}

async function deleteManualArchiveUI(id) {
    const confirmed = await Swal.fire({
        icon: 'warning',
        title: 'إخفاء سجل الأرشيف؟',
        text: 'سيتم إخفاء السجل من القائمة بدون حذف البيانات نهائيا.',
        showCancelButton: true,
        confirmButtonText: 'إخفاء',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#dc3545'
    });

    if (!confirmed.isConfirmed) return;

    try {
        showSpinner();
        await deleteManualArchive(id);
        await refreshArchiveList();
        await Swal.fire({ icon: 'success', title: 'تم إخفاء السجل', confirmButtonText: 'حسنا' });
    } catch (error) {
        await Swal.fire({ icon: 'error', title: 'تعذر إخفاء السجل', text: error.message, confirmButtonText: 'إغلاق' });
    } finally {
        hideSpinner();
    }
}

function showManualArchiveDetails(item) {
    Swal.fire({
        title: escapeHtml(item.archiveNumber),
        html: `
            <div class="text-end" dir="rtl">
                <p><strong>الموكل:</strong> ${escapeHtml(item.clientName || '---')}</p>
                <p><strong>عنوان القضية:</strong> ${escapeHtml(item.caseTitle || '---')}</p>
                <p><strong>المحكمة:</strong> ${escapeHtml(item.courtName || '---')}</p>
                <p><strong>رقم القضية القديم:</strong> ${escapeHtml(item.caseNumber || '---')}</p>
                <p><strong>الموقع:</strong> ${renderLocation(item)}</p>
                <p><strong>ملاحظات:</strong> ${escapeHtml(item.notes || '---')}</p>
            </div>
        `,
        confirmButtonText: 'إغلاق'
    });
}

function printArchiveCard(id) {
    const item = archiveItems.find(entry => entry.id === id);
    if (!item) return;

    const printWindow = window.open('', '_blank', 'width=520,height=640');
    if (!printWindow) return;

    printWindow.document.write(`
        <!doctype html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="utf-8">
            <title>بطاقة أرشيف ${escapeHtml(item.archiveNumber)}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 24px; direction: rtl; }
                .card { border: 2px solid #222; padding: 18px; max-width: 420px; }
                h1 { font-size: 22px; margin: 0 0 16px; text-align: center; }
                .row { display: flex; justify-content: space-between; border-bottom: 1px solid #ddd; padding: 8px 0; gap: 12px; }
                .label { color: #555; font-weight: bold; min-width: 130px; }
                .value { text-align: left; direction: rtl; flex: 1; }
                @media print { button { display: none; } }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>بطاقة أرشيف</h1>
                ${printRow('رقم الأرشيف', item.archiveNumber)}
                ${printRow('اسم الموكل', item.clientName)}
                ${printRow('عنوان القضية', item.caseTitle)}
                ${printRow('المحكمة', item.courtName)}
                ${printRow('رقم القضية', item.caseNumber)}
                ${printRow('رقم الصندوق', item.boxNumber)}
                ${printRow('رقم الرف', item.shelfNumber)}
                ${printRow('مكان الحفظ', item.physicalLocation)}
            </div>
            <button onclick="window.print()">طباعة</button>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
}

function printRow(label, value) {
    return `<div class="row"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value || '---')}</span></div>`;
}

function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value ?? '';
}

function getValue(id) {
    return (document.getElementById(id)?.value || '').trim();
}

function toDateInput(value) {
    const date = new Date(value);
    return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
}

function formatDate(value) {
    if (!value) return '---';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '---';
    return date.toLocaleDateString('ar-EG');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
