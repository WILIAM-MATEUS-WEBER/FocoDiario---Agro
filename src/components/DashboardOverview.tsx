import React, { useEffect, useState } from 'react';
import { ShieldAlert, TrendingUp, DollarSign, ListTodo, Calendar, AlertTriangle, RefreshCw } from 'lucide-react';
import { User, Mensalidade, ChickBatch } from '../types';
import { apiFetch } from '../utils/api';

interface DashboardOverviewProps {
  user: User;
  onNavigate: (tab: string) => void;
}

interface AlertNotification {
  id: string;
  mensalidadeId: string;
  name: string;
  value: number;
  dueDay: number;
  daysLeft: number;
  type: 'warning_2_days' | 'urgent_1_day' | 'today';
  message: string;
}

export default function DashboardOverview({ user, onNavigate }: DashboardOverviewProps) {
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const [bills, setBills] = useState<Mensalidade[]>([]);
  const [batches, setBatches] = useState<ChickBatch[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (user.role === 'admin') {
        // Fetch alerts
        const resAlerts = await apiFetch('/api/notifications');
        const dataAlerts = await resAlerts.json();
        setAlerts(dataAlerts);

        // Fetch mensalidades
        const resBills = await apiFetch('/api/mensalidades');
        const dataBills = await resBills.json();
        setBills(dataBills);
      }

      // Fetch chick batches
      const resBatches = await apiFetch('/api/chicks/batches');
      const dataBatches = await resBatches.json();
      setBatches(dataBatches);
    } catch (error) {
      console.error('Erro ao buscar resumo do dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const pendingCount = bills.filter(b => b.status === 'pending' || b.status === 'waiting_bill').length;
  const currentBatch = batches.find(b => b.status === 'open');
  const activeOrdersCount = currentBatch ? currentBatch.orders.length : 0;
  const currentTotalChicks = currentBatch 
    ? currentBatch.orders.reduce((sum, order) => {
        return sum + order.quantities.reduce((inner, item) => inner + item.quantity, 0);
      }, 0)
    : 0;

  return (
    <div className="space-y-8" id="dashboard-overview">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 border border-neutral-200 rounded-xl shadow-xs" id="greeting-banner">
        <div>
          <h2 className="text-2xl font-bold font-sans text-neutral-900">
            Olá, {user.name}! 🌾
          </h2>
          <p className="text-sm text-neutral-500 mt-1 font-sans">
            Você está acessando como <strong className="text-neutral-800 capitalize">{user.role === 'admin' ? 'Administrador' : 'Funcionário'}</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="dash-refresh-btn"
            onClick={fetchData}
            disabled={loading}
            className="p-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition-colors border border-neutral-200 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Sincronizar
          </button>
          <span className="text-xs text-neutral-400 font-mono">
            Última atualização: {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* PAINEL DE NOTIFICAÇÕES (CRON SIMULATION) - EXCLUSIVO PARA ADMINISTRADORES */}
      {user.role === 'admin' && (
        <div className="bg-white border border-neutral-200 rounded-xl shadow-xs overflow-hidden" id="notification-card">
          <div className="px-6 py-4 bg-red-50 border-b border-red-100/60 flex items-center gap-2 text-red-800">
            <AlertTriangle size={20} className="text-red-600 shrink-0" />
            <h3 className="text-sm font-bold uppercase tracking-wider font-sans">
              Alertas de Mensalidades Próximas ao Vencimento
            </h3>
          </div>
          <div className="p-6 divide-y divide-neutral-100">
            {alerts.length === 0 ? (
              <div className="py-4 text-center text-neutral-500 text-sm" id="no-alerts-msg">
                ✅ Nenhuma mensalidade vencendo amanhã ou nos próximos 2 dias. Tudo sob controle!
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  id={alert.id}
                  className={`py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                    alert.type === 'today' 
                      ? 'bg-red-50/50 px-3 rounded-lg border-l-4 border-red-500' 
                      : alert.type === 'urgent_1_day' 
                      ? 'bg-amber-50/50 px-3 rounded-lg border-l-4 border-amber-500' 
                      : 'bg-yellow-50/30 px-3 rounded-lg border-l-4 border-yellow-400'
                  }`}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-neutral-950 font-sans">{alert.message}</p>
                    <p className="text-xs text-neutral-500 font-mono">
                      Dia do vencimento configurado: {alert.dueDay} • Seção: {alert.name}
                    </p>
                  </div>
                  <button
                    id={`alert-action-${alert.mensalidadeId}`}
                    onClick={() => onNavigate('mensalidades')}
                    className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer text-center"
                  >
                    Anexar Boleto
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="px-6 py-3 bg-neutral-50 border-t border-neutral-100 text-xs text-neutral-400 font-sans">
            🔔 O sistema calcula alertas automaticamente 2 dias e 1 dia antes da data de vencimento parametrizada.
          </div>
        </div>
      )}

      {/* METRIC CARD GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="dashboard-metrics-grid">
        <div 
          id="metric-kanban"
          onClick={() => onNavigate('kanban')}
          className="bg-white p-6 border border-neutral-200 rounded-xl hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-neutral-100 text-neutral-900 rounded-lg group-hover:bg-neutral-900 group-hover:text-white transition-colors">
              <ListTodo size={24} />
            </span>
            <span className="text-xs text-neutral-400 font-mono">Organização Diária</span>
          </div>
          <h3 className="text-neutral-500 text-sm font-medium font-sans">Organizar Tarefas</h3>
          <p className="text-3xl font-extrabold text-neutral-950 mt-1 font-sans">Kanban</p>
          <div className="text-xs text-neutral-500 mt-2 flex items-center gap-1">
            <span>Acesse para planejar o seu dia e gerenciar as atividades.</span>
          </div>
        </div>

        <div 
          id="metric-mensalidades"
          onClick={() => (user.role === 'admin' ? onNavigate('mensalidades') : null)}
          className={`bg-white p-6 border border-neutral-200 rounded-xl transition-all ${
            user.role === 'admin' ? 'hover:shadow-md cursor-pointer group' : 'opacity-80 cursor-not-allowed'
          }`}
        >
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <DollarSign size={24} />
            </span>
            <span className="text-xs text-neutral-400 font-mono">Financeiro Recorrente</span>
          </div>
          <h3 className="text-neutral-500 text-sm font-medium font-sans">Mensalidades Pendentes</h3>
          <p className="text-3xl font-extrabold text-neutral-950 mt-1 font-sans">
            {pendingCount} Pendentes
          </p>
          <div className="text-xs text-neutral-500 mt-2">
            {user.role === 'admin' 
              ? 'Clique para gerenciar contratos, carregar boletos ou lançar justificações.'
              : 'Gestão exclusiva de administradores.'
            }
          </div>
        </div>

        <div 
          id="metric-chicks"
          onClick={() => onNavigate('pedidos')}
          className="bg-white p-6 border border-neutral-200 rounded-xl hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-amber-50 text-amber-600 rounded-lg group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <TrendingUp size={24} />
            </span>
            <span className="text-xs text-neutral-400 font-mono">Lote Semanal</span>
          </div>
          <h3 className="text-neutral-500 text-sm font-medium font-sans">Pedidos de Pintos</h3>
          <p className="text-3xl font-extrabold text-neutral-950 mt-1 font-sans">
            {currentBatch ? `${currentTotalChicks} Unidades` : 'Lote Fechado'}
          </p>
          <div className="text-xs text-neutral-500 mt-2">
            {currentBatch 
              ? `Lote aberto com ${activeOrdersCount} clientes cadastrados.`
              : 'Clique para abrir o planejamento do novo lote semanal.'
            }
          </div>
        </div>
      </div>
    </div>
  );
}
