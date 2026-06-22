import { getPendingFeesDetails, addPayment, addExpense, deleteFinancialTransaction, memoryCache, getClientAccountStatement, getFinancialSummary } from './db-services.js';
import { showToast, showSpinner, hideSpinner, formatCurrency, getEmptyStateHTML, showConfirmDialog } from './ui-utils.js';
// We'll dynamically import the pdf-service to keep initial load light

// Zod-style Schema Validation
const paymentSchema = {
    parse: (data) => {
        const errors = [];
        if (!data.caseId) errors.push('يجب اختيار القضية.');
        if (!data.amount || isNaN(data.amount) || data.amount <= 0) errors.push('المبلغ المدفوع يجب أن يكون أكبر من صفر.');
        if (!data.paymentDate) errors.push('تاريخ الدفع مطلوب.');
        if (!data.paymentMethod) errors.push('طريقة الدفع مطلوبة.');
        
        if (errors.length > 0) throw new Error(errors.join('\\n'));
        return data;
    }
};

const expenseSchema = {
    parse: (data) => {
        const errors = [];
        if (!data.expenseName || data.expenseName.trim().length < 3) errors.push('وصف المصروف مطلوب (3 أحرف على الأقل).');
        if (!data.amount || isNaN(data.amount) || data.amount <= 0) errors.push('المبلغ يجب أن يكون أكبر من صفر.');
        if (!data.category) errors.push('تصنيف المصروف مطلوب.');
        if (!data.date) errors.push('تاريخ المصروف مطلوب.');
        
        if (errors.length > 0) throw new Error(errors.join('\\n'));
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

export async function initFinancesUI() {
    console.log('initFinancesUI: starting');

    // Initial render from cache
    if (memoryCache.transactions) {
        renderFinances(memoryCache.transactions);
    } else {
        showSpinner();
    }

    if (memoryCache.cases) {
        populateCaseDropdowns();
    }

    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    const paymentDateInput = document.querySelector('#addPaymentForm input[name="paymentDate"]');
    const expenseDateInput = document.querySelector('#addExpenseForm input[name="expenseDate"]');
    if (paymentDateInput) paymentDateInput.value = today;
    if (expenseDateInput) expenseDateInput.value = today;

    // Listen for real-time updates (remove existing first to avoid duplicates)
    window.removeEventListener('transactionsUpdated', window._onTransactionsUpdate);
    window._onTransactionsUpdate = (e) => {
        console.log('transactionsUpdated event received');
        renderFinances(e.detail || []);
        hideSpinner();
    };
    window.addEventListener('transactionsUpdated', window._onTransactionsUpdate);

    window.removeEventListener('casesUpdated', window._onCasesUpdateFinances);
    window._onCasesUpdateFinances = () => {
        populateCaseDropdowns();
    };
    window.addEventListener('casesUpdated', window._onCasesUpdateFinances);

    // Filter functionality
    const transactionFilter = document.getElementById('transactionFilter');
    if (transactionFilter) {
        transactionFilter.addEventListener('change', (e) => {
            renderFinances(memoryCache.transactions || [], e.target.value);
        });
    }

    // Add Payment Form
    const addPaymentForm = document.getElementById('addPaymentForm');
    if (addPaymentForm) {
        // Prevent multiple listeners
        const newForm = addPaymentForm.cloneNode(true);
        addPaymentForm.parentNode.replaceChild(newForm, addPaymentForm);

        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const caseId = formData.get('caseId');
            const amount = parseFloat(formData.get('amount'));

            try {
                // Strict Validation
                const validatedInput = paymentSchema.parse({
                    caseId: caseId,
                    amount: amount,
                    paymentDate: formData.get('paymentDate'),
                    paymentMethod: formData.get('paymentMethod')
                });

                const cases = memoryCache.cases || [];
                const selectedCase = cases.find(c => c.id === caseId);

                if (!selectedCase) {
                    throw new Error('القضية المختارة غير موجودة');
                }

                // Prevent paying more than remaining
                const remaining = parseFloat(selectedCase.remainingBalance) || 0;
                if (validatedInput.amount > remaining) {
                    throw new Error(`لا يمكن دفع مبلغ (${validatedInput.amount}) أكبر من الأتعاب المتبقية (${remaining})`);
                }
                
                // Prevent payments on closed/archived cases
                if (selectedCase.status && selectedCase.status !== 'Active' && selectedCase.status !== 'نشطة') {
                    throw new Error('لا يمكن إضافة دفعات لقضية مغلقة أو مؤرشفة.');
                }

                const paymentData = {
                    caseId: caseId,
                    caseNo: selectedCase.caseNo || '',
                    clientName: selectedCase.clientName || '',
                    amount: validatedInput.amount,
                    paymentDate: validatedInput.paymentDate,
                    paymentMethod: validatedInput.paymentMethod,
                    notes: formData.get('notes') || '',
                    description: `دفعة من ${selectedCase.clientName || 'عميل'} للقضية ${selectedCase.caseNo || ''}`
                };

                showSpinner();
                await addPayment(paymentData);
                const modal = bootstrap.Modal.getInstance(document.getElementById('addPaymentModal'));
                if (modal) modal.hide();
                e.target.reset();
                showToast('success', 'تم إضافة الدفعة بنجاح');
            } catch (error) {
                if (error.message.includes('\\n')) {
                    error.message.split('\\n').forEach(msg => showToast('error', msg));
                } else if (error.message.includes('لا يمكن')) {
                    showToast('warning', error.message);
                } else {
                    handleApiError(error);
                }
            } finally {
                hideSpinner();
            }
        });
    }

    // Add Expense Form
    const addExpenseForm = document.getElementById('addExpenseForm');
    if (addExpenseForm) {
        const newForm = addExpenseForm.cloneNode(true);
        addExpenseForm.parentNode.replaceChild(newForm, addExpenseForm);

        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const amount = parseFloat(formData.get('amount'));

            try {
                // Strict Validation
                const validatedInput = expenseSchema.parse({
                    expenseName: formData.get('expenseName'),
                    amount: amount,
                    category: formData.get('category'),
                    date: formData.get('expenseDate')
                });

                const caseId = formData.get('caseId');
                let caseInfo = {};
                if (caseId) {
                    const cases = memoryCache.cases || [];
                    const selectedCase = cases.find(c => c.id === caseId);
                    if (selectedCase) {
                        // Prevent expenses on closed/archived cases
                        if (selectedCase.status && selectedCase.status !== 'Active' && selectedCase.status !== 'نشطة') {
                            throw new Error('لا يمكن ربط مصروف بقضية مغلقة أو مؤرشفة.');
                        }
                        caseInfo = {
                            caseNo: selectedCase.caseNo || '',
                            clientName: selectedCase.clientName || ''
                        };
                    }
                }

                const expenseData = {
                    category: validatedInput.category,
                    amount: validatedInput.amount,
                    date: validatedInput.date,
                    caseId: caseId || null,
                    ...caseInfo,
                    expenseName: validatedInput.expenseName,
                    description: validatedInput.expenseName
                };

                showSpinner();
                await addExpense(expenseData);
                const modal = bootstrap.Modal.getInstance(document.getElementById('addExpenseModal'));
                if (modal) modal.hide();
                e.target.reset();
                showToast('success', 'تم إضافة المصروف بنجاح');
            } catch (error) {
                if (error.message.includes('\\n')) {
                    error.message.split('\\n').forEach(msg => showToast('error', msg));
                } else if (error.message.includes('لا يمكن')) {
                    showToast('warning', error.message);
                } else {
                    handleApiError(error);
                }
            } finally {
                hideSpinner();
            }
        });
    }
}

function renderFinances(transactions, filter = 'all') {
    // Update Summary Cards from cache stats
    const summary = memoryCache.stats || {};
    const totalRevenueEl = document.getElementById('totalRevenue');
    const totalPaidEl = document.getElementById('totalPaid');
    const totalRemainingEl = document.getElementById('totalRemaining');
    const netProfitEl = document.getElementById('netProfit');

    if (totalRevenueEl) totalRevenueEl.textContent = formatCurrency(summary.totalRevenue || 0);
    if (totalPaidEl) totalPaidEl.textContent = formatCurrency(summary.totalPaid || 0);
    if (totalRemainingEl) totalRemainingEl.textContent = formatCurrency(summary.totalRemaining || 0);

    if (netProfitEl) {
        const netProfitValue = parseFloat(summary.netProfit) || 0;
        netProfitEl.textContent = formatCurrency(netProfitValue);

        // Dynamic coloring for Net Profit
        const cardBody = netProfitEl.closest('.card');
        if (cardBody) {
            cardBody.classList.remove('bg-primary', 'bg-success', 'bg-danger');
            if (netProfitValue > 0) {
                cardBody.classList.add('bg-success');
            } else if (netProfitValue < 0) {
                cardBody.classList.add('bg-danger');
            } else {
                cardBody.classList.add('bg-primary');
            }
        }
    }

    // Filter transactions
    let filtered = transactions;
    if (filter === 'payments') {
        filtered = transactions.filter(t => t.type === 'payment' || t.type === 'income');
    } else if (filter === 'expenses') {
        filtered = transactions.filter(t => t.type === 'expense');
    }

    const tbody = document.getElementById('transactionsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (filtered.length === 0) {
        const message = filter === 'all' ? 'لا توجد سجلات مالية' :
            filter === 'payments' ? 'لا توجد دفعات' : 'لا توجد مصروفات';
        tbody.innerHTML = getEmptyStateHTML(message, 'fas fa-file-invoice-dollar');
        return;
    }

    filtered.forEach(transaction => {
        const date = transaction.createdAt ? (transaction.createdAt.toDate ? transaction.createdAt.toDate().toLocaleDateString('ar-EG') : new Date(transaction.createdAt).toLocaleDateString('ar-EG')) : 'غير محدد';
        const isPayment = transaction.type === 'payment' || transaction.type === 'income';
        const typeBadge = isPayment ? '<span class="badge bg-success"><i class="fas fa-arrow-down me-1"></i>دفعة / إيراد</span>' : '<span class="badge bg-danger"><i class="fas fa-arrow-up me-1"></i>مصروف</span>';
        const typeClass = isPayment ? 'text-success fw-bold' : 'text-danger fw-bold';
        const amount = transaction.amount ? formatCurrency(transaction.amount) : formatCurrency(0);
        
        // Determine label text
        const labelText = transaction.expenseName || transaction.description || transaction.notes || '-';
        const caseText = transaction.caseNo ? `<span class="badge bg-light text-dark border">${transaction.caseNo}</span>` : '<span class="text-muted">-</span>';

        tbody.innerHTML += `
            <tr>
                <td data-label="التاريخ">${date}</td>
                <td data-label="النوع">${typeBadge}</td>
                <td data-label="الوصف" class="text-truncate" style="max-width: 200px;" title="${labelText}">${labelText}</td>
                <td data-label="رقم القضية">${caseText}</td>
                <td data-label="اسم العميل" class="fw-semibold text-primary">${transaction.clientName || '-'}</td>
                <td class="${typeClass}" data-label="المبلغ">${amount}</td>
                <td data-label="الإجراءات">
                    <button class="btn btn-sm btn-outline-danger" onclick="window.deleteTransaction('${transaction.id}')" title="حذف السجل">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

function populateCaseDropdowns() {
    const cases = memoryCache.cases || [];
    const caseSelects = document.querySelectorAll('select[name="caseId"]');

    caseSelects.forEach(select => {
        const firstOption = select.querySelector('option');
        select.innerHTML = firstOption ? firstOption.outerHTML : '<option value="">اختر القضية...</option>';

        // Sort active cases first, then alphabetically
        const sortedCases = [...cases].sort((a, b) => {
            const aActive = (a.status === 'Active' || a.status === 'نشطة') ? 1 : 0;
            const bActive = (b.status === 'Active' || b.status === 'نشطة') ? 1 : 0;
            if (aActive !== bActive) return bActive - aActive; // Active first
            return (a.caseNo || '').localeCompare(b.caseNo || '', 'ar');
        });

        sortedCases.forEach(caseItem => {
            // Mark closed/archived cases in dropdown
            const isInactive = (caseItem.status !== 'Active' && caseItem.status !== 'نشطة');
            const suffix = isInactive ? ' (مغلقة/مؤرشفة)' : '';
            
            const option = document.createElement('option');
            option.value = caseItem.id;
            option.textContent = `${caseItem.caseNo} - ${caseItem.clientName || 'عميل غير محدد'}${suffix}`;
            if (isInactive) {
                option.disabled = true; // Prevent selecting closed cases for new payments
            }
            select.appendChild(option);
        });
    });
}

// Global functions

window.searchClientStatement = async function () {
    const poa = document.getElementById('clientSearchPOA').value.trim();
    if (!poa) {
        showToast('error', 'يرجى ادخال رقم التوكيل');
        return;
    }

    try {
        showSpinner();
        const data = await getClientAccountStatement(poa);

        const container = document.getElementById('statementResultContainer');
        const exportBtn = document.getElementById('exportStatementBtn');

        if (data.cases.length === 0) {
            showToast('info', 'لا توجد قضايا لهذا العميل');
            container.classList.add('d-none');
            exportBtn.classList.add('d-none');
            return;
        }

        container.classList.remove('d-none');
        exportBtn.classList.remove('d-none');

        // Render Summary
        document.getElementById('statementClientName').textContent = `اسم العميل: ${data.cases[0].clientName}`;
        document.getElementById('statementClientPOA').textContent = `رقم التوكيل: ${poa}`;

        // Render Cases Table
        const tbody = document.getElementById('statementTableBody');
        tbody.innerHTML = '';
        data.cases.forEach(c => {
            tbody.innerHTML += `
                <tr>
                    <td><span class="badge bg-light text-dark border">${c.caseNo}</span></td>
                    <td class="text-primary">${formatCurrency(c.totalFees)}</td>
                    <td class="text-success">${formatCurrency(c.paidAmount)}</td>
                    <td class="text-danger fw-bold">${formatCurrency(c.remainingBalance)}</td>
                </tr>
            `;
        });

        // Render History Table
        const historyBody = document.getElementById('statementHistoryTableBody');
        historyBody.innerHTML = '';
        if (data.paymentHistory.length === 0) {
            historyBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">لا يوجد سجل مدفوعات</td></tr>';
        } else {
            data.paymentHistory.forEach(h => {
                const date = h.date ? new Date(h.date).toLocaleDateString('ar-EG') : '-';
                historyBody.innerHTML += `
                    <tr>
                        <td>${date}</td>
                        <td><span class="badge bg-light text-dark border">${h.caseNo}</span></td>
                        <td class="text-success fw-bold"><i class="fas fa-arrow-down me-1"></i>${formatCurrency(h.amount)}</td>
                        <td>${h.notes || '-'}</td>
                    </tr>
                `;
            });
        }

        window._currentStatementData = data; // Cache for export
    } catch (error) {
        handleApiError(error);
    } finally {
        hideSpinner();
    }
};

window.exportGeneralFinancialPDF = async function () {
    try {
        showSpinner();
        const { generatePDF } = await import('./pdf-service.js');
        const summary = memoryCache.stats || {};

        const title = 'التقرير المالي العام';
        const headers = ['المجال', 'القيمة'];
        const data = [
            ['إجمالي الإيرادات', formatCurrency(summary.totalRevenue)],
            ['إجمالي المحصل', formatCurrency(summary.totalPaid)],
            ['إجمالي المتبقي', formatCurrency(summary.totalRemaining)],
            ['صافي الربح', formatCurrency(summary.netProfit)]
        ];

        await generatePDF(title, headers, data, 'financial_report');
        showToast('success', 'تم تصدير التقرير المالي بنجاح');
    } catch (error) {
        handleApiError(error);
    } finally {
        hideSpinner();
    }
};

window.exportClientStatementPDF = async function () {
    const data = window._currentStatementData;
    if (!data) return;

    try {
        showSpinner();
        const { generateAccountStatementPDF } = await import('./pdf-service.js');

        const clientInfo = {
            name: data.cases[0].clientName,
            poa: data.cases[0].powerOfAttorneyNo
        };

        const caseData = data.cases.map(c => ({
            caseNo: c.caseNo,
            totalFees: formatCurrency(c.totalFees),
            paidAmount: formatCurrency(c.paidAmount),
            remainingBalance: formatCurrency(c.remainingBalance)
        }));

        const historyData = data.paymentHistory.map(h => ({
            date: h.date ? new Date(h.date).toLocaleDateString('ar-EG') : '-',
            caseNo: h.caseNo,
            amount: formatCurrency(h.amount)
        }));

        await generateAccountStatementPDF(clientInfo, caseData, historyData);
        showToast('success', 'تم تصدير كشف الحساب بنجاح');
    } catch (error) {
        handleApiError(error);
    } finally {
        hideSpinner();
    }
};

window.deleteTransaction = async function (id) {
    const isConfirmed = await showConfirmDialog(
        'تأكيد الحذف',
        'هل أنت متأكد من حذف هذه المعاملة المالية؟ سيتم تحديث رصيد القضية المرتبطة وإعادة حساب الإجماليات.'
    );

    if (!isConfirmed) return;

    try {
        showSpinner();
        await deleteFinancialTransaction(id);
        showToast('success', 'تم حذف المعاملة بنجاح');
    } catch (error) {
        handleApiError(error);
    } finally {
        hideSpinner();
    }
};
