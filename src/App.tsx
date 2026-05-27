import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import Login from './components/Login';
import DashboardOverview from './components/DashboardOverview';
import KanbanBoard from './components/KanbanBoard';
import Mensalidades from './components/Mensalidades';
import PedidosPintos from './components/PedidosPintos';
import { LayoutDashboard, ListTodo, DollarSign, Milestone, LogOut, CheckSquare, ShieldCheck, UserCheck } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Recupera sessão do usuário do localStorage se existir
  useEffect(() => {
    const storedUser = localStorage.getItem('focodiario_session');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('focodiario_session');
      }
    }
  }, []);

  const handleLoginSuccess = (authenticatedUser: User) => {
    setUser(authenticatedUser);
    localStorage.setItem('focodiario_session', JSON.stringify(authenticatedUser));
    setActiveTab('dashboard'); // Envia para painel inicial
  };

  const handleLogout = () => {
    if (confirm('Deseja realmente sair da sua conta?')) {
      setUser(null);
      localStorage.removeItem('focodiario_session');
      setActiveTab('dashboard');
    }
  };

  // Se o usuário não estiver logado, exibe a tela de login estilizada
  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col font-sans text-neutral-800" id="main-app-layout">
      {/* HEADER PRINCIPAL */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-50 shadow-xs" id="nav-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            
            {/* LOGO */}
            <div className="flex items-center gap-2" id="header-brand">
              <div className="h-9 w-9 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
                F
              </div>
              <div>
                <span className="text-lg font-bold text-neutral-900 tracking-tight font-sans">FocoDiario</span>
                <span className="text-[9px] block text-neutral-400 font-mono tracking-wider uppercase leading-none">Agropecuária</span>
              </div>
            </div>

            {/* TAB SELECT MENU - DESKTOP */}
            <nav className="hidden md:flex space-x-1" id="nav-tabs-desktop">
              <button
                id="tab-btn-dashboard"
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100'
                }`}
              >
                <LayoutDashboard size={14} />
                Painel Inicial
              </button>

              <button
                id="tab-btn-kanban"
                onClick={() => setActiveTab('kanban')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'kanban'
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100'
                }`}
              >
                <ListTodo size={14} />
                Kanban Diário
              </button>

              {user.role === 'admin' && (
                <button
                  id="tab-btn-mensalidades"
                  onClick={() => setActiveTab('mensalidades')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'mensalidades'
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100'
                  }`}
                >
                  <DollarSign size={14} />
                  Contas / Mensalidades
                </button>
              )}

              <button
                id="tab-btn-pedidos"
                onClick={() => setActiveTab('pedidos')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'pedidos'
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100'
                }`}
              >
                <Milestone size={14} />
                Pedidos de Pintos
              </button>
            </nav>

            {/* USER LOGOUT DETAILS */}
            <div className="flex items-center gap-4" id="header-user-status">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-neutral-900 flex items-center justify-end gap-1">
                  {user.role === 'admin' ? (
                    <ShieldCheck size={14} className="text-emerald-600 inline" />
                  ) : (
                    <UserCheck size={14} className="text-blue-500 inline" />
                  )}
                  {user.name}
                </p>
                <span className="text-[10px] text-neutral-400 font-mono capitalize tracking-wide block">
                  Nível: {user.role === 'admin' ? 'Administrador' : 'Funcionário'}
                </span>
              </div>

              <button
                id="btn-logout"
                onClick={handleLogout}
                className="p-2 bg-neutral-100 hover:bg-red-50 hover:text-red-600 text-neutral-500 rounded-lg transition-colors border border-neutral-200 cursor-pointer"
                title="Sair do Sistema"
              >
                <LogOut size={16} />
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* MOBILE TAB BAR */}
      <div className="md:hidden bg-white border-b border-neutral-200 p-2 flex justify-around gap-1 sticky top-[64px] z-45" id="nav-tabs-mobile">
        <button
          id="tab-btn-dash-mobile"
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 py-2 text-center text-[10px] font-bold rounded-md flex flex-col items-center gap-1 transition-colors capitalize ${
            activeTab === 'dashboard' ? 'bg-neutral-900 text-white' : 'text-neutral-500'
          }`}
        >
          <LayoutDashboard size={14} />
          Painel
        </button>
        <button
          id="tab-btn-kanban-mobile"
          onClick={() => setActiveTab('kanban')}
          className={`flex-1 py-2 text-center text-[10px] font-bold rounded-md flex flex-col items-center gap-1 transition-colors capitalize ${
            activeTab === 'kanban' ? 'bg-neutral-900 text-white' : 'text-neutral-500'
          }`}
        >
          <ListTodo size={14} />
          Kanban
        </button>
        {user.role === 'admin' && (
          <button
            id="tab-btn-mens-mobile"
            onClick={() => setActiveTab('mensalidades')}
            className={`flex-1 py-2 text-center text-[10px] font-bold rounded-md flex flex-col items-center gap-1 transition-colors capitalize ${
              activeTab === 'mensalidades' ? 'bg-neutral-900 text-white' : 'text-neutral-500'
            }`}
          >
            <DollarSign size={14} />
            Contas
          </button>
        )}
        <button
          id="tab-btn-pedidos-mobile"
          onClick={() => setActiveTab('pedidos')}
          className={`flex-1 py-2 text-center text-[10px] font-bold rounded-md flex flex-col items-center gap-1 transition-colors capitalize ${
            activeTab === 'pedidos' ? 'bg-neutral-900 text-white' : 'text-neutral-500'
          }`}
        >
          <Milestone size={14} />
          Pintos
        </button>
      </div>

      {/* PAINEL DE CONTEÚDO DIN MICO */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8" id="layout-view-panel">
        <div className="transition-all duration-300">
          {activeTab === 'dashboard' && <DashboardOverview user={user} onNavigate={(tab) => setActiveTab(tab)} />}
          {activeTab === 'kanban' && <KanbanBoard user={user} />}
          {activeTab === 'mensalidades' && <Mensalidades user={user} />}
          {activeTab === 'pedidos' && <PedidosPintos user={user} />}
        </div>
      </main>

      {/* FLOATING FOOTER */}
      <footer className="bg-white border-t border-neutral-200 py-4 mt-12 text-center text-xs text-neutral-400 font-sans" id="app-footer">
        FocoDiario — Copyright © {new Date().getFullYear()} — Todos os direitos reservados.
      </footer>
    </div>
  );
}
