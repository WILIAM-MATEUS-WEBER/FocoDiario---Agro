import React, { useEffect, useState } from 'react';
import { KanbanTask, TaskStatus, User, KanbanHistoryEntry } from '../types';
import { Plus, Check, Play, ArrowRight, ArrowLeft, Archive, Trash2, Calendar, Search, RefreshCw } from 'lucide-react';

interface KanbanBoardProps {
  user: User;
}

const STATUS_COLUMNS: { label: string; value: TaskStatus; color: string; hoverColor: string }[] = [
  { label: 'A Fazer', value: 'todo', color: 'bg-neutral-100 text-neutral-800 border-neutral-300', hoverColor: 'hover:bg-neutral-200' },
  { label: 'Em Andamento', value: 'inprogress', color: 'bg-amber-50 text-amber-800 border-amber-200/60', hoverColor: 'hover:bg-amber-100' },
  { label: 'Pendente', value: 'pending', color: 'bg-rose-50 text-rose-800 border-rose-200/60', hoverColor: 'hover:bg-rose-100' },
  { label: 'Concluído', value: 'completed', color: 'bg-emerald-50 text-emerald-800 border-emerald-200/60', hoverColor: 'hover:bg-emerald-100' }
];

export default function KanbanBoard({ user }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [targetUser, setTargetUser] = useState<User>(user);
  
  // Create mode state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // History state
  const [historySearchDate, setHistorySearchDate] = useState(new Date().toISOString().split('T')[0]);
  const [historyRecords, setHistoryRecords] = useState<KanbanHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isTodayClosed, setIsTodayClosed] = useState(false);

  // Users lookup for admin to swap boards
  const [availableUsers, setAvailableUsers] = useState<User[]>([
    { id: 'u1', username: 'admin', name: 'Administrador (FocoDiario)', role: 'admin' },
    { id: 'u2', username: 'funcionario', name: 'Funcionário Padrão', role: 'employee' }
  ]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kanban?userId=${targetUser.id}`);
      const data = await res.json();
      setTasks(data);
    } catch (e) {
      console.error('Erro ao ler tarefas:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/kanban/history?date=${historySearchDate}`);
      const data = await res.json();
      setHistoryRecords(data);
    } catch (e) {
      console.error('Erro ao ler histórico:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const checkIfTodayIsClosed = async () => {
    try {
      const todayDate = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/kanban/history?date=${todayDate}&userId=${targetUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setIsTodayClosed(data.length > 0);
      }
    } catch (e) {
      console.error('Erro ao checar se hoje esta fechado:', e);
    }
  };

  useEffect(() => {
    loadTasks();
    checkIfTodayIsClosed();
  }, [targetUser]);

  useEffect(() => {
    loadHistory();
  }, [historySearchDate]);

  // Handle adding task
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const response = await fetch('/api/kanban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          description: newDesc,
          status: 'todo',
          userId: targetUser.id,
          userName: targetUser.name
        })
      });

      if (response.ok) {
        setNewTitle('');
        setNewDesc('');
        setShowAddForm(false);
        loadTasks();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Move a task to destination status
  const handleMoveTask = async (taskId: string, currentStatus: TaskStatus, direction: 'forward' | 'backward' | TaskStatus) => {
    let nextStatus: TaskStatus = currentStatus;

    if (direction === 'forward') {
      if (currentStatus === 'todo') nextStatus = 'inprogress';
      else if (currentStatus === 'inprogress') nextStatus = 'pending';
      else if (currentStatus === 'pending') nextStatus = 'completed';
    } else if (direction === 'backward') {
      if (currentStatus === 'completed') nextStatus = 'pending';
      else if (currentStatus === 'pending') nextStatus = 'inprogress';
      else if (currentStatus === 'inprogress') nextStatus = 'todo';
    } else {
      nextStatus = direction;
    }

    try {
      const response = await fetch(`/api/kanban/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (response.ok) {
        loadTasks();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete task
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Tem certeza que deseja remover esta tarefa permanentemente?')) return;
    try {
      const response = await fetch(`/api/kanban/${taskId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        loadTasks();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Close Day (Encerrar Dia) — clears completed and logs in history with date
  const handleCloseDay = async () => {
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    if (completedCount === 0) {
      alert('Não há nenhuma tarefa na coluna "Concluído" hoje para arquivar.');
      return;
    }

    if (!confirm(`Deseja encerrar o dia de trabalho? Isso removerá as ${completedCount} tarefas CONCLUÍDAS desta coluna e salvará em seu histórico diário. As colunas A Fazer, Em Andamento e Pendente permanecerão intactas.`)) {
      return;
    }

    try {
      const response = await fetch('/api/kanban/close-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetUser.id,
          userName: targetUser.name
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Erro ao encerrar o dia.');
      }

      alert('Dia encerrado com sucesso! Suas tarefas concluídas foram guardadas com segurança no histórico.');
      loadTasks();
      loadHistory();
      checkIfTodayIsClosed();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReopenDay = async () => {
    if (!confirm('Deseja realmente reabrir o dia de hoje? Isso restaurará as tarefas concluídas consolidadas de volta ao quadro e removerá o log de histórico de hoje.')) {
      return;
    }

    try {
      const response = await fetch('/api/kanban/reopen-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetUser.id
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Erro ao reabrir o dia de trabalho.');
      }

      alert('Dia reaberto com sucesso! Suas tarefas concluídas foram restauradas no quadro para você continuar seu trabalho.');
      loadTasks();
      loadHistory();
      checkIfTodayIsClosed();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6 text-neutral-800" id="kanban-screen">
      
      {/* HEADER CONTROLS */}
      <div className="bg-white p-6 border border-neutral-200 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4" id="kanban-header">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 font-sans">
            Quadro Kanban Diário
          </h2>
          <p className="text-sm text-neutral-500 font-sans">
            Gerencie e organize as tarefas e o foco diário da agropecuária.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* USER SWITCHER FOR ADMIN */}
          {user.role === 'admin' ? (
            <div className="flex items-center gap-2 bg-neutral-100 p-1.5 rounded-lg border border-neutral-200">
              <span className="text-xs font-semibold text-neutral-500 px-2">Visualizar Quadro:</span>
              <select
                id="kanban-user-select"
                value={targetUser.id}
                onChange={(e) => {
                  const selUser = availableUsers.find(u => u.id === e.target.value);
                  if (selUser) setTargetUser(selUser);
                }}
                className="bg-white border text-sm text-neutral-700 py-1 px-2 rounded-md font-sans focus:outline-none"
              >
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role === 'admin' ? 'Admin' : 'Funcionário'})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="text-xs font-medium text-neutral-500 px-3 py-1.5 bg-neutral-150 border rounded-lg">
              Quadro de: <strong>{targetUser.name}</strong>
            </span>
          )}

          {/* ENCERRAR DIA / REABRIR DIA */}
          {isTodayClosed ? (
            <button
              id="kanban-reopen-day-btn"
              onClick={handleReopenDay}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-750 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-xs uppercase tracking-wider"
              title="Clique para abrir e continuar as tarefas deste dia"
            >
              <RefreshCw size={14} className="animate-spin-slow" />
              Reabrir Dia
            </button>
          ) : (
            <button
              id="kanban-close-day-btn"
              onClick={handleCloseDay}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-xs uppercase tracking-wider"
            >
              <Archive size={14} />
              Encerrar Dia
            </button>
          )}
        </div>
      </div>

      {/* BANNER INFORMATIVO SE O DIA FOI ENCERRADO */}
      {isTodayClosed && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-850 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs md:text-sm font-sans" id="day-closed-alert">
          <div>
            <span className="font-bold">✓ Dia de Trabalho Concluído:</span> Suas atividades foram consolidadas e salvas de forma segura no histórico consolidado. Caso queira continuar incluindo novas tarefas ou alterando status, clique em reabrir.
          </div>
          <button
            onClick={handleReopenDay}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1"
          >
            <RefreshCw size={12} />
            Reabrir Trabalho de Hoje
          </button>
        </div>
      )}

      {/* QUICK ADD NEW TASK SECTION */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        <button
          id="toggle-add-task-btn"
          onClick={() => setShowAddForm(!showAddForm)}
          className="w-full text-left px-6 py-4 flex justify-between items-center hover:bg-neutral-50 font-semibold text-sm text-neutral-900 font-sans transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Plus size={16} className="text-emerald-600" />
            + Adicionar Nova Atividade / Tarefa ao Quadro
          </span>
          <span className="text-xs text-neutral-400 font-mono">
            {showAddForm ? 'Ocultar Formulário' : 'Visualizar Formulário'}
          </span>
        </button>

        {showAddForm && (
          <form onSubmit={handleAddTask} className="p-6 border-t border-neutral-100 bg-neutral-50/50 space-y-4" id="kanban-add-form">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5" htmlFor="task-title">
                  Nome da tarefa
                </label>
                <input
                  id="task-title"
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Insira o título da tarefa..."
                  className="w-full bg-white border border-neutral-200 rounded-lg p-2.5 text-sm text-neutral-950 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5" htmlFor="task-desc">
                  Descrição detalhada (Opcional)
                </label>
                <input
                  id="task-desc"
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Insira os detalhes adicionais sobre o que fazer..."
                  className="w-full bg-white border border-neutral-200 rounded-lg p-2.5 text-sm text-neutral-950 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                id="btn-cancel-task"
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 rounded-lg text-xs font-bold text-neutral-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                id="btn-save-task"
                type="submit"
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Adicionar Tarefa
              </button>
            </div>
          </form>
        )}
      </div>

      {/* KANBAN BOARD COLUMNS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="kanban-columns-grid">
        {STATUS_COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.value);

          return (
            <div key={col.value} className="bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col min-h-[420px]" id={`col-${col.value}`}>
              {/* Column Title */}
              <div className={`px-4 py-3 border-b flex items-center justify-between font-bold text-xs uppercase tracking-wider font-sans bg-neutral-50 border-neutral-200`}>
                <span>{col.label}</span>
                <span className="px-2 py-0.5 bg-neutral-200 text-neutral-800 text-[10px] font-mono rounded-full">
                  {colTasks.length}
                </span>
              </div>

              {/* Items Panel */}
              <div className="p-3 gap-3 flex flex-col flex-1 overflow-y-auto bg-neutral-50/20">
                {colTasks.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-xs text-neutral-400 font-sans italic border-2 border-dashed border-neutral-100 rounded-xl">
                    Sem atividades
                  </div>
                ) : (
                  colTasks.map((task) => (
                    <div
                      key={task.id}
                      id={task.id}
                      className="bg-white p-4 border border-neutral-200 rounded-xl shadow-xs transition-shadow hover:shadow-sm flex flex-col justify-between gap-3 group relative"
                    >
                      <div className="space-y-1 pr-6">
                        <h4 className="font-semibold text-sm text-neutral-900 leading-tight block break-words">{task.title}</h4>
                        {task.description && (
                          <p className="text-xs text-neutral-500 leading-relaxed block break-words">{task.description}</p>
                        )}
                        <span className="text-[10px] text-neutral-400 font-mono block">
                          Lancado: {new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Deletar activity */}
                      <button
                        id={`delete-${task.id}`}
                        onClick={() => handleDeleteTask(task.id)}
                        className="absolute right-3 top-3.5 text-neutral-300 hover:text-red-600 transition-colors p-1 rounded-md hover:bg-neutral-50 cursor-pointer"
                        title="Remover"
                      >
                        <Trash2 size={13} />
                      </button>

                      <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                        {/* Selector/Buttons to transition status easily inside iframe */}
                        <div className="flex items-center gap-1.5 w-full justify-between">
                          <button
                            id={`move-${task.id}-back`}
                            onClick={() => handleMoveTask(task.id, task.status, 'backward')}
                            disabled={col.value === 'todo'}
                            className="p-1 px-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-md text-[10px] font-bold disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                            title="Mover para esquerda"
                          >
                            <ArrowLeft size={10} className="inline" /> Voltar
                          </button>

                          <div className="text-[10px] text-neutral-400 font-bold uppercase">Mover</div>

                          <button
                            id={`move-${task.id}-forward`}
                            onClick={() => handleMoveTask(task.id, task.status, 'forward')}
                            disabled={col.value === 'completed'}
                            className="p-1 px-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-md text-[10px] font-bold disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                            title="Mover para direita"
                          >
                            Avançar <ArrowRight size={10} className="inline" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* CONSULTA HISTORICO INTEGRADA (SOLICITADO: "historico consultavel por data") */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs" id="kanban-history-explorer">
        <div className="p-6 bg-neutral-50/50 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-md font-bold text-neutral-900 font-sans flex items-center gap-2">
              <Calendar size={18} className="text-emerald-600" />
              Histórico de Dias Encerrados
            </h3>
            <p className="text-xs text-neutral-500 font-sans">
              Consulte quais atividades foram concluídas em qualquer dia do mês.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-neutral-500 uppercase font-mono" htmlFor="history-date">Data:</label>
            <input
              id="history-date"
              type="date"
              value={historySearchDate}
              onChange={(e) => setHistorySearchDate(e.target.value)}
              className="bg-white border border-neutral-200 rounded-lg p-2 text-xs font-semibold text-neutral-800 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="p-6">
          {historyLoading ? (
            <div className="py-8 text-center text-sm text-neutral-500 animate-pulse">
              Carregando log de atividades do dia...
            </div>
          ) : historyRecords.length === 0 ? (
            <div className="py-8 text-center text-sm text-neutral-500 italic">
              Nenhuma entrada de "Encerrar Dia" arquivada para a data pesquisada ({historySearchDate}).
            </div>
          ) : (
            <div className="space-y-6">
              {historyRecords.map((entry) => (
                <div key={entry.id} className="border border-neutral-200 rounded-xl p-5 bg-neutral-50/20" id={`history-entry-${entry.id}`}>
                  <div className="flex justify-between items-start pb-3 border-b border-neutral-200 mb-4">
                    <div>
                      <h4 className="text-xs font-bold font-sans text-neutral-400 uppercase tracking-widest">Colaborador</h4>
                      <p className="text-sm font-semibold text-neutral-800 font-sans">{entry.userName}</p>
                    </div>
                    <div className="text-right">
                      <span className="px-2.5 py-1 bg-neutral-200 text-neutral-700 text-[10px] font-bold font-mono rounded-md uppercase">
                        {entry.tasks.length} {entry.tasks.length === 1 ? 'Concluída' : 'Concluídas'}
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-3">
                    {entry.tasks.map((t, idx) => (
                      <li key={idx} className="flex gap-2.5 items-start p-2 hover:bg-white rounded-lg transition-colors">
                        <span className="mt-1 h-4 w-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold">✓</span>
                        <div>
                          <p className="text-sm font-medium text-neutral-950 font-sans">{t.title}</p>
                          {t.description && (
                            <p className="text-xs text-neutral-500 font-sans mt-0.5">{t.description}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
