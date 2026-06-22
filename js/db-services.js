import { refreshAllSessions } from './features/sessions/sessions-service.js';
import { apiRequest } from './api-client.js';

// --- Global Listener Registry ---
const activeListeners = [];
export const memoryCache = {
    clients: null,
    cases: null,
    sessions: null,
    tasks: null,
    transactions: null,
    stats: null
};

let isListening = false;

function stripProtectedFields(data = {}) {
    const { id, ownerId, createdAt, ...safeData } = data;
    return safeData;
}

function requireText(value, fieldName, minLength = 1) {
    const text = String(value || '').trim();
    if (text.length < minLength) throw new Error(`${fieldName} is required`);
    return text;
}

function optionalText(value) {
    return String(value || '').trim();
}

function parseMoney(value, fieldName, required = false) {
    if ((value === undefined || value === null || value === '') && !required) return 0;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`${fieldName} must be a valid positive number`);
    return amount;
}

function validateClientData(data) {
    return {
        name: requireText(data.name, 'Client name', 2),
        nationalId: optionalText(data.nationalId),
        mobile: optionalText(data.mobile),
        address: optionalText(data.address),
        powerOfAttorneyNo: optionalText(data.powerOfAttorneyNo)
    };
}

function normalizeClient(client) {
    return {
        id: client.id,
        name: client.name || '',
        nationalId: client.nationalId || '',
        mobile: client.mobile || '',
        address: client.address || '',
        powerOfAttorneyNo: client.powerOfAttorneyNo || '',
        createdAt: client.createdAt,
        updatedAt: client.updatedAt
    };
}

function normalizeCase(caseItem) {
    return {
        id: caseItem.id,
        clientId: caseItem.clientId,
        parentCaseId: caseItem.parentCaseId || null,
        caseNo: caseItem.caseNo || '',
        clientName: caseItem.clientName || '',
        powerOfAttorneyNo: caseItem.powerOfAttorneyNo || '',
        policeReportNo: caseItem.policeReportNo || '',
        date: caseItem.date || '',
        fileNo: caseItem.fileNo || '',
        caseType: caseItem.caseType || '',
        court: caseItem.court || '',
        circuit: caseItem.circuit || '',
        plaintiff: caseItem.plaintiff || '',
        defendant: caseItem.defendant || '',
        opposingCounsel: caseItem.opposingCounsel || '',
        hearingDate: caseItem.hearingDate || '',
        decision: caseItem.decision || '',
        nextHearingRequirements: caseItem.nextHearingRequirements || '',
        totalFees: caseItem.totalFees ?? 0,
        paidAmount: caseItem.paidAmount ?? 0,
        remainingBalance: caseItem.remainingBalance ?? 0,
        status: caseItem.status || 'Active',
        level: caseItem.level || 'Primary',
        archiveNo: caseItem.archiveNo || '',
        archivedAt: caseItem.archivedAt || null,
        createdAt: caseItem.createdAt,
        updatedAt: caseItem.updatedAt
    };
}

function normalizeTimelineEvent(event) {
    return {
        id: event.id,
        caseId: event.caseId,
        date: event.date,
        type: event.eventType || event.type || 'NoteAdded',
        eventType: event.eventType || event.type || 'NoteAdded',
        title: event.title || '',
        description: event.description || '',
        relatedSessionId: event.relatedSessionId || null,
        relatedDocumentId: event.relatedDocumentId || null,
        relatedPaymentId: event.relatedPaymentId || null,
        createdByUserId: event.createdByUserId || null,
        createdAt: event.createdAt
    };
}

function toCaseRequest(data) {
    const validated = validateCaseData(data);

    return {
        caseNo: validated.caseNo,
        clientId: validated.clientId,
        policeReportNo: validated.policeReportNo || null,
        date: validated.date || null,
        fileNo: validated.fileNo || null,
        caseType: validated.caseType || null,
        court: validated.court || null,
        circuit: validated.circuit || null,
        plaintiff: validated.plaintiff || null,
        defendant: validated.defendant || null,
        opposingCounsel: validated.opposingCounsel || null,
        hearingDate: validated.hearingDate || null,
        decision: validated.decision || null,
        nextHearingRequirements: validated.nextHearingRequirements || null,
        status: validated.status || 'Active',
        level: validated.level || 'Primary',
        totalFees: Number(validated.totalFees) || 0,
        paidAmount: Number(validated.paidAmount) || 0
    };
}

async function refreshClientsCache(dispatchEvent = true) {
    const clients = await apiRequest('/api/clients');
    memoryCache.clients = clients.map(normalizeClient);
    if (dispatchEvent) {
        window.dispatchEvent(new CustomEvent('clientsUpdated', { detail: memoryCache.clients }));
    }
    return memoryCache.clients;
}

export async function refreshCasesCache(dispatchEvent = true) {
    const cases = await apiRequest('/api/cases?includeArchived=true');
    memoryCache.cases = cases.map(normalizeCase);
    if (dispatchEvent) {
        window.dispatchEvent(new CustomEvent('casesUpdated', { detail: memoryCache.cases }));
        updateGlobalStats();
    }
    return memoryCache.cases;
}

function validateCaseData(data) {
    const totalFees = parseMoney(data.totalFees, 'Total fees');
    const paidAmount = parseMoney(data.paidAmount, 'Paid amount');
    if (paidAmount > totalFees) throw new Error("Paid amount cannot exceed total fees");

    return {
        ...stripProtectedFields(data),
        caseNo: requireText(data.caseNo, 'Case number', 1),
        clientId: requireText(data.clientId, 'Client', 1),
        clientName: requireText(data.clientName, 'Client name', 1),
        powerOfAttorneyNo: optionalText(data.powerOfAttorneyNo),
        totalFees: totalFees.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        remainingBalance: Math.max(0, totalFees - paidAmount).toFixed(2),
        status: data.status || 'Active'
    };
}

function validatePaymentData(data) {
    return {
        ...stripProtectedFields(data),
        caseId: requireText(data.caseId, 'Case', 1),
        caseNo: optionalText(data.caseNo),
        clientName: optionalText(data.clientName),
        amount: parseMoney(data.amount, 'Payment amount', true),
        paymentDate: requireText(data.paymentDate, 'Payment date', 1),
        paymentMethod: requireText(data.paymentMethod, 'Payment method', 1),
        notes: optionalText(data.notes),
        description: optionalText(data.description)
    };
}

function validateExpenseData(data) {
    return {
        ...stripProtectedFields(data),
        category: requireText(data.category, 'Expense category', 1),
        amount: parseMoney(data.amount, 'Expense amount', true),
        date: requireText(data.date, 'Expense date', 1),
        caseId: data.caseId || null,
        caseNo: optionalText(data.caseNo),
        clientName: optionalText(data.clientName),
        expenseName: requireText(data.expenseName, 'Expense name', 3),
        description: optionalText(data.description)
    };
}

export function clearAllListeners() {
    console.log(`Clearing ${activeListeners.length} active Firestore listeners...`);
    activeListeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    activeListeners.length = 0; // Clear the array

    // Clear cache
    memoryCache.clients = null;
    memoryCache.cases = null;
    memoryCache.sessions = null;
    memoryCache.tasks = null;
    memoryCache.transactions = null;
    memoryCache.stats = null;
    isListening = false;
}

export function startGlobalListeners() {
    if (isListening) {
        console.log('db-services: Listeners already active, skipping...');
        return;
    }
    console.log('db-services: Starting global listeners');
    isListening = true;
    subscribeClients((data) => {
        memoryCache.clients = data;
        window.dispatchEvent(new CustomEvent('clientsUpdated', { detail: data }));
        
        // Recalculate stats whenever clients change
        updateGlobalStats();
    });

    subscribeCases((data) => {
        memoryCache.cases = data;
        window.dispatchEvent(new CustomEvent('casesUpdated', { detail: data }));

        // Recalculate stats whenever cases change
        updateGlobalStats();
    });

    refreshAllSessions(false)
        .then((data) => {
            memoryCache.sessions = data;
            window.dispatchEvent(new CustomEvent('sessionsUpdated', { detail: data }));
            updateGlobalStats();
        })
        .catch(error => console.error('sessions refresh error:', error));

    refreshTransactionsCache().catch(error => console.error('transactions refresh error:', error));
}

async function updateGlobalStats() {
    try {
        if (memoryCache.clients && memoryCache.cases) {
            const dashboardStats = await getDashboardStats();
            const financialSummary = await getFinancialSummary();

            // Merge both into stats
            const stats = { ...dashboardStats, ...financialSummary };
            memoryCache.stats = stats;
            window.dispatchEvent(new CustomEvent('statsUpdated', { detail: stats }));
        }
    } catch (e) {
        console.error('Stats update error:', e);
    }
}

// --- Client CRUD ---

export async function addClient(data) {
    try {
        const validatedData = validateClientData(data);
        const client = await apiRequest('/api/clients', {
            method: 'POST',
            body: validatedData
        });

        await refreshClientsCache();
        return { id: client.id, ...normalizeClient(client) };
    } catch (error) {
        console.error('addClient error:', error);
        throw error;
    }
}

export async function getClients() {
    if (memoryCache.clients) return memoryCache.clients;

    try {
        const clients = await refreshClientsCache();
        console.log('getClients: fetched clients length =', clients.length);
        return clients;
    } catch (error) {
        console.error('getClients error:', error);
        throw error;
    }
}

export function subscribeClients(callback) {
    try {
        refreshClientsCache(false)
            .then((clients) => {
                console.log('subscribeClients: API clients length =', clients.length);
                callback(clients);
            })
            .catch((error) => {
                console.error('subscribeClients error:', error);
            });

        return () => { };
    } catch (error) {
        console.error('subscribeClients setup error:', error);
        return () => { };
    }
}

export async function updateClient(id, data) {
    try {
        console.log('updateClient: id =', id, 'data =', data);
        await apiRequest(`/api/clients/${id}`, {
            method: 'PUT',
            body: validateClientData(data)
        });
        await refreshClientsCache();
        console.log('updateClient: updated successfully');
    } catch (error) {
        console.error('updateClient error:', error);
        throw error;
    }
}

export async function deleteClient(id) {
    try {
        console.log('deleteClient: id =', id);
        await apiRequest(`/api/clients/${id}`, { method: 'DELETE' });
        await refreshClientsCache();
        console.log('deleteClient: deleted successfully');
    } catch (error) {
        console.error('deleteClient error:', error);
        throw error;
    }
}

// --- Case CRUD ---

/**
 * @typedef {Object} Case
 * @property {string} id
 * @property {string} caseNo
 * @property {string} clientId
 * @property {string} clientName
 * @property {string} powerOfAttorneyNo
 * @property {string} caseType
 * @property {string} court
 * @property {string} status - 'Active', 'Closed', 'Archived'
 * @property {string} level - 'Primary', 'Appeal', 'Supreme'
 * @property {string|null} parentCaseId - ID of the previous level case
 * @property {number} totalFees
 * @property {number} paidAmount
 * @property {number} remainingBalance
 * @property {string} ownerId
 * @property {Object} createdAt - Firestore Timestamp
 */

export async function addCase(data) {
    try {
        const caseFile = await apiRequest('/api/cases', {
            method: 'POST',
            body: toCaseRequest(data)
        });

        await Promise.all([
            refreshCasesCache(),
            refreshAllSessions()
        ]);
        return { id: caseFile.id, ...normalizeCase(caseFile) };
    } catch (error) {
        console.error('addCase error:', error);
        throw error;
    }
}

/**
 * Creates an appeal or next level case based on a parent case.
 * @param {string} parentCaseId - The ID of the original case.
 * @param {string} nextLevel - e.g., 'Appeal', 'Supreme'.
 */
export async function createAppealCase(parentCaseId, nextLevel) {
    try {
        const caseFile = await apiRequest(`/api/cases/${parentCaseId}/appeals`, {
            method: 'POST',
            body: { level: nextLevel }
        });

        await refreshCasesCache();
        console.log('createAppealCase: created appeal with ID =', caseFile.id);
        return { id: caseFile.id, ...normalizeCase(caseFile) };
    } catch (error) {
        console.error('createAppealCase error:', error);
        throw error;
    }
}

export async function getCases() {
    if (memoryCache.cases) return memoryCache.cases;

    try {
        const cases = await refreshCasesCache();
        console.log('getCases: fetched cases length =', cases.length);
        return cases;
    } catch (error) {
        console.error('getCases error:', error);
        throw error;
    }
}

export async function getCase(id) {
    try {
        const cachedCase = memoryCache.cases?.find(caseItem => caseItem.id === id);
        if (cachedCase) return cachedCase;

        const caseFile = await apiRequest(`/api/cases/${id}`);
        return normalizeCase(caseFile);
    } catch (error) {
        console.error('getCase error:', error);
        throw error;
    }
}

export function subscribeCases(callback) {
    try {
        refreshCasesCache(false)
            .then((cases) => {
                console.log('subscribeCases: API cases length =', cases.length);
                callback(cases);
            })
            .catch((error) => {
                console.error('subscribeCases error:', error);
            });

        return () => { };
    } catch (error) {
        console.error('subscribeCases setup error:', error);
        return () => { };
    }
}

export async function updateCase(id, data) {
    try {
        console.log('updateCase: id =', id, 'data =', data);
        await apiRequest(`/api/cases/${id}`, {
            method: 'PUT',
            body: toCaseRequest(data)
        });
        await Promise.all([
            refreshCasesCache(),
            refreshAllSessions()
        ]);
        console.log('updateCase: updated successfully');
    } catch (error) {
        console.error('updateCase error:', error);
        throw error;
    }
}

export async function deleteCase(id) {
    try {
        console.log('deleteCase: id =', id);
        await apiRequest(`/api/cases/${id}`, { method: 'DELETE' });
        await Promise.all([
            refreshCasesCache(),
            refreshAllSessions()
        ]);
        console.log('deleteCase: deleted successfully');
    } catch (error) {
        console.error('deleteCase error:', error);
        throw error;
    }
}
export async function getDashboardStats() {
    try {
        // Get data from memoryCache or fetch if empty
        const cases = memoryCache.cases || await getCases();
        const clients = memoryCache.clients || await getClients();

        // Calculate stats
        const totalClients = clients.length;
        const activeCases = cases.filter(c => c.status === 'Active' || c.status === 'Ù†Ø´Ø·Ø©').length;

        // Calculate total pending fees from cached cases
        let totalPendingFees = 0;
        cases.forEach(c => {
            if ((c.status === 'Active' || c.status === 'Ù†Ø´Ø·Ø©') && c.remainingBalance) {
                totalPendingFees += parseFloat(c.remainingBalance) || 0;
            }
        });

        // Get upcoming hearings (next 7 days)
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time to start of day
        const next7Days = new Date(today);
        next7Days.setDate(today.getDate() + 7);

        console.log('getDashboardStats: checking upcoming hearings for', cases.length, 'cases');
        console.log('getDashboardStats: today =', today.toISOString().split('T')[0], 'next7Days =', next7Days.toISOString().split('T')[0]);

        const upcomingHearings = cases
            .filter(caseItem => {
                if (!caseItem.hearingDate) {
                    console.log('getDashboardStats: case', caseItem.caseNo, 'has no hearingDate');
                    return false;
                }

                let hearingDate;
                try {
                    // Handle different date formats (string, Date object, Firestore timestamp)
                    if (typeof caseItem.hearingDate === 'string') {
                        hearingDate = new Date(caseItem.hearingDate);
                    } else if (caseItem.hearingDate && caseItem.hearingDate.toDate) {
                        // Firestore timestamp
                        hearingDate = caseItem.hearingDate.toDate();
                    } else {
                        hearingDate = new Date(caseItem.hearingDate);
                    }

                    if (isNaN(hearingDate.getTime())) {
                        console.log('getDashboardStats: invalid date for case', caseItem.caseNo, caseItem.hearingDate);
                        return false;
                    }

                    hearingDate.setHours(0, 0, 0, 0); // Reset time for date comparison
                    const isUpcoming = hearingDate >= today && hearingDate <= next7Days;
                    console.log('getDashboardStats: case', caseItem.caseNo, 'hearingDate =', hearingDate.toISOString().split('T')[0], 'isUpcoming =', isUpcoming);
                    return isUpcoming;
                } catch (error) {
                    console.warn('Invalid date format for case:', caseItem.caseNo, caseItem.hearingDate, error);
                    return false;
                }
            })
            .map(caseItem => {
                let hearingDate;
                try {
                    if (typeof caseItem.hearingDate === 'string') {
                        hearingDate = new Date(caseItem.hearingDate);
                    } else if (caseItem.hearingDate && caseItem.hearingDate.toDate) {
                        hearingDate = caseItem.hearingDate.toDate();
                    } else {
                        hearingDate = new Date(caseItem.hearingDate);
                    }
                } catch (error) {
                    hearingDate = new Date();
                }

                return {
                    caseNo: caseItem.caseNo,
                    court: caseItem.court,
                    nextHearingDate: formatDate(hearingDate),
                    nextHearingDateIso: toISODate(hearingDate)
                };
            })
            .sort((a, b) => {
                try {
                    return new Date(a.nextHearingDate.split('/').reverse().join('-')) - new Date(b.nextHearingDate.split('/').reverse().join('-'));
                } catch (error) {
                    return 0;
                }
            });

        const stats = {
            totalClients,
            activeCases,
            totalPendingFees: totalPendingFees.toFixed(2),
            upcomingHearings
        };

        console.log('getDashboardStats: calculated stats =', stats);
        return stats;

    } catch (error) {
        console.error('getDashboardStats error:', error);
        throw error;
    }
}

// Helper function for date formatting
function formatDate(date) {
    if (!date) return '---';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function toISODate(date) {
    if (!date || isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
}

export async function getPendingFeesDetails() {
    try {
        const pendingFees = await apiRequest('/api/finance/pending-fees');
        return (pendingFees || []).map(fee => ({
            caseId: fee.caseId,
            caseNo: fee.caseNo || '',
            clientName: fee.clientName || '',
            clientPhone: fee.clientPhone || '',
            powerOfAttorneyNo: fee.powerOfAttorneyNo || '',
            remainingBalance: Number(fee.remainingBalance) || 0,
            totalFees: Number(fee.totalFees) || 0,
            paidAmount: Number(fee.paidAmount) || 0,
            court: fee.court || '',
            status: fee.status || 'Active'
        })).sort((a, b) => b.remainingBalance - a.remainingBalance);

    } catch (error) {
        console.error('getPendingFeesDetails error:', error);
        throw error;
    }
}

// --- Remaining Fees Total ---
export async function getRemainingFeesTotal() {
    try {
        const summary = await apiRequest('/api/finance/summary');
        return Number(summary.pendingFees ?? summary.totalPendingFees ?? 0);
    } catch (error) {
        console.error('getRemainingFeesTotal error:', error);
        throw error;
    }
}

// --- Financial Transactions CRUD ---

function normalizeFinanceTransaction(transaction = {}) {
    const caseNo = transaction.caseNo || transaction.caseNoSnapshot || '';
    const clientName = transaction.clientName || transaction.clientNameSnapshot || '';
    const transactionDate = transaction.transactionDate || transaction.expenseDate || transaction.paymentDate || transaction.createdAt || '';
    const createdAt = transaction.createdAt || transactionDate || new Date().toISOString();

    return {
        id: transaction.id,
        type: transaction.type || '',
        amount: Number(transaction.amount) || 0,
        caseId: transaction.caseId || null,
        caseNo,
        clientName,
        paymentDate: transaction.paymentDate || '',
        paymentMethod: transaction.paymentMethod || '',
        category: transaction.category || '',
        transactionDate,
        expenseDate: transaction.expenseDate || transaction.transactionDate || '',
        expenseName: transaction.expenseName || '',
        description: transaction.description || '',
        notes: transaction.notes || '',
        status: transaction.status || 'posted',
        originalTransactionId: transaction.originalTransactionId || null,
        reversesType: transaction.reversesType || null,
        reversedAt: transaction.reversedAt || null,
        reversalTransactionId: transaction.reversalTransactionId || null,
        financeLogId: transaction.financeLogId || null,
        transactionId: transaction.id,
        date: transaction.paymentDate || transaction.transactionDate || createdAt,
        createdAt,
        updatedAt: transaction.updatedAt || null
    };
}

async function refreshTransactionsCache(shouldDispatch = true) {
    const response = await apiRequest('/api/finance/transactions?page=1&pageSize=100');
    const items = Array.isArray(response) ? response : (response.items || []);
    const transactions = items.map(normalizeFinanceTransaction);

    memoryCache.transactions = transactions;
    if (shouldDispatch) {
        window.dispatchEvent(new CustomEvent('transactionsUpdated', { detail: transactions }));
        updateGlobalStats();
    }

    return transactions;
}

function buildPaymentRequest(data = {}) {
    return {
        caseId: data.caseId,
        amount: Number(data.amount) || 0,
        paymentDate: data.paymentDate || data.date,
        paymentMethod: data.paymentMethod || null,
        description: data.description || null,
        notes: data.notes || null
    };
}

function buildExpenseRequest(data = {}) {
    return {
        caseId: data.caseId || null,
        amount: Number(data.amount) || 0,
        category: data.category || '',
        expenseDate: data.expenseDate || data.date,
        expenseName: data.expenseName || data.description || '',
        description: data.description || data.expenseName || null,
        notes: data.notes || null
    };
}

export async function addPayment(data) {
    try {
        const transaction = await apiRequest('/api/finance/payments', {
            method: 'POST',
            body: buildPaymentRequest(data)
        });

        await Promise.all([
            refreshTransactionsCache(),
            refreshCasesCache()
        ]);

        return normalizeFinanceTransaction(transaction);
    } catch (error) {
        console.error('addPayment error:', error);
        throw error;
    }
}

export async function addExpense(data) {
    try {
        const transaction = await apiRequest('/api/finance/expenses', {
            method: 'POST',
            body: buildExpenseRequest(data)
        });

        await refreshTransactionsCache();
        return normalizeFinanceTransaction(transaction);
    } catch (error) {
        console.error('addExpense error:', error);
        throw error;
    }
}
export async function getFinancialTransactions() {
    try {
        return await refreshTransactionsCache(false);
    } catch (error) {
        console.error('getFinancialTransactions error:', error);
        throw error;
    }
}

export async function getFinancialSummary() {
    try {
        const [apiSummary, cases] = await Promise.all([
            apiRequest('/api/finance/summary'),
            memoryCache.cases ? Promise.resolve(memoryCache.cases) : getCases()
        ]);

        let totalRevenue = 0; // Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª (Sum totalFees)

        cases.forEach(c => {
            totalRevenue += parseFloat(c.totalFees) || 0;
        });

        const totalPaid = Number(apiSummary.totalPaid ?? apiSummary.totalPayments ?? 0);
        const totalRemaining = Number(apiSummary.totalRemaining ?? apiSummary.pendingFees ?? apiSummary.totalPendingFees ?? 0);
        const totalExpenses = Number(apiSummary.totalExpenses ?? 0);
        const netProfit = Number(apiSummary.netProfit ?? apiSummary.net ?? (totalPaid - totalExpenses));

        const summary = {
            totalRevenue: totalRevenue.toFixed(2),
            totalPaid: totalPaid.toFixed(2),
            totalRemaining: totalRemaining.toFixed(2),
            totalExpenses: totalExpenses.toFixed(2),
            netProfit: netProfit.toFixed(2),
            postedPaymentCount: apiSummary.postedPaymentCount || 0,
            postedExpenseCount: apiSummary.postedExpenseCount || 0
        };

        return summary;
    } catch (error) {
        console.error('getFinancialSummary error:', error);
        throw error;
    }
}

/**
 * Fetch client account statement: cases and payment logs for a specific POA
 */
export async function getClientAccountStatement(poa) {
    try {
        const statement = await apiRequest(`/api/finance/account-statement?powerOfAttorneyNo=${encodeURIComponent(poa || '')}`);
        const cases = memoryCache.cases || await getCases();
        const clientCases = cases.filter(c => c.powerOfAttorneyNo === poa);
        const fallbackCase = {
            id: '',
            caseNo: '',
            clientName: statement.clientName || '',
            powerOfAttorneyNo: statement.powerOfAttorneyNo || poa,
            totalFees: Number(statement.totalFees) || 0,
            paidAmount: Number(statement.totalPayments) || 0,
            remainingBalance: Number(statement.remainingBalance) || 0
        };
        const transactions = (statement.transactions || []).map(normalizeFinanceTransaction);

        return {
            cases: clientCases.length > 0 ? clientCases : [fallbackCase],
            paymentHistory: transactions.map(transaction => ({
                ...transaction,
                date: transaction.paymentDate || transaction.transactionDate || transaction.createdAt,
                type: transaction.type === 'payment' ? 'income' : transaction.type
            })).sort((a, b) => {
                const dayA = new Date(a.date || 0).getTime();
                const dayB = new Date(b.date || 0).getTime();
                return dayB - dayA;
            }),
            summary: statement
        };
    } catch (error) {
        console.error('getClientAccountStatement error:', error);
        throw error;
    }
}

export async function deleteFinancialTransaction(id) {
    try {
        const reversal = await apiRequest(`/api/finance/transactions/${id}/reverse`, {
            method: 'POST',
            body: { notes: 'Reversed from frontend' }
        });

        await Promise.all([
            refreshTransactionsCache(),
            refreshCasesCache()
        ]);

        return normalizeFinanceTransaction(reversal);
    } catch (error) {
        console.error('deleteFinancialTransaction error:', error);
        throw error;
    }
}
// --- Case Timeline & Archiving Services ---

export async function addTimelineEvent(caseId, eventData) {
    try {
        const eventDate = eventData.date instanceof Date ? eventData.date : new Date(eventData.date || Date.now());

        const timelineEvent = await apiRequest(`/api/cases/${caseId}/timeline/note`, {
            method: 'POST',
            body: {
                date: isNaN(eventDate.getTime()) ? new Date().toISOString() : eventDate.toISOString(),
                title: eventData.title || 'Manual case update',
                description: eventData.description || ''
            }
        });

        return normalizeTimelineEvent(timelineEvent);
    } catch (error) {
        console.error('addTimelineEvent error:', error);
        throw error;
    }
}

export async function getTimelineByCase(caseId) {
    try {
        const timeline = await apiRequest(`/api/cases/${caseId}/timeline`);

        return timeline.map(normalizeTimelineEvent).sort((a, b) => {
            const timeA = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
            const timeB = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
            return timeB - timeA;
        });
    } catch (error) {
        console.error('getTimelineByCase error:', error);
        throw error;
    }
}

export async function archiveCase(caseId, archiveNo) {
    try {
        await apiRequest(`/api/cases/${caseId}/archive`, {
            method: 'POST',
            body: { archiveNo: requireText(archiveNo, 'Archive number', 1) }
        });

        await Promise.all([
            refreshCasesCache(),
            refreshAllSessions()
        ]);
        console.log('archiveCase: Case archived successfully');
    } catch (error) {
        console.error('archiveCase error:', error);
        throw error;
    }
}

export async function restoreCase(caseId) {
    try {
        await apiRequest(`/api/cases/${caseId}/restore`, { method: 'POST' });

        await Promise.all([
            refreshCasesCache(),
            refreshAllSessions()
        ]);
        console.log('restoreCase: Case restored successfully');
    } catch (error) {
        console.error('restoreCase error:', error);
        throw error;
    }
}
