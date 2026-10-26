import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { motion } from 'motion/react';
import { Zap } from 'lucide-react';

import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import Apply from './pages/Apply';
import Careers from './pages/Careers';
import CRMLayout from './components/CRMLayout';
import Dashboard from './pages/Dashboard';
import DashboardCustomizer from './components/admin/DashboardCustomizer';
import PendingApproval from './pages/PendingApproval';
import Clients from './pages/Clients';
import Pipeline from './pages/Pipeline';
import Tasks from './pages/Tasks';
import Chat from './pages/Chat';
import StrategicReport from './pages/StrategicReport';
import Cobranza from './pages/Cobranza';
import SuperAdmin from './pages/SuperAdmin';
import AppearancePanel from './components/admin/AppearancePanel';
import AcademyInternal from './pages/AcademyInternal';
import AcademyExternal from './pages/AcademyExternal';
import DigitalProducts from './pages/DigitalProducts';
import CallSystem from './pages/CallSystem';
import Recruitment from './pages/Recruitment';
import TeamManagement from './pages/TeamManagement';
import Payroll from './pages/Payroll';
import Accounting from './pages/Accounting';
import ClientManagement from './pages/ClientManagement';
import Billing from './pages/Billing';
import Operations from './pages/Operations';
import Marketing from './pages/Marketing';
import Projects from './pages/Projects';
import Reports from './pages/Reports';
import Commissions from './pages/Commissions';
import ClientPortal from './pages/ClientPortal';
import UserPortal from './pages/UserPortal';
import CalendarView from './pages/CalendarView';
import Automations from './pages/Automations';
import StrategyBlog from './pages/StrategyBlog';
import TacticalDeployment from './pages/TacticalDeployment';
import SOPManuals from './pages/SOPManuals';
import MasterForms from './pages/MasterForms';
import Helpdesk from './pages/Helpdesk';
import DocumentDrive from './pages/DocumentDrive';
import SecurityCenter from './pages/SecurityCenter';
import AuditsSGI from './pages/AuditsSGI';
import NervousSystem from './pages/NervousSystem';
import FormTemplates from './pages/FormTemplates';
import Integrations from './pages/Integrations';
import CompanyAuth from './pages/b2b/CompanyAuth';
import CompanyDashboard from './pages/b2b/CompanyDashboard';
import CallCenterAdmin from './pages/CallCenterAdmin';
import RouteGuard from "./components/RouteGuard";
import PermissionGate, { AccessDenied } from "./components/auth/PermissionGate";
import PermissionsManager from "./components/admin/PermissionsManager";
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Guest mode is deliberately in-memory only; stored operator sessions are never restored.
    localStorage.removeItem('kaivincia_operator_session');
    localStorage.removeItem('kaivincia_active_user');
    localStorage.removeItem('kaivincia_guest');

    let unsubUserDoc: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      const sessionConfirmed = sessionStorage.getItem('kaivincia_session_confirmed') === 'true';
      const loginInProgress = sessionStorage.getItem('kaivincia_login_in_progress') === 'true';
      if (currentUser && !sessionConfirmed && !loginInProgress) {
        await signOut(auth).catch(() => undefined);
        setUser(null);
        setUserData(null);
        setLoading(false);
        return;
      }

      if (!currentUser) {
        setUser(null);
        setUserData(null);
        setLoading(false);
        return;
      }

      setUser(currentUser);
      try {
        // Provision/repair the authenticated profile on the trusted server before
        // reading Firestore. This is required for allowlisted SuperAdmins whose
        // legacy profile still has a pending or incorrect role/status.
        const idToken = await currentUser.getIdToken();
        const bootstrapResponse = await fetch('/api/auth/bootstrap-user', {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!bootstrapResponse.ok) {
          const bootstrapError = await bootstrapResponse.text().catch(() => '');
          throw new Error(`User bootstrap failed (${bootstrapResponse.status}): ${bootstrapError.slice(0, 300)}`);
        }

        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUserData(userSnap.data());
        } else {
          setUserData(null);
        }
        unsubUserDoc = onSnapshot(userRef, (docSnap) => {
          setUserData(docSnap.exists() ? docSnap.data() : null);
        }, (error) => {
          console.warn('User data listener warning (handled):', error);
        });
      } catch (authErr) {
        console.error('Error loading user profile:', authErr);
        setUserData(null);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      if (unsubUserDoc) unsubUserDoc();
      unsubscribeAuth();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-page)] relative flex flex-col items-center justify-center overflow-hidden">
        {/* Background stars */}
        <div className="absolute inset-0 z-0 opacity-50">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="w-1 h-1 bg-white rounded-full absolute"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
              }}
              animate={{
                opacity: [0.2, 1, 0.2],
                scale: [1, 1.5, 1],
              }}
              transition={{
                duration: 2 + Math.random() * 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          ))}
        </div>

        {/* Spaceship animation */}
        <div className="relative z-10 flex items-center h-32 w-full max-w-3xl justify-center">
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 flex items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {/* The Text being revealed/formed */}
            <div className="relative overflow-hidden flex items-center">
              <motion.div
                className="absolute inset-y-0 right-0 bg-[var(--bg-page)] z-20 origin-right"
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 2.5, ease: "easeInOut", delay: 0.5 }}
              />
              <h1 className="text-4xl md:text-6xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] via-white to-[var(--accent)] uppercase italic relative z-10">
                Kaivincia Corp
              </h1>
            </div>

            {/* Spaceship shooting */}
            <motion.div
              className="absolute text-[var(--accent)] right-0 z-30"
              initial={{ right: "100%", x: "0%" }}
              animate={{ right: "0%", x: "100%" }}
              transition={{ duration: 2.5, ease: "easeInOut", delay: 0.5 }}
            >
              {/* Laser beam */}
              <motion.div 
                className="absolute right-full top-1/2 -translate-y-1/2 h-0.5 bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]"
                initial={{ width: 0 }}
                animate={{ width: 40 }}
                transition={{ duration: 0.2, repeat: Infinity, repeatType: "reverse" }}
              />
              <svg className="w-12 h-12 rotate-90 drop-shadow-[0_0_15px_rgba(0,240,255,0.8)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
                <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
                <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
              </svg>
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Autorización explícita: normalizar espacios/mayúsculas y denegar por defecto.
  const rawRole = String(userData?.role || 'none').trim().toLowerCase();
  const normalizedRole = ({ sales: 'ventas', agent: 'agente', agente_tlmk: 'tlmk' } as Record<string, string>)[rawRole] || rawRole;
  const normalizedStatus = String(userData?.status || '').trim().toLowerCase();
  const validRoles = ['superadmin', 'admin', 'supervisor', 'agente', 'tlmk', 'ventas', 'ceo', 'gestor', 'alumno', 'rrhh', 'collaborator', 'tutor', 'cliente', 'user'];
  const isManagementRole = ['superadmin', 'admin', 'supervisor'].includes(normalizedRole);
  if (user && (normalizedStatus !== 'approved' || !validRoles.includes(normalizedRole))) {
    return <PendingApproval />;
  }

  const effectiveUserData = userData ? { ...userData, uid: user?.uid || userData.uid } : {
    name: user?.displayName || 'Agente TLMK',
    email: user?.email || 'operador@kaivincia.com',
    role: normalizedRole,
    status: normalizedStatus || 'pending',
    uid: user?.uid
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage onGuestMode={() => {
          // La vista de invitado no otorga acceso al CRM ni crea una sesión autenticada.
        }} />} />
        <Route path="/apply" element={<Apply />} />
        <Route path="/guest-academy" element={<AcademyExternal />} />
        <Route path="/strategy-blog" element={<StrategyBlog />} />
        <Route path="/careers" element={<Careers />} />
        <Route path="/team" element={<Navigate to="/crm/team" />} />
        <Route path="/empresas/login" element={<CompanyAuth initialMode="login" />} />
        <Route path="/empresas/register" element={<CompanyAuth initialMode="register" />} />
        <Route path="/empresas/dashboard" element={<CompanyDashboard />} />
        <Route path="/empresas" element={<Navigate to="/empresas/dashboard" />} />
        <Route path="/login" element={user ? <Navigate to="/crm/dashboard" replace /> : <LoginPage />} />
        
        {/* CRM Routes - Resilient Session Protected by RouteGuard */}
        <Route 
          path="/crm" 
          element={
            <RouteGuard>
              <CRMLayout userData={effectiveUserData} />
            </RouteGuard>
          }
        >
          <Route index element={<Navigate to={normalizedRole === 'alumno' ? "/crm/academy-internal" : (normalizedRole === 'tlmk' || normalizedRole === 'ventas' ? "/crm/pipeline" : "/crm/dashboard")} />} />
          <Route path="dashboard" element={<PermissionGate module="dashboard" userData={effectiveUserData}><Dashboard /></PermissionGate>} />
          <Route path="dashboard/customize" element={<PermissionGate module="dashboard" userData={effectiveUserData}><DashboardCustomizer /></PermissionGate>} />
          <Route path="strategic-report" element={<PermissionGate module="strategicReport" userData={effectiveUserData}><StrategicReport /></PermissionGate>} />
          <Route path="clients" element={<PermissionGate module="clients" userData={effectiveUserData}><Clients /></PermissionGate>} />
          <Route path="pipeline" element={<PermissionGate module="marketing" userData={effectiveUserData}><Pipeline /></PermissionGate>} />
          <Route path="tasks" element={<PermissionGate module="tasks" userData={effectiveUserData}><Tasks /></PermissionGate>} />
          <Route path="calendar" element={<PermissionGate module="calendar" userData={effectiveUserData}><CalendarView /></PermissionGate>} />
          <Route path="chat" element={<PermissionGate module="chat" userData={effectiveUserData}><Chat /></PermissionGate>} />
          <Route path="cobranza" element={<PermissionGate module="cobranza" userData={effectiveUserData}><Cobranza /></PermissionGate>} />
          <Route path="call-center" element={normalizedRole !== 'superadmin' && normalizedRole !== 'admin' ? <Navigate to="/crm/access-denied" replace /> : <PermissionGate module="calls" userData={effectiveUserData}><CallCenterAdmin /></PermissionGate>} />
          
          {/* New Modules */}
          <Route path="superadmin" element={normalizedRole !== 'superadmin' ? <Navigate to="/crm/access-denied" replace /> : <SuperAdmin />} />
          <Route path="permissions" element={normalizedRole !== 'superadmin' ? <Navigate to="/crm/access-denied" replace /> : <PermissionsManager userData={effectiveUserData} />} />
          <Route path="access-denied" element={<AccessDenied />} />
          <Route path="appearance" element={<PermissionGate module="appearance" userData={effectiveUserData}><AppearancePanel /></PermissionGate>} />
          <Route path="automations" element={<PermissionGate module="automations" userData={effectiveUserData}><Automations /></PermissionGate>} />
          <Route path="form-templates" element={<PermissionGate module="formTemplates" userData={effectiveUserData}><FormTemplates /></PermissionGate>} />
          <Route path="integrations" element={<PermissionGate module="integrations" userData={effectiveUserData}><Integrations /></PermissionGate>} />
          <Route path="academy-internal" element={<PermissionGate module="academy" userData={effectiveUserData}><AcademyInternal /></PermissionGate>} />
          <Route path="academy-external" element={<AcademyExternal />} />
          <Route path="digital-products" element={<PermissionGate module="academy" userData={effectiveUserData}><DigitalProducts /></PermissionGate>} />
          <Route path="calls" element={<PermissionGate module="calls" userData={effectiveUserData}><CallSystem /></PermissionGate>} />
          
          {/* Administrativo */}
          <Route path="recruitment" element={<PermissionGate module="recruitment" userData={effectiveUserData}><Recruitment /></PermissionGate>} />
          <Route path="team" element={<PermissionGate module="team" userData={effectiveUserData}><TeamManagement /></PermissionGate>} />
          <Route path="payroll" element={<PermissionGate module="payroll" userData={effectiveUserData}><Payroll /></PermissionGate>} />
          <Route path="accounting" element={<PermissionGate module="accounting" userData={effectiveUserData}><Accounting /></PermissionGate>} />
          <Route path="client-management" element={<PermissionGate module="clients" userData={effectiveUserData}><ClientManagement /></PermissionGate>} />
          <Route path="billing" element={<PermissionGate module="billing" userData={effectiveUserData}><Billing /></PermissionGate>} />
          <Route path="operations" element={<PermissionGate module="operations" userData={effectiveUserData}><Operations /></PermissionGate>} />
          <Route path="marketing" element={<PermissionGate module="marketing" userData={effectiveUserData}><Marketing /></PermissionGate>} />
          <Route path="projects" element={<PermissionGate module="projects" userData={effectiveUserData}><Projects /></PermissionGate>} />
          <Route path="reports" element={<PermissionGate module="reports" userData={effectiveUserData}><Reports /></PermissionGate>} />
          <Route path="commissions" element={<PermissionGate module="reports" userData={effectiveUserData}><Commissions /></PermissionGate>} />
          <Route path="tactical" element={<PermissionGate module="operations" userData={effectiveUserData}><TacticalDeployment /></PermissionGate>} />
          <Route path="manuales" element={<PermissionGate module="academy" userData={effectiveUserData}><SOPManuals /></PermissionGate>} />
          <Route path="turs" element={<PermissionGate module="formTemplates" userData={effectiveUserData}><MasterForms /></PermissionGate>} />
          <Route path="helpdesk" element={<PermissionGate module="helpdesk" userData={effectiveUserData}><Helpdesk /></PermissionGate>} />
          <Route path="drive" element={<PermissionGate module="drive" userData={effectiveUserData}><DocumentDrive /></PermissionGate>} />
          <Route path="audits" element={<PermissionGate module="reports" userData={effectiveUserData}><AuditsSGI /></PermissionGate>} />
          <Route path="security" element={<PermissionGate module="security" userData={effectiveUserData}><SecurityCenter /></PermissionGate>} />
          <Route path="nervous" element={<PermissionGate module="dashboard" userData={effectiveUserData}><NervousSystem /></PermissionGate>} />
          <Route path="strategy-blog" element={<StrategyBlog />} />
          
          {/* Portales */}
          <Route path="client-portal" element={<ClientPortal />} />
          <Route path="user-portal" element={<UserPortal />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
