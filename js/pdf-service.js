/** 
 * PDF Service for generating professional Arabic reports
 * Uses ArabicReshaper and RTL reversal for proper rendering in jsPDF.
 */

// Amiri-Regular Base64 (Subset for performance, in a real app use the full font)
const AMIRI_FONT_BASE64 = "AAEAAAAPAIAAAwBWRkZUTXVY6mAAADY8AAAAHEdERWYAKwALAAA2HAAAAB5HUE9T8G70/AAANjwAAAK8R1NVQi8yXisAADkYAAAALm9zMmS9Xm8EAAAAnAAAAGJj bWFw8K/v3wAAArwAAAL8Z2FzcAAAABAAAA4cAAAACGdseWYeS89mAAAFDAAAMGxoZWFkCOj0uAAAALwAAAA2aGhlYQ7VBu0AAADYAAAAJGhtdHgX1AI4AAABKAAAACRsb2Nh AKQAnAAAFCgAAAAWbWF4cAAnAF0AAAFMAAAAIG5hbWUvS4z8AAAnLAAABCJwb3N0/58AXgAADfwAAAAgcHJlcGhl6fgAAAncAAAAZAAAAAEAAAAAxtY7SAAAAADOK9Y8 AAAAAc4r1jwAAQAAAA4AAAAAAAAAAQAAAAFvYm0ABAAAAAAAAAABAAAAAQAAAAAAAQAAAAEAAAAAAAAAAQAAAAEAAAAAAAABAAAAAQAAAAAAAQAAAAEAAAAAAAABAAAA AQAAAAAAAQAAAAEAAAAAAAABAAAAAQAAAAAAAQAAAAEAAAAAAAABAAAAAQAAAAAAAQAAAAEAAAAAAAABAAAAAQAAAAAAAQAAAAEAAAAAAAABAAAAAQAAAAAAAQAA";

/**
 * Helper to fix Arabic text (Reshape + RTL Reverse)
 */
function fixArabic(text) {
    if (!text) return "";
    // 1. Reshape characters (joining)
    const reshaped = window.arabicReshaper.reshape(text);
    // 2. Reverse for jsPDF (RTL workaround)
    return reshaped.split('').reverse().join('');
}

/**
 * Setup jsPDF with Arabic Font
 */
function setupDoc() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });

    // Register Amiri Font
    doc.addFileToVFS('Amiri-Regular.ttf', AMIRI_FONT_BASE64);
    doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
    doc.setFont('Amiri');

    return doc;
}

/**
 * Generate a professional header
 */
async function addHeader(doc, title) {
    const { getProfile } = await import('./auth.js');
    const profile = await getProfile();
    const officeName = profile.success ? profile.data.officeName || profile.data.lawyerName : "مكتب المحاماة";

    doc.setFontSize(18);
    doc.text(fixArabic(officeName), 105, 15, { align: 'center' });

    doc.setFontSize(12);
    doc.text(fixArabic(`التاريخ: ${new Date().toLocaleDateString('ar-EG')}`), 20, 25);

    doc.setFontSize(22);
    doc.setTextColor(41, 128, 185);
    doc.text(fixArabic(title), 105, 35, { align: 'center' });

    doc.setDrawColor(200, 200, 200);
    doc.line(20, 40, 190, 40);
}

export async function generatePDF(title, headers, data, fileName) {
    const doc = setupDoc();
    await addHeader(doc, title);

    // Process headers and data for Arabic
    const fixedHeaders = headers.map(h => fixArabic(h));
    const fixedData = data.map(row => row.map(cell => fixArabic(String(cell))));

    doc.autoTable({
        head: [fixedHeaders],
        body: fixedData,
        startY: 50,
        styles: {
            font: 'Amiri',
            halign: 'right',
            fontSize: 10,
            cellPadding: 3
        },
        headStyles: {
            fillColor: [41, 128, 185],
            textColor: 255,
            cellPadding: 4
        },
        columnStyles: {
            0: { halign: 'right' }
        },
        theme: 'striped'
    });

    doc.save(`${fileName}.pdf`);
}

export async function generateAccountStatementPDF(clientData, cases, history) {
    const doc = setupDoc();
    await addHeader(doc, 'كشف حساب عميل');

    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(fixArabic(`العميل: ${clientData.name || '---'}`), 190, 55, { align: 'right' });
    doc.text(fixArabic(`رقم التوكيل: ${clientData.poa || '---'}`), 190, 65, { align: 'right' });

    // Cases Table
    const caseHeaders = ['رقم القضية', 'إجمالي الأتعاب', 'المحصل', 'المتبقي'].map(h => fixArabic(h));
    const caseData = cases.map(c => [
        c.caseNo,
        c.totalFees + " ج.م",
        c.paidAmount + " ج.م",
        c.remainingBalance + " ج.م"
    ].map(fixArabic));

    doc.autoTable({
        head: [caseHeaders],
        body: caseData,
        startY: 75,
        styles: { font: 'Amiri', halign: 'right' },
        headStyles: { fillColor: [52, 73, 94] }
    });

    // History Table
    doc.text(fixArabic('سجل المدفوعات'), 190, doc.lastAutoTable.finalY + 15, { align: 'right' });

    const historyHeaders = ['التاريخ', 'رقم القضية', 'المبلغ'].map(h => fixArabic(h));
    const historyData = history.map(h => [h.date, h.caseNo, h.amount + " ج.م"].map(fixArabic));

    doc.autoTable({
        head: [historyHeaders],
        body: historyData,
        startY: doc.lastAutoTable.finalY + 20,
        styles: { font: 'Amiri', halign: 'right' },
        headStyles: { fillColor: [127, 140, 141] }
    });

    doc.save(`statement_${clientData.poa || 'client'}.pdf`);
}
