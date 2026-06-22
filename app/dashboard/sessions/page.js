'use client';
import { useState, useEffect } from 'react';
import { subscribeToDailySessions, updateSession } from '../../../js/features/sessions/sessions-service.js';
import { subscribeToDailyTasks, addTask, updateTask, deleteTask } from '../../../js/features/tasks/tasks-service.js';

export default function SessionsPage() {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [sessions, setSessions] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        setLoading(true);
        setError(null);

        let unsubSessions = () => {};
        let unsubTasks = () => {};

        try {
            unsubSessions = subscribeToDailySessions(date, (data) => {
                setSessions(data);
                setLoading(false);
            });

            unsubTasks = subscribeToDailyTasks(date, (data) => {
                setTasks(data);
            });
        } catch (err) {
            console.error("API fetch error:", err);
            setError("فشل في تحميل البيانات. يرجى التأكد من إعدادات الخادم.");
            setLoading(false);
        }

        return () => {
            unsubSessions();
            unsubTasks();
        };
    }, [date]);

    const handleToggleTask = async (task) => {
        try {
            await updateTask(task.id, { status: task.status === 'Completed' ? 'Pending' : 'Completed' });
        } catch (err) {
            console.error("Error updating task:", err);
        }
    };

    const handleDeleteTask = async (id) => {
        if (confirm('هل أنت متأكد من حذف هذه المهمة؟')) {
            try {
                await deleteTask(id);
            } catch (err) {
                console.error("Error deleting task:", err);
            }
        }
    };

    if (error) {
        return <div className="alert alert-danger">{error}</div>;
    }

    return (
        <div className="container-fluid fade-in">
            <div className="row mb-4 align-items-center">
                <div className="col-md-6">
                    <h3 className="mb-0">الأجندة اليومية</h3>
                </div>
                <div className="col-md-6 text-end">
                    <input 
                        type="date" 
                        className="form-control d-inline-block w-auto" 
                        value={date} 
                        onChange={(e) => setDate(e.target.value)} 
                    />
                </div>
            </div>

            {loading ? (
                <div className="text-center py-5">
                    <div className="spinner-border text-primary"></div>
                    <p className="mt-2 text-muted">جاري تحميل أجندة اليوم...</p>
                </div>
            ) : (
                <div className="row g-4">
                    {/* Court Sessions */}
                    <div className="col-lg-8">
                        <div className="card shadow-sm border-0">
                            <div className="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
                                <h5 className="mb-0 text-primary"><i className="fas fa-gavel me-2"></i> جلسات المحكمة</h5>
                                <span className="badge bg-primary rounded-pill">{sessions.length} جلسات</span>
                            </div>
                            <div className="card-body p-0">
                                <div className="table-responsive">
                                    <table className="table table-hover mb-0">
                                        <thead className="bg-light">
                                            <tr>
                                                <th>الرقم</th>
                                                <th>الموكل</th>
                                                <th>المحكمة</th>
                                                <th>الحالة</th>
                                                <th>القرار</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sessions.length === 0 ? (
                                                <tr><td colSpan="5" className="text-center py-4 text-muted">لا توجد جلسات مجدولة لهذا اليوم</td></tr>
                                            ) : (
                                                sessions.map(s => (
                                                    <tr key={s.id}>
                                                        <td>{s.caseNo}</td>
                                                        <td>{s.clientName}</td>
                                                        <td>{s.court}</td>
                                                        <td>
                                                            <span className={`badge ${s.status === 'Attended' ? 'bg-success' : 'bg-warning text-dark'}`}>
                                                                {s.status === 'Attended' ? 'تم الحضور' : 'قادمة'}
                                                            </span>
                                                        </td>
                                                        <td>{s.decision || '---'}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Office Tasks */}
                    <div className="col-lg-4">
                        <div className="card shadow-sm border-0">
                            <div className="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
                                <h5 className="mb-0 text-success"><i className="fas fa-tasks me-2"></i> مهام المكتب</h5>
                                <span className="badge bg-success rounded-pill">{tasks.length} مهام</span>
                            </div>
                            <div className="card-body">
                                <div className="list-group list-group-flush">
                                    {tasks.length === 0 ? (
                                        <p className="text-center py-3 text-muted">لا توجد مهام مكتبية اليوم</p>
                                    ) : (
                                        tasks.map(t => (
                                            <div key={t.id} className="list-group-item px-0 py-3 border-bottom-dashed">
                                                <div className="d-flex justify-content-between align-items-start">
                                                    <div className="form-check">
                                                        <input 
                                                            className="form-check-input" 
                                                            type="checkbox" 
                                                            checked={t.status === 'Completed'} 
                                                            onChange={() => handleToggleTask(t)}
                                                        />
                                                        <label className={`form-check-label ${t.status === 'Completed' ? 'text-decoration-line-through text-muted' : 'fw-bold'}`}>
                                                            {t.title}
                                                        </label>
                                                        <div className="small text-muted">{t.type} {t.tempClientName ? `- ${t.tempClientName}` : ''}</div>
                                                    </div>
                                                    <button onClick={() => handleDeleteTask(t.id)} className="btn btn-sm btn-outline-danger border-0">
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
