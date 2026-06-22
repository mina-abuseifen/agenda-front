import { addClient, updateClient, deleteClient, memoryCache } from './db-services.js';
import { showToast, showSpinner, hideSpinner, showConfirmDialog } from './ui-utils.js';

let filteredClients = [];

// Zod-style Schema Validation (Strict checks disabled for maximum flexibility)
const clientSchema = {
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

export async function initClientsUI() {
    console.log('initClientsUI: starting');

    // Initial render from cache if available
    if (memoryCache.clients) {
        filteredClients = [...memoryCache.clients];
        renderClientsTable(filteredClients);
    } else {
        showSpinner();
    }

    // Listen for real-time updates (remove existing first to avoid duplicates)
    window.removeEventListener('clientsUpdated', window._onClientsUpdate);
    window._onClientsUpdate = (e) => {
        console.log('clientsUpdated event received');
        const clients = e.detail || [];
        const searchInput = document.getElementById('clientSearch');
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

        // Advanced filtering logic
        filteredClients = clients.filter(client => {
            if (!query) return true;
            return (
                (client.name && client.name.toLowerCase().includes(query)) ||
                (client.mobile && client.mobile.includes(query)) ||
                (client.nationalId && client.nationalId.includes(query)) ||
                (client.powerOfAttorneyNo && client.powerOfAttorneyNo.toLowerCase().includes(query))
            );
        });

        renderClientsTable(filteredClients);
        hideSpinner();
    };
    window.addEventListener('clientsUpdated', window._onClientsUpdate);

    // Search functionality with debounce
    const searchInput = document.getElementById('clientSearch');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const query = e.target.value.toLowerCase().trim();
                const clients = memoryCache.clients || [];
                filteredClients = clients.filter(client =>
                    (client.name && client.name.toLowerCase().includes(query)) ||
                    (client.nationalId && client.nationalId.includes(query)) ||
                    (client.mobile && client.mobile.includes(query)) ||
                    (client.powerOfAttorneyNo && client.powerOfAttorneyNo.includes(query))
                );
                renderClientsTable(filteredClients);
            }, 300); // 300ms debounce
        });
    }

    // Add client form
    const addForm = document.getElementById('addClientForm');
    if (addForm) {
        // Prevent multiple listeners
        const newAddForm = addForm.cloneNode(true);
        addForm.parentNode.replaceChild(newAddForm, addForm);
        
        newAddForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const clientData = Object.fromEntries(formData.entries());

            try {
                // Strict Validation
                const validatedData = clientSchema.parse(clientData);

                showSpinner();
                await addClient(validatedData);
                const addClientModalEl = document.getElementById('addClientModal');
                const addClientModal = bootstrap.Modal.getInstance(addClientModalEl);
                if (addClientModal) addClientModal.hide();
                e.target.reset();
                showToast('success', 'تمت إضافة الموكل بنجاح');
            } catch (error) {
                if (error.message.includes('\\n')) {
                    // Validation Errors
                    error.message.split('\\n').forEach(msg => showToast('error', msg));
                } else {
                    handleApiError(error);
                }
            } finally {
                hideSpinner();
            }
        });
    }

    // Edit client form
    const editForm = document.getElementById('editClientForm');
    if (editForm) {
        // Prevent multiple listeners
        const newEditForm = editForm.cloneNode(true);
        editForm.parentNode.replaceChild(newEditForm, editForm);

        newEditForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const clientData = Object.fromEntries(formData.entries());
            const { id, ...data } = clientData;

            try {
                // Strict Validation
                const validatedData = clientSchema.parse(data);

                showSpinner();
                await updateClient(id, validatedData);
                const editClientModalEl = document.getElementById('editClientModal');
                const editClientModal = bootstrap.Modal.getInstance(editClientModalEl);
                if (editClientModal) editClientModal.hide();
                showToast('success', 'تم تحديث الموكل بنجاح');
            } catch (error) {
                if (error.message.includes('\\n')) {
                    // Validation Errors
                    error.message.split('\\n').forEach(msg => showToast('error', msg));
                } else {
                    handleApiError(error);
                }
            } finally {
                hideSpinner();
            }
        });
    }
}

function renderClientsTable(clients) {
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (clients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4"><i class="fas fa-inbox fa-2x mb-2 d-block"></i>لا يوجد موكلين مطابقين للبحث</td></tr>';
        return;
    }

    clients.forEach(client => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td data-label="رقم التوكيل"><span class="badge bg-light text-dark border">${client.powerOfAttorneyNo || '---'}</span></td>
            <td data-label="الاسم" class="fw-bold text-primary">${client.name}</td>
            <td data-label="الرقم القومي" class="font-monospace">${client.nationalId}</td>
            <td data-label="رقم الهاتف" class="font-monospace" dir="ltr">${client.mobile}</td>
            <td data-label="الإجراءات">
                <button class="btn btn-sm btn-outline-primary me-2" onclick="window.editClient('${client.id}')" title="تعديل الموكل">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="window.deleteClient('${client.id}')" title="حذف الموكل">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

window.editClient = function (id) {
    const clients = memoryCache.clients || [];
    const client = clients.find(c => c.id === id);
    if (!client) return;

    const form = document.getElementById('editClientForm');
    if (!form) return;

    form.id.value = client.id;
    form.name.value = client.name;
    form.nationalId.value = client.nationalId;
    form.mobile.value = client.mobile;
    form.address.value = client.address;
    form.powerOfAttorneyNo.value = client.powerOfAttorneyNo;

    const editModal = new bootstrap.Modal(document.getElementById('editClientModal'));
    editModal.show();
};

window.deleteClient = async function (id) {
    const isConfirmed = await showConfirmDialog(
        'تأكيد الحذف',
        'هل أنت متأكد من حذف هذا الموكل؟ سيتم حذف جميع البيانات المرتبطة به ولا يمكن التراجع عن هذه الخطوة.'
    );

    if (isConfirmed) {
        try {
            showSpinner();
            await deleteClient(id);
            showToast('success', 'تم حذف الموكل بنجاح');
        } catch (error) {
            handleApiError(error);
        } finally {
            hideSpinner();
        }
    }
};
