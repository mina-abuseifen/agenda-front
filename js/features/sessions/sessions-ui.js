import { subscribeToDailySessions, updateSession } from './sessions-service.js';
import { subscribeToDailyTasks, addTask, updateTask, deleteTask } from '../tasks/tasks-service.js';
import { showToast, showSpinner, hideSpinner } from '../../ui-utils.js';

let currentUnsubscribe = null;
let currentTasksUnsubscribe = null;

export async function initSessionsUI() {
    console.log('initSessionsUI: starting');
    
    const datePicker = document.getElementById('agendaDatePicker');
    const today = new Date().toISOString().split('T')[0];
    
    if (datePicker) {
        datePicker.value = today;
        datePicker.addEventListener('change', (e) => {
            loadAgendaForDate(e.target.value);
        });
    }

    loadAgendaForDate(today);

    // Setup update form
    const updateForm = document.getElementById('updateSessionForm');
    if (updateForm) {
        updateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            const id = data.id;
            delete data.id;

            try {
                showSpinner();
                await updateSession(id, data);
                
                const modalEl = document.getElementById('updateSessionModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
                
                showToast('success', 'تم تحديث الجلسة بنجاح');
            } catch (error) {
                showToast('error', 'حدث خطأ أثناء التحديث');
            } finally {
                hideSpinner();
            }
        });
    }

    // Toggle next session date based on postponed status selection
    const statusSelect = document.getElementById('updateSessionStatusSelect');
    const postponedDateGroup = document.getElementById('postponedDateGroup');
    if (statusSelect && postponedDateGroup) {
        statusSelect.addEventListener('change', (e) => {
            if (e.target.value === 'Postponed') {
                postponedDateGroup.classList.remove('d-none');
            } else {
                postponedDateGroup.classList.add('d-none');
                const dateInput = document.getElementById('postponedToDateInput');
                if (dateInput) dateInput.value = '';
            }
        });
    }

    // Setup add task form
    const addTaskForm = document.getElementById('addTaskForm');
    if (addTaskForm) {
        addTaskForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());

            try {
                showSpinner();
                await addTask(data);
                
                const modalEl = document.getElementById('addTaskModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
                
                e.target.reset();
                showToast('success', 'تم إضافة المهمة بنجاح');
            } catch (error) {
                showToast('error', 'حدث خطأ أثناء الإضافة');
            } finally {
                hideSpinner();
            }
        });
    }
}

function loadAgendaForDate(dateStr) {
    if (currentUnsubscribe) currentUnsubscribe();
    if (currentTasksUnsubscribe) currentTasksUnsubscribe();

    const displayEl = document.getElementById('agendaDateDisplay');
    const addTaskDateInput = document.getElementById('addTaskDate');
    
    if (displayEl) {
        const date = new Date(dateStr);
        displayEl.innerText = date.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    if (addTaskDateInput) {
        addTaskDateInput.value = dateStr;
    }

    showSpinner();
    currentUnsubscribe = subscribeToDailySessions(new Date(dateStr), (sessions) => {
        renderSessionsTable(sessions);
        updateSessionsStats(sessions);
        hideSpinner();
    });

    currentTasksUnsubscribe = subscribeToDailyTasks(new Date(dateStr), (tasks) => {
        renderTasksList(tasks);
        updateTasksStats(tasks);
    });
}

function updateSessionsStats(sessions) {
    const total = sessions.length;
    const upcoming = sessions.filter(s => s.status === 'Upcoming' || s.status === 'PendingAttendance').length;
    const attended = sessions.filter(s => s.status === 'Attended').length;

    const totalEl = document.getElementById('totalSessionsCount');
    const upcomingEl = document.getElementById('upcomingSessionsCount');
    const attendedEl = document.getElementById('attendedSessionsCount');

    if (totalEl) totalEl.innerText = total;
    if (upcomingEl) upcomingEl.innerText = upcoming;
    if (attendedEl) attendedEl.innerText = attended;
}

function updateTasksStats(tasks) {
    const totalEl = document.getElementById('totalTasksCount');
    if (totalEl) totalEl.innerText = tasks.length;
}

let sessionsCache = [];

function renderSessionsTable(sessions) {
    sessionsCache = sessions; // Cache for edit lookup
    const tbody = document.getElementById('sessionsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-5"><i class="fas fa-calendar-times fa-3x mb-3 d-block opacity-25"></i>لا توجد جلسات مجدولة لهذا اليوم</td></tr>';
        return;
    }

    sessions.forEach(session => {
        let statusBadge = '';
        switch(session.status) {
            case 'Upcoming':
            case 'PendingAttendance':
                statusBadge = '<span class="badge bg-warning text-dark">بانتظار الحضور</span>';
                break;
            case 'Attended':
                statusBadge = '<span class="badge bg-success">تم الحضور</span>';
                break;
            case 'Postponed':
                statusBadge = '<span class="badge bg-danger">تم التأجيل</span>';
                break;
            default:
                statusBadge = `<span class="badge bg-secondary">${session.status}</span>`;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="fw-bold text-primary">${session.rollNumber || '---'}</td>
            <td>${session.caseNo || '---'}</td>
            <td>${session.clientName || '---'}</td>
            <td>
                <div class="small fw-bold">${session.court || '---'}</div>
                <div class="small text-muted">${session.circuit || '---'}</div>
            </td>
            <td>${statusBadge}</td>
            <td class="text-truncate" style="max-width: 200px;" title="${session.decision}">${session.decision || '---'}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="window.editSessionStatus('${session.id}')">
                    <i class="fas fa-edit"></i> تحديث
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

window.editSessionStatus = function(id) {
    const session = sessionsCache.find(s => s.id === id);
    if (!session) return;

    const form = document.getElementById('updateSessionForm');
    if (!form) return;

    form.id.value = session.id;
    form.status.value = session.status || 'PendingAttendance';
    form.decision.value = session.decision || '';

    // Reset postponed date input visibility and value
    const postponedDateGroup = document.getElementById('postponedDateGroup');
    const dateInput = document.getElementById('postponedToDateInput');
    if (postponedDateGroup) postponedDateGroup.classList.add('d-none');
    if (dateInput) dateInput.value = '';

    const modal = new bootstrap.Modal(document.getElementById('updateSessionModal'));
    modal.show();
};

function renderTasksList(tasks) {
    const listBody = document.getElementById('tasksListBody');
    if (!listBody) return;

    listBody.innerHTML = '';

    if (tasks.length === 0) {
        listBody.innerHTML = '<div class="p-4 text-center text-muted"><i class="fas fa-tasks fa-2x mb-2 d-block opacity-25"></i>لا توجد مهام مكتبية</div>';
        return;
    }

    tasks.forEach(task => {
        const item = document.createElement('div');
        item.className = `list-group-item list-group-item-action border-start border-4 ${task.status === 'Completed' ? 'border-success opacity-75' : 'border-warning'}`;
        
        const typeLabels = {
            'Consultation': 'استشارة',
            'Contract Drafting': 'صياغة عقد',
            'Inspection': 'معاينة',
            'Other': 'أخرى'
        };

        item.innerHTML = `
            <div class="d-flex w-100 justify-content-between align-items-center">
                <h6 class="mb-1 text-truncate" style="max-width: 80%;">${task.title}</h6>
                <div class="dropdown">
                    <button class="btn btn-sm btn-link text-muted" data-bs-toggle="dropdown"><i class="fas fa-ellipsis-v"></i></button>
                    <ul class="dropdown-menu dropdown-menu-end">
                        <li><a class="dropdown-item" href="javascript:void(0)" onclick="window.toggleTaskStatus('${task.id}', '${task.status}')">
                            ${task.status === 'Completed' ? 'إعادة كمهمة حالية' : 'تحديد كمكتمل'}
                        </a></li>
                        <li><a class="dropdown-item text-danger" href="javascript:void(0)" onclick="window.deleteTaskUI('${task.id}')">حذف</a></li>
                    </ul>
                </div>
            </div>
            <div class="d-flex justify-content-between align-items-center mt-1">
                <small class="text-primary"><i class="fas fa-tag me-1"></i> ${typeLabels[task.type] || task.type}</small>
                <small class="text-muted">${task.tempClientName || 'بدون عميل'}</small>
            </div>
        `;
        listBody.appendChild(item);
    });
}

window.toggleTaskStatus = async function(id, currentStatus) {
    try {
        const newStatus = currentStatus === 'Completed' ? 'Pending' : 'Completed';
        await updateTask(id, { status: newStatus });
        showToast('success', 'تم تحديث حالة المهمة');
    } catch (error) {
        showToast('error', 'فشل التحديث');
    }
};

window.deleteTaskUI = async function(id) {
    if (confirm('هل أنت متأكد من حذف هذه المهمة؟')) {
        try {
            await deleteTask(id);
            showToast('success', 'تم حذف المهمة');
        } catch (error) {
            showToast('error', 'فشل الحذف');
        }
    }
};
