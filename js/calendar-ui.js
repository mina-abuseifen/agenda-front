import { memoryCache } from './db-services.js';
import { showSpinner, hideSpinner, showToast } from './ui-utils.js';
import { addSession, updateSession, attendSession, postponeSession, archiveSession, addSessionOutcome } from './features/sessions/sessions-service.js';

let currentDate = new Date();
let selectedDate = new Date();
let currentView = 'month';

const statusMap = {
    PendingAttendance: { label: 'بانتظار الحضور', color: 'warning' },
    Upcoming: { label: 'بانتظار الحضور', color: 'warning' },
    Attended: { label: 'تم الحضور', color: 'success' },
    Postponed: { label: 'تم التأجيل', color: 'danger' },
    Archived: { label: 'مؤرشفة', color: 'secondary' },
    Cancelled: { label: 'ملغاة', color: 'dark' },
    Office: { label: 'مكتبية', color: 'info' }
};

export async function initCalendarUI() {
    setupNavigation();
    setupViewToggles();
    setupCalendarSessionActions();
    renderCalendar();

    window.removeEventListener('sessionsUpdated', window._onCalendarSessionsUpdate);
    window._onCalendarSessionsUpdate = () => renderCalendar();
    window.addEventListener('sessionsUpdated', window._onCalendarSessionsUpdate);

    window.removeEventListener('casesUpdated', window._onCalendarCasesUpdate);
    window._onCalendarCasesUpdate = () => renderCalendar();
    window.addEventListener('casesUpdated', window._onCalendarCasesUpdate);
}

function setupCalendarSessionActions() {
    document.getElementById('btnAddCalendarSession')?.addEventListener('click', () => {
        window.addSessionFromCalendar();
    });
}

function setupNavigation() {
    document.getElementById('btnCalPrev')?.addEventListener('click', () => {
        adjustDate(-1);
        renderCalendar();
    });
    document.getElementById('btnCalNext')?.addEventListener('click', () => {
        adjustDate(1);
        renderCalendar();
    });
    document.getElementById('btnCalToday')?.addEventListener('click', () => {
        currentDate = new Date();
        selectedDate = new Date();
        renderCalendar();
    });
}

function setupViewToggles() {
    const buttons = {
        month: document.getElementById('btnCalMonth'),
        week: document.getElementById('btnCalWeek'),
        day: document.getElementById('btnCalDay')
    };

    Object.entries(buttons).forEach(([view, button]) => {
        button?.addEventListener('click', () => {
            Object.values(buttons).forEach(item => item?.classList.remove('active'));
            button.classList.add('active');
            currentView = view;
            renderCalendar();
        });
    });
}

function adjustDate(amount) {
    if (currentView === 'month') currentDate.setMonth(currentDate.getMonth() + amount);
    else if (currentView === 'week') currentDate.setDate(currentDate.getDate() + amount * 7);
    else currentDate.setDate(currentDate.getDate() + amount);
}

function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
}

function statusMeta(status) {
    return statusMap[status] || statusMap.PendingAttendance;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatDate(value) {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '---';
    return date.toLocaleString('ar-EG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function toInputDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function toInputTime(value, fallback = '09:00') {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return fallback;
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function activeCases() {
    return (memoryCache.cases || [])
        .filter(caseItem => caseItem.status !== 'Archived')
        .sort((a, b) => String(a.caseNo || '').localeCompare(String(b.caseNo || ''), 'ar'));
}

function caseOptionsHtml(selectedCaseId = '') {
    const cases = activeCases();
    if (!cases.length) {
        return '<option value="">لا توجد قضايا نشطة</option>';
    }

    return cases.map(caseItem => {
        const selected = caseItem.id === selectedCaseId ? 'selected' : '';
        return `<option value="${escapeHtml(caseItem.id)}" ${selected}>${escapeHtml(caseItem.caseNo || '---')} - ${escapeHtml(caseItem.clientName || '---')}</option>`;
    }).join('');
}

function getItemsForDate(date) {
    const sessions = memoryCache.sessions || [];
    const cases = memoryCache.cases || [];

    const daySessions = sessions
        .filter(session => session.status !== 'Archived')
        .filter(session => sameDay(new Date(session.sessionDate), date))
        .map(session => ({ ...session, calendarType: 'session' }));

    const dayHearings = cases
        .filter(caseItem => caseItem.hearingDate && caseItem.status !== 'Archived')
        .filter(caseItem => sameDay(new Date(caseItem.hearingDate), date))
        .filter(caseItem => !daySessions.some(session => session.caseId === caseItem.id))
        .map(caseItem => ({
            id: `hearing_${caseItem.id}`,
            caseId: caseItem.id,
            caseNo: caseItem.caseNo,
            clientName: caseItem.clientName,
            court: caseItem.court,
            circuit: caseItem.circuit || '',
            rollNumber: '---',
            sessionDate: caseItem.hearingDate,
            status: 'PendingAttendance',
            notes: caseItem.decision || '',
            calendarType: 'hearing'
        }));

    return [...daySessions, ...dayHearings];
}

function renderCalendar() {
    showSpinner();
    updateTitle();

    if (currentView === 'month') renderMonthView();
    else if (currentView === 'week') renderWeekView();
    else renderDayView();

    renderSelectedDay();
    hideSpinner();
}

function updateTitle() {
    const title = document.getElementById('calendarTitle');
    if (!title) return;

    if (currentView === 'month') {
        title.innerText = currentDate.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
        return;
    }

    if (currentView === 'week') {
        const start = getStartOfWeek(currentDate);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        title.innerText = `${start.getDate()} - ${end.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        return;
    }

    title.innerText = currentDate.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function getStartOfWeek(date) {
    const start = new Date(date);
    const day = start.getDay();
    const diff = day === 6 ? 0 : -(day + 1);
    start.setDate(start.getDate() + diff);
    return start;
}

function renderMonthView() {
    const grid = document.getElementById('calendarGrid');
    const weekdays = document.getElementById('calendarWeekdays');
    if (!grid) return;

    weekdays?.classList.remove('d-none');
    grid.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startIdx = (firstDay.getDay() + 1) % 7;
    const prevDays = new Date(year, month, 0).getDate();

    for (let i = startIdx - 1; i >= 0; i--) {
        grid.appendChild(createDayCell(prevDays - i, new Date(year, month - 1, prevDays - i), true));
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        grid.appendChild(createDayCell(day, date, false, sameDay(date, new Date()), sameDay(date, selectedDate)));
    }

    const remaining = grid.children.length <= 35 ? 35 - grid.children.length : 42 - grid.children.length;
    for (let day = 1; day <= remaining; day++) {
        grid.appendChild(createDayCell(day, new Date(year, month + 1, day), true));
    }
}

function createDayCell(day, date, outside, today = false, selected = false) {
    const cell = document.createElement('div');
    cell.className = `col text-end p-2 border position-relative calendar-day-cell ${outside ? 'bg-light opacity-50' : 'bg-white'} ${selected ? 'border-primary border-2 shadow-sm' : ''}`;
    cell.style.minHeight = '90px';
    cell.style.flexBasis = '0';
    cell.style.flexGrow = '1';
    cell.style.maxWidth = '14.28%';
    cell.style.cursor = 'pointer';

    const label = document.createElement('div');
    label.className = `small fw-bold p-1 rounded-circle d-inline-flex justify-content-center align-items-center ${today ? 'bg-primary text-white' : ''}`;
    label.style.width = '24px';
    label.style.height = '24px';
    label.innerText = day;
    cell.appendChild(label);

    const items = getItemsForDate(date);
    if (items.length) {
        const box = document.createElement('div');
        box.className = 'mt-1 d-flex flex-column gap-1 overflow-hidden';
        box.style.maxHeight = '55px';

        items.slice(0, 3).forEach(item => {
            const meta = statusMeta(item.status);
            const tag = document.createElement('div');
            tag.className = `small px-1 text-truncate rounded text-dark bg-${meta.color}-subtle border border-${meta.color} text-start`;
            tag.style.fontSize = '0.7rem';
            tag.style.lineHeight = '1.2';
            tag.innerText = item.caseNo || 'جلسة';
            box.appendChild(tag);
        });

        if (items.length > 3) {
            const more = document.createElement('div');
            more.className = 'text-center small text-muted';
            more.style.fontSize = '0.65rem';
            more.innerText = `+${items.length - 3} أخرى`;
            box.appendChild(more);
        }
        cell.appendChild(box);
    }

    cell.addEventListener('click', () => {
        selectedDate = new Date(date);
        currentDate = new Date(date);
        renderCalendar();
    });

    return cell;
}

function renderWeekView() {
    const grid = document.getElementById('calendarGrid');
    const weekdays = document.getElementById('calendarWeekdays');
    if (!grid) return;

    weekdays?.classList.add('d-none');
    grid.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'w-100 d-flex flex-column gap-2';
    const names = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
    const start = getStartOfWeek(currentDate);

    for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        const items = getItemsForDate(date);
        const row = document.createElement('div');
        row.className = `p-3 border rounded d-flex align-items-center justify-content-between ${sameDay(date, selectedDate) ? 'border-primary bg-primary-subtle' : 'bg-white'}`;
        row.style.cursor = 'pointer';
        row.innerHTML = `
            <div class="d-flex align-items-center gap-3">
                <div class="rounded-circle d-flex flex-column align-items-center justify-content-center bg-light p-2 border" style="width:55px;height:55px;">
                    <span class="small fw-bold text-muted" style="font-size:.75rem;">${names[i]}</span>
                    <span class="fw-bold fs-6 text-dark">${date.getDate()}</span>
                </div>
                <div>
                    <h6 class="mb-1 text-dark">${items.length} جلسات أو مواعيد مجدولة</h6>
                    <small class="text-muted">${date.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}</small>
                </div>
            </div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
                ${items.slice(0, 5).map(item => {
                    const meta = statusMeta(item.status);
                    return `<span class="badge bg-${meta.color}-subtle text-dark border border-${meta.color} px-2 py-1">${escapeHtml(item.caseNo)}</span>`;
                }).join('')}
                ${items.length > 5 ? `<span class="badge bg-secondary">+${items.length - 5}</span>` : ''}
            </div>
        `;
        row.addEventListener('click', () => {
            selectedDate = new Date(date);
            currentDate = new Date(date);
            renderCalendar();
        });
        container.appendChild(row);
    }
    grid.appendChild(container);
}

function renderDayView() {
    const grid = document.getElementById('calendarGrid');
    const weekdays = document.getElementById('calendarWeekdays');
    if (!grid) return;

    weekdays?.classList.add('d-none');
    grid.innerHTML = '';
    const items = getItemsForDate(currentDate);
    const container = document.createElement('div');
    container.className = 'w-100';

    if (!items.length) {
        container.innerHTML = emptyDayHtml();
        grid.appendChild(container);
        return;
    }

    container.innerHTML = `
        <div class="table-responsive bg-white border rounded shadow-sm">
            <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th class="ps-3">الرول</th>
                        <th>رقم القضية</th>
                        <th>الموكل</th>
                        <th>المحكمة / الدائرة</th>
                        <th>الحالة</th>
                        <th class="pe-3 text-end">تفاصيل</th>
                    </tr>
                </thead>
                <tbody>${items.map(renderDayRow).join('')}</tbody>
            </table>
        </div>
    `;
    grid.appendChild(container);
}

function renderDayRow(item) {
    const meta = statusMeta(item.status);
    const detailsButton = item.calendarType === 'session'
        ? `<button class="btn btn-sm btn-outline-primary" onclick="window.openSessionDetails('${item.id}')"><i class="fas fa-eye"></i> تفاصيل</button>`
        : `<button class="btn btn-sm btn-outline-primary" onclick="window.viewCase('${item.caseId}')"><i class="fas fa-folder-open"></i> عرض ملف القضية</button>`;

    return `
        <tr>
            <td class="ps-3 fw-bold">${escapeHtml(item.rollNumber || '---')}</td>
            <td class="fw-bold text-primary">${escapeHtml(item.caseNo || '---')}</td>
            <td>${escapeHtml(item.clientName || '---')}</td>
            <td>${escapeHtml(item.court || '---')} <span class="small text-muted d-block">${escapeHtml(item.circuit || '')}</span></td>
            <td><span class="badge bg-${meta.color}-subtle text-dark border border-${meta.color}">${meta.label}</span></td>
            <td class="pe-3 text-end">${detailsButton}</td>
        </tr>
    `;
}

function renderSelectedDay() {
    const list = document.getElementById('selectedDaySessionsList');
    const counter = document.getElementById('selectedDayCounter');
    const title = document.getElementById('selectedDateTitle');
    if (!list) return;

    const items = getItemsForDate(selectedDate);
    if (counter) counter.innerText = `${items.length} جلسة`;
    if (title) title.innerText = selectedDate.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short' });
    list.innerHTML = '';

    if (!items.length) {
        list.innerHTML = emptyAgendaHtml();
        return;
    }

    items.forEach(item => list.appendChild(createSessionCard(item)));
}

function createSessionCard(item) {
    const meta = statusMeta(item.status);
    const card = document.createElement('div');
    card.className = 'card shadow-none border rounded p-3 mb-2 bg-light-subtle';
    card.style.borderRight = `4px solid var(--bs-${meta.color})`;
    card.style.cursor = item.calendarType === 'session' ? 'pointer' : 'default';
    if (item.calendarType === 'session') {
        card.addEventListener('click', () => window.openSessionDetails(item.id));
    }
    card.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="fw-bold small text-primary">${escapeHtml(item.caseNo || '---')}</span>
            <span class="badge bg-${meta.color}-subtle text-dark border border-${meta.color}" style="font-size:.65rem;">${meta.label}</span>
        </div>
        <h6 class="fw-bold mb-1" style="font-size:.9rem;">${escapeHtml(item.clientName || 'عميل غير محدد')}</h6>
        <div class="small text-muted mb-2"><i class="fas fa-university me-1 text-secondary"></i> ${escapeHtml(item.court || '---')} (${escapeHtml(item.circuit || '---')})</div>
        ${item.outcomeType ? `<span class="badge bg-info-subtle text-dark border align-self-start mb-2">نتيجة: ${escapeHtml(item.outcomeType)}</span>` : ''}
        ${item.notes ? `<div class="bg-white border rounded p-2 mb-2 small text-muted text-truncate">${escapeHtml(item.notes)}</div>` : ''}
        <div class="d-flex justify-content-between align-items-center flex-wrap">
            <span class="small text-secondary">الرول: ${escapeHtml(item.rollNumber || '---')}</span>
            <button class="btn btn-sm btn-link text-primary p-0" onclick="event.stopPropagation(); window.viewCase('${item.caseId}')"><i class="fas fa-folder-open"></i> عرض ملف القضية</button>
        </div>
    `;
    return card;
}

function emptyDayHtml() {
    return `
        <div class="text-center py-5 bg-white border rounded text-muted">
            <i class="far fa-calendar-check fa-4x mb-3 opacity-25 text-secondary"></i>
            <h5>لا توجد جلسات أو مواعيد مجدولة لهذا اليوم</h5>
            <p class="small">أضف جلسة من شاشة القضايا أو جدول اليوم</p>
        </div>
    `;
}

function emptyAgendaHtml() {
    return `
        <div class="text-center text-muted py-5">
            <i class="far fa-check-circle text-success fa-3x mb-3 opacity-50"></i>
            <p class="mb-0 small fw-bold">الأجندة فارغة</p>
            <span class="small text-muted" style="font-size:.75rem;">لا توجد جلسات مجدولة لهذا اليوم</span>
        </div>
    `;
}

function findSession(sessionId) {
    return (memoryCache.sessions || []).find(item => item.id === sessionId);
}

window.openSessionDetails = function (sessionId) {
    const session = findSession(sessionId);
    if (!session) {
        showToast('error', 'تعذر العثور على الجلسة');
        return;
    }

    const meta = statusMeta(session.status);
    const isArchived = session.status === 'Archived';
    const actionFooter = `
        <div class="d-flex flex-wrap gap-2 justify-content-center">
            <button type="button" class="btn btn-sm btn-outline-primary" onclick="Swal.close(); window.editSessionFromCalendar('${session.id}')" ${isArchived ? 'disabled' : ''}>تعديل الجلسة</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="Swal.close(); window.archiveSessionFromCalendar('${session.id}')" ${isArchived ? 'disabled' : ''}>أرشفة الجلسة</button>
            <button type="button" class="btn btn-sm btn-outline-success" onclick="Swal.close(); window.addOutcomeFromCalendar('${session.id}')" ${session.status !== 'Attended' || isArchived ? 'disabled' : ''}>نتيجة الجلسة</button>
            <button type="button" class="btn btn-sm btn-outline-primary" onclick="Swal.close(); window.viewCase('${session.caseId}')">عرض ملف القضية</button>
        </div>
    `;

    Swal.fire({
        title: 'تفاصيل الجلسة',
        width: 720,
        html: `
            <div class="text-start" dir="rtl">
                <div class="row g-3">
                    <div class="col-md-6"><span class="text-muted">الموكل:</span> <strong>${escapeHtml(session.clientName || '---')}</strong></div>
                    <div class="col-md-6"><span class="text-muted">رقم القضية:</span> <strong>${escapeHtml(session.caseNo || '---')}</strong></div>
                    <div class="col-md-6"><span class="text-muted">المحكمة:</span> <strong>${escapeHtml(session.court || '---')}</strong></div>
                    <div class="col-md-6"><span class="text-muted">تاريخ الجلسة:</span> <strong>${escapeHtml(formatDate(session.sessionDate))}</strong></div>
                    <div class="col-md-6"><span class="text-muted">الحالة:</span> <span class="badge bg-${meta.color}-subtle text-dark border border-${meta.color}">${meta.label}</span></div>
                    <div class="col-md-6"><span class="text-muted">الرول:</span> <strong>${escapeHtml(session.rollNumber || '---')}</strong></div>
                    ${session.archiveNumber ? `<div class="col-12"><span class="text-muted">رقم الأرشيف:</span> <strong>${escapeHtml(session.archiveNumber)}</strong></div>` : ''}
                    ${session.outcomeType ? `<div class="col-12"><span class="text-muted">نتيجة الجلسة:</span> <span class="badge bg-info-subtle text-dark border">${escapeHtml(session.outcomeType)}</span></div>` : ''}
                    ${session.courtDecision ? `<div class="col-12"><span class="text-muted">قرار المحكمة:</span><div class="border rounded p-2 mt-1 bg-light">${escapeHtml(session.courtDecision)}</div></div>` : ''}
                    ${session.lawyerNotes ? `<div class="col-12"><span class="text-muted">ملاحظات المحامي:</span><div class="border rounded p-2 mt-1 bg-light">${escapeHtml(session.lawyerNotes)}</div></div>` : ''}
                    <div class="col-12"><span class="text-muted">ملاحظات:</span><div class="border rounded p-2 mt-1 bg-light">${escapeHtml(session.notes || '---')}</div></div>
                </div>
            </div>
        `,
        showCancelButton: true,
        showDenyButton: !isArchived,
        showConfirmButton: !isArchived,
        confirmButtonText: 'تم حضور الجلسة',
        denyButtonText: 'ترحيل الجلسة',
        cancelButtonText: 'إغلاق',
        footer: actionFooter
    }).then(async result => {
        if (result.isConfirmed) await window.attendSessionFromCalendar(session.id);
        if (result.isDenied) await window.postponeSessionFromCalendar(session.id);
    });
};

window.addSessionFromCalendar = async function () {
    const defaultDate = toInputDate(selectedDate || new Date());
    const result = await Swal.fire({
        title: 'إضافة جلسة',
        width: 720,
        html: `
            <div class="text-start" dir="rtl">
                <label class="form-label">القضية</label>
                <select id="calendarCaseId" class="form-select mb-3">${caseOptionsHtml()}</select>
                <div class="row g-2">
                    <div class="col-md-6">
                        <label class="form-label">التاريخ</label>
                        <input type="date" id="calendarSessionDate" class="form-control mb-3" value="${defaultDate}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">الوقت</label>
                        <input type="time" id="calendarSessionTime" class="form-control mb-3" value="09:00">
                    </div>
                </div>
                <label class="form-label">رقم الرول</label>
                <input type="text" id="calendarRollNumber" class="form-control mb-3">
                <label class="form-label">ملاحظات / قرار</label>
                <textarea id="calendarSessionNotes" class="form-control" rows="3"></textarea>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'حفظ الجلسة',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            const caseId = document.getElementById('calendarCaseId').value;
            const date = document.getElementById('calendarSessionDate').value;
            const time = document.getElementById('calendarSessionTime').value || '09:00';
            if (!caseId) {
                Swal.showValidationMessage('برجاء اختيار القضية');
                return false;
            }
            if (!date) {
                Swal.showValidationMessage('برجاء اختيار تاريخ الجلسة');
                return false;
            }
            return {
                caseId,
                sessionDate: `${date}T${time}:00`,
                rollNumber: document.getElementById('calendarRollNumber').value || '',
                notes: document.getElementById('calendarSessionNotes').value || '',
                status: 'PendingAttendance'
            };
        }
    });
    if (!result.isConfirmed) return;

    try {
        showSpinner();
        await addSession(result.value);
        selectedDate = new Date(result.value.sessionDate);
        currentDate = new Date(result.value.sessionDate);
        showToast('success', 'تمت إضافة الجلسة');
        renderCalendar();
    } catch (error) {
        showToast('error', error.message || 'فشل حفظ الجلسة');
    } finally {
        hideSpinner();
    }
};

window.editSessionFromCalendar = async function (sessionId) {
    const session = findSession(sessionId);
    if (!session) {
        showToast('error', 'تعذر العثور على الجلسة');
        return;
    }

    const result = await Swal.fire({
        title: 'تعديل الجلسة',
        width: 720,
        html: `
            <div class="text-start" dir="rtl">
                <div class="row g-2">
                    <div class="col-md-6">
                        <label class="form-label">التاريخ</label>
                        <input type="date" id="editSessionDate" class="form-control mb-3" value="${toInputDate(session.sessionDate)}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">الوقت</label>
                        <input type="time" id="editSessionTime" class="form-control mb-3" value="${toInputTime(session.sessionDate)}">
                    </div>
                </div>
                <label class="form-label">رقم الرول</label>
                <input type="text" id="editRollNumber" class="form-control mb-3" value="${escapeHtml(session.rollNumber || '')}">
                <label class="form-label">الحالة</label>
                <select id="editSessionStatus" class="form-select mb-3">
                    <option value="PendingAttendance" ${session.status === 'PendingAttendance' ? 'selected' : ''}>بانتظار الحضور</option>
                    <option value="Attended" ${session.status === 'Attended' ? 'selected' : ''}>تم الحضور</option>
                    <option value="Cancelled" ${session.status === 'Cancelled' ? 'selected' : ''}>ملغاة</option>
                </select>
                <label class="form-label">القرار</label>
                <textarea id="editSessionDecision" class="form-control mb-3" rows="2">${escapeHtml(session.decision || '')}</textarea>
                <label class="form-label">ملاحظات</label>
                <textarea id="editSessionNotes" class="form-control" rows="3">${escapeHtml(session.notes || '')}</textarea>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'حفظ التعديل',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            const date = document.getElementById('editSessionDate').value;
            const time = document.getElementById('editSessionTime').value || '09:00';
            if (!date) {
                Swal.showValidationMessage('برجاء اختيار تاريخ الجلسة');
                return false;
            }
            return {
                sessionDate: `${date}T${time}:00`,
                rollNumber: document.getElementById('editRollNumber').value || '',
                status: document.getElementById('editSessionStatus').value,
                decision: document.getElementById('editSessionDecision').value || '',
                notes: document.getElementById('editSessionNotes').value || ''
            };
        }
    });
    if (!result.isConfirmed) return;

    try {
        showSpinner();
        await updateSession(sessionId, result.value);
        selectedDate = new Date(result.value.sessionDate);
        currentDate = new Date(result.value.sessionDate);
        showToast('success', 'تم تعديل الجلسة');
        renderCalendar();
    } catch (error) {
        showToast('error', error.message || 'فشل تعديل الجلسة');
    } finally {
        hideSpinner();
    }
};

window.attendSessionFromCalendar = async function (sessionId) {
    const result = await Swal.fire({
        title: 'تأكيد حضور الجلسة',
        input: 'textarea',
        inputLabel: 'ملاحظات اختيارية',
        inputPlaceholder: 'اكتب ملاحظات الحضور إن وجدت...',
        showCancelButton: true,
        confirmButtonText: 'تم حضور الجلسة',
        cancelButtonText: 'إلغاء'
    });
    if (!result.isConfirmed) return;

    try {
        showSpinner();
        await attendSession(sessionId, result.value || '');
        showToast('success', 'تم تسجيل حضور الجلسة');
        renderCalendar();
        await window.addOutcomeFromCalendar(sessionId);
    } catch (error) {
        showToast('error', error.message || 'فشل تسجيل حضور الجلسة');
    } finally {
        hideSpinner();
    }
};

window.postponeSessionFromCalendar = async function (sessionId) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const defaultDate = tomorrow.toISOString().slice(0, 10);
    const result = await Swal.fire({
        title: 'ترحيل الجلسة',
        html: `
            <div class="text-start" dir="rtl">
                <label class="form-label">التاريخ الجديد</label>
                <input type="date" id="postponeDate" class="form-control mb-3" value="${defaultDate}">
                <label class="form-label">الوقت الجديد</label>
                <input type="time" id="postponeTime" class="form-control mb-3" value="09:00">
                <label class="form-label">سبب / ملاحظات التأجيل</label>
                <textarea id="postponeNotes" class="form-control" rows="3"></textarea>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'ترحيل الجلسة',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            const date = document.getElementById('postponeDate').value;
            const time = document.getElementById('postponeTime').value || '09:00';
            if (!date) {
                Swal.showValidationMessage('برجاء اختيار التاريخ الجديد');
                return false;
            }
            return {
                newSessionDate: `${date}T${time}:00`,
                notes: document.getElementById('postponeNotes').value || ''
            };
        }
    });
    if (!result.isConfirmed) return;

    try {
        showSpinner();
        const response = await postponeSession(sessionId, result.value.newSessionDate, result.value.notes);
        showToast('success', `تم ترحيل الجلسة إلى ${formatDate(response.newSession.sessionDate)}`);
        renderCalendar();
    } catch (error) {
        showToast('error', error.message || 'فشل ترحيل الجلسة');
    } finally {
        hideSpinner();
    }
};

window.addOutcomeFromCalendar = async function (sessionId) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const defaultDate = tomorrow.toISOString().slice(0, 10);
    const result = await Swal.fire({
        title: 'نتيجة الجلسة',
        width: 720,
        html: `
            <div class="text-start" dir="rtl">
                <label class="form-label">نتيجة الجلسة</label>
                <select id="outcomeType" class="form-select mb-3">
                    <option value="تأجيل">تأجيل</option>
                    <option value="حجز للحكم">حجز للحكم</option>
                    <option value="شطب">شطب</option>
                    <option value="حفظ">حفظ</option>
                    <option value="تنفيذ">تنفيذ</option>
                    <option value="إغلاق القضية">إغلاق القضية</option>
                    <option value="أخرى">أخرى</option>
                </select>
                <label class="form-label">قرار المحكمة</label>
                <textarea id="courtDecision" class="form-control mb-3" rows="2"></textarea>
                <label class="form-label">ملاحظات المحامي</label>
                <textarea id="lawyerNotes" class="form-control mb-3" rows="2"></textarea>
                <label class="form-label">تاريخ الجلسة القادمة</label>
                <input type="date" id="nextSessionDate" class="form-control mb-3" value="${defaultDate}">
                <label class="form-label">وقت الجلسة القادمة</label>
                <input type="time" id="nextSessionTime" class="form-control mb-3" value="09:00">
                <label class="form-label">سبب التأجيل</label>
                <input type="text" id="nextSessionReason" class="form-control">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'حفظ نتيجة الجلسة',
        cancelButtonText: 'تخطي',
        preConfirm: () => {
            const outcomeType = document.getElementById('outcomeType').value;
            const date = document.getElementById('nextSessionDate').value;
            const time = document.getElementById('nextSessionTime').value || '09:00';
            return {
                outcomeType,
                courtDecision: document.getElementById('courtDecision').value || '',
                lawyerNotes: document.getElementById('lawyerNotes').value || '',
                nextSessionDate: outcomeType === 'تأجيل' && date ? `${date}T${time}:00` : null,
                nextSessionReason: document.getElementById('nextSessionReason').value || ''
            };
        }
    });
    if (!result.isConfirmed) return;

    try {
        showSpinner();
        await addSessionOutcome(sessionId, result.value);
        showToast('success', 'تم حفظ نتيجة الجلسة');
        renderCalendar();
    } catch (error) {
        showToast('error', error.message || 'فشل حفظ نتيجة الجلسة');
    } finally {
        hideSpinner();
    }
};

window.archiveSessionFromCalendar = async function (sessionId) {
    const result = await Swal.fire({
        title: 'أرشفة الجلسة',
        html: `
            <div class="text-start" dir="rtl">
                <label class="form-label">رقم الأرشيف (اختياري)</label>
                <input type="text" id="archiveNumber" class="form-control mb-3" placeholder="اتركه فارغا للتوليد التلقائي">
                <label class="form-label">ملاحظات الأرشفة</label>
                <textarea id="archiveNotes" class="form-control" rows="3"></textarea>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'أرشفة الجلسة',
        cancelButtonText: 'إلغاء',
        preConfirm: () => ({
            archiveNumber: document.getElementById('archiveNumber').value || '',
            notes: document.getElementById('archiveNotes').value || ''
        })
    });
    if (!result.isConfirmed) return;

    try {
        showSpinner();
        const archive = await archiveSession(sessionId, result.value.archiveNumber, result.value.notes);
        showToast('success', `تمت أرشفة الجلسة برقم ${archive.archiveNumber}`);
        renderCalendar();
    } catch (error) {
        showToast('error', error.message || 'فشل أرشفة الجلسة');
    } finally {
        hideSpinner();
    }
};
