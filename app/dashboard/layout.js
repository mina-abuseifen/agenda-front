'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiRequest, clearAuthSession, setStoredUser } from '../../js/api-client.js';
import Link from 'next/link';

export default function DashboardLayout({ children }) {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        let isMounted = true;

        async function checkSession() {
            try {
                const profile = await apiRequest('/api/me');
                if (!isMounted) return;

                setStoredUser(profile);
                setUser({
                    uid: profile.id,
                    email: profile.email,
                    displayName: profile.lawyerName || profile.officeName || profile.email
                });
                setUserData(profile);
                setLoading(false);
            } catch (error) {
                console.error("Error fetching user data:", error);
                clearAuthSession();
                if (isMounted) {
                    router.push('/pages/login.html'); // Fallback to legacy login if Next.js login not ready
                }
            }
        }

        checkSession();

        return () => {
            isMounted = false;
        };
    }, [router]);

    const handleLogout = async () => {
        try {
            try {
                await apiRequest('/api/auth/logout', { method: 'POST' });
            } finally {
                clearAuthSession();
            }
            router.push('/pages/login.html');
        } catch (error) {
            console.error("Logout error:", error);
            clearAuthSession();
            router.push('/pages/login.html');
        }
    };

    if (loading) {
        return (
            <div className="vh-100 d-flex justify-content-center align-items-center bg-light">
                <div className="spinner-border text-primary" role="status"></div>
            </div>
        );
    }

    const navItems = [
        { path: '/dashboard', label: 'الرئيسية', icon: 'fa-home' },
        { path: '/dashboard/clients', label: 'الموكلين', icon: 'fa-users' },
        { path: '/dashboard/cases', label: 'القضايا', icon: 'fa-gavel' },
        { path: '/dashboard/finances', label: 'إدارة الأموال', icon: 'fa-money-bill-wave' },
        { path: '/dashboard/sessions', label: 'الأجندة اليومية', icon: 'fa-calendar-alt' },
    ];

    return (
        <div className="wrapper d-flex">
            {/* Sidebar */}
            <nav id="sidebar" className="bg-navy-blue text-white" style={{ minWidth: '250px', height: '100vh', position: 'fixed', right: 0 }}>
                <div className="sidebar-header p-4" style={{ background: 'var(--navy-blue-dark)' }}>
                    <h4 className="mb-0">مكتب المحاماة</h4>
                </div>
                <ul className="list-unstyled components p-0">
                    {navItems.map((item) => (
                        <li key={item.path} className={pathname === item.path ? 'active' : ''}>
                            <Link href={item.path} className="text-white text-decoration-none d-block p-3">
                                <i className={`fas ${item.icon} me-2`}></i> {item.label}
                            </Link>
                        </li>
                    ))}
                    <li className="mt-4">
                        <button onClick={handleLogout} className="btn btn-link text-white text-decoration-none d-block p-3 w-100 text-start">
                            <i className="fas fa-sign-out-alt me-2"></i> تسجيل الخروج
                        </button>
                    </li>
                </ul>
            </nav>

            {/* Content Area */}
            <div id="content" style={{ width: 'calc(100% - 250px)', marginRight: '250px', minHeight: '100vh' }}>
                <header className="d-flex justify-content-between align-items-center mb-4 sticky-top bg-light p-3 shadow-sm rounded">
                    <h2 className="mb-0 text-primary">
                        {navItems.find(i => i.path === pathname)?.label || 'لوحة التحكم'}
                    </h2>
                    <div className="text-muted">
                        <span>مرحباً بك، {userData?.lawyerName || user.email}</span>
                    </div>
                </header>
                <main className="p-4">
                    {children}
                </main>
            </div>
        </div>
    );
}
