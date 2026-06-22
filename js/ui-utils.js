export function showToast(type, message, errorObj = null) {
    if (errorObj) {
        console.error(`[LawyerSystem Error] ${message}:`, errorObj);
    }

    Swal.fire({
        icon: type,
        title: message,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
    });
}

// Reusable SweetAlert2 Confirmation Dialog
export async function showConfirmDialog(title, text) {
    const result = await Swal.fire({
        title: title,
        text: text,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'نعم',
        cancelButtonText: 'إلغاء',
        customClass: {
            popup: 'font-tajawal'
        }
    });
    return result.isConfirmed;
}

export function showSpinner() {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'position-fixed top-0 start-0 w-100 h-100 bg-light d-flex justify-content-center align-items-center';
        overlay.style.zIndex = '3000';
        overlay.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">جاري التحميل...</span></div>';
        document.body.appendChild(overlay);
    }
    overlay.classList.remove('d-none');
    overlay.classList.add('d-flex');
}

export function hideSpinner() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('d-flex');
        overlay.classList.add('d-none');
    }
}

// Format currency to EGP
export function formatCurrency(amount) {
    const num = parseFloat(amount);
    if (isNaN(num)) return '0.00 ج.م';

    return new Intl.NumberFormat('ar-EG', {
        style: 'currency',
        currency: 'EGP',
        minimumFractionDigits: 2
    }).format(num);
}

// Generate professional Empty State HTML for tables
export function getEmptyStateHTML(message, iconClass = 'fas fa-inbox') {
    return `
        <tr>
            <td colspan="100%" class="text-center py-5">
                <div class="d-flex flex-column align-items-center justify-content-center text-muted">
                    <i class="${iconClass} fa-3x mb-3 text-secondary" style="opacity: 0.5;"></i>
                    <h5 class="fw-normal mb-0">${message}</h5>
                </div>
            </td>
        </tr>
    `;
}

// Global function to show pending fees details in a modal
export async function showPendingFeesDetails() {
    const { getPendingFeesDetails } = await import('./db-services.js');
    const tbody = document.getElementById('pendingFeesTableBody');
    const modalEl = document.getElementById('pendingFeesModal');

    if (!tbody || !modalEl) return;

    try {
        // Show modal immediately with a spinner in the body
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        tbody.innerHTML = `
            <tr>
                <td colspan="100%" class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">جاري التحميل...</span>
                    </div>
                </td>
            </tr>
        `;
        modal.show();

        const pendingFees = await getPendingFeesDetails();
        tbody.innerHTML = '';

        if (pendingFees.length === 0) {
            tbody.innerHTML = getEmptyStateHTML('لا توجد أتعاب متبقية', 'fas fa-hand-holding-usd');
        } else {
            pendingFees.forEach(fee => {
                const phoneLink = fee.clientPhone ?
                    `<a href="tel:${fee.clientPhone}" class="text-decoration-none"><i class="fas fa-phone-alt me-1"></i> ${fee.clientPhone}</a>` :
                    '<span class="text-muted">غير متوفر</span>';

                tbody.innerHTML += `
                    <tr>
                        <td data-label="رقم القضية">${fee.caseNo}</td>
                        <td data-label="اسم العميل">${fee.clientName}</td>
                        <td data-label="رقم الموبايل">${phoneLink}</td>
                        <td data-label="المحكمة">${fee.court || '---'}</td>
                        <td data-label="إجمالي الأتعاب">${formatCurrency(fee.totalFees)}</td>
                        <td data-label="المبلغ المدفوع">${formatCurrency(fee.paidAmount)}</td>
                        <td data-label="المبلغ المتبقي"><strong class="text-danger">${formatCurrency(fee.remainingBalance)}</strong></td>
                        <td data-label="الحالة">${fee.status || 'Active'}</td>
                    </tr>
                `;
            });
        }
    } catch (error) {
        console.error('Error loading pending fees details:', error);
        showToast('error', 'حدث خطأ في تحميل تفاصيل الأتعاب');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }
}

// Attach to window for onclick handlers in HTML
window.showPendingFeesDetails = showPendingFeesDetails;

// Format a Firestore Timestamp or Date object to locale string
export function formatDate(date) {
    if (!date) return '---';
    const d = date.toDate ? date.toDate() : new Date(date);
    if (isNaN(d.getTime())) return '---';
    return d.toLocaleDateString('ar-EG');
}
