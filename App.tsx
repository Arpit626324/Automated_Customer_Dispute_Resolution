import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, MessageSquareText, FilePenLine, ShieldCheck, History, LogOut, Lock, User } from 'lucide-react';
import { ClaimForm } from './components/ClaimForm';
import { ChatInterface } from './components/ChatInterface';
import { AdminDashboard } from './components/AdminDashboard';
import { UserHistory } from './components/UserHistory';

// --- Authentication & Role Management ---

type UserRole = 'user' | 'admin' | null;

const LoginScreen = ({ onLogin }: { onLogin: (role: UserRole) => void }) => {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-8 text-center bg-slate-50 border-b border-slate-100">
           <div className="mx-auto w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
             <ShieldCheck size={32} />
           </div>
           <h1 className="text-2xl font-bold text-slate-900">ARC-DRX</h1>
           <p className="text-slate-500">Autonomous Dispute Resolution</p>
        </div>
        <div className="p-8 space-y-4">
          <button 
            onClick={() => onLogin('user')}
            className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:ring-1 hover:ring-blue-500 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="bg-blue-100 p-2 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <User size={24} />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-slate-900">User Login</h3>
                <p className="text-xs text-slate-500">Submit claims & view history</p>
              </div>
            </div>
            <span className="text-slate-300 group-hover:text-blue-500">→</span>
          </button>

          <button 
             onClick={() => onLogin('admin')}
             className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-slate-800 hover:ring-1 hover:ring-slate-800 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="bg-slate-100 p-2 rounded-lg text-slate-600 group-hover:bg-slate-800 group-hover:text-white transition-colors">
                <Lock size={24} />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-slate-900">Admin Login</h3>
                <p className="text-xs text-slate-500">Monitor dashboards & risks</p>
              </div>
            </div>
            <span className="text-slate-300 group-hover:text-slate-800">→</span>
          </button>
        </div>
        <div className="p-4 bg-slate-50 text-center text-xs text-slate-400">
          Secure Identity Verification System
        </div>
      </div>
    </div>
  );
};

// --- Layouts ---

const Sidebar = ({ role, onLogout }: { role: 'user' | 'admin', onLogout: () => void }) => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed top-0 left-0 h-screen w-64 bg-slate-900 text-slate-300 hidden md:flex flex-col border-r border-slate-800 z-50">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <ShieldCheck className="text-blue-500" />
          ARC-DRX
        </h1>
        <p className="text-xs text-slate-500 mt-1 capitalize">{role} Portal</p>
      </div>

      <div className="p-4 space-y-1 flex-1">
        {role === 'user' ? (
          <>
            <Link to="/user/form" className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('/user/form') ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}>
              <FilePenLine size={20} />
              <span>Submit Claim</span>
            </Link>
            <Link to="/user/chat" className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('/user/chat') ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}>
              <MessageSquareText size={20} />
              <span>AI Assistant</span>
            </Link>
            <Link to="/user/history" className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('/user/history') ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}>
              <History size={20} />
              <span>Claim History</span>
            </Link>
          </>
        ) : (
          <Link to="/admin/dashboard" className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('/admin/dashboard') ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </Link>
        )}
      </div>
      
      <div className="p-4 border-t border-slate-800">
        <button 
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </nav>
  );
};

const MobileNav = ({ role }: { role: 'user' | 'admin' }) => {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex justify-around p-3 z-50">
       {role === 'user' ? (
         <>
          <Link to="/user/form" className="text-slate-400 hover:text-white p-2"><FilePenLine /></Link>
          <Link to="/user/chat" className="text-slate-400 hover:text-white p-2"><MessageSquareText /></Link>
          <Link to="/user/history" className="text-slate-400 hover:text-white p-2"><History /></Link>
         </>
       ) : (
         <Link to="/admin/dashboard" className="text-slate-400 hover:text-white p-2"><LayoutDashboard /></Link>
       )}
    </div>
  );
};

// --- Main App Logic ---

export default function App() {
  const [role, setRole] = useState<UserRole>(null);

  if (!role) {
    return <LoginScreen onLogin={setRole} />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-slate-50">
        <Sidebar role={role} onLogout={() => setRole(null)} />
        
        <main className="md:ml-64 p-4 md:p-8 pb-24 md:pb-8 max-w-7xl mx-auto">
           {/* Mobile Header */}
           <div className="md:hidden mb-6 flex items-center justify-between">
             <div className="flex items-center gap-2 text-slate-900 font-bold text-xl">
               <ShieldCheck className="text-blue-600" />
               ARC-DRX
             </div>
             <button onClick={() => setRole(null)} className="text-slate-500"><LogOut size={20}/></button>
           </div>

          <Routes>
            {role === 'user' ? (
              <>
                <Route path="/user/form" element={<ClaimForm />} />
                <Route path="/user/chat" element={<ChatInterface />} />
                <Route path="/user/history" element={<UserHistory />} />
                <Route path="*" element={<Navigate to="/user/form" replace />} />
              </>
            ) : (
              <>
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
              </>
            )}
          </Routes>
        </main>
        
        <MobileNav role={role} />
      </div>
    </Router>
  );
}