import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { Users, UserPlus, Shield, Trash2, Edit3, AlertTriangle, Check, X, Lock, RefreshCw, Key } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface UserManagementProps {
  currentUser: User;
}

export default function UserManagement({ currentUser }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('employee');

  // Submit status
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        const data = await response.json();
        setError(data.error || 'Erro ao carregar lista de usuários.');
      }
    } catch (err) {
      setError('Erro de conexão com o servidor ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);
  };

  const handleOpenCreate = () => {
    setEditingUserId(null);
    setName('');
    setUsername('');
    setPassword('');
    setRole('employee');
    setError(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (userToEdit: User) => {
    setEditingUserId(userToEdit.id);
    setName(userToEdit.name);
    setUsername(userToEdit.username);
    setPassword(''); // leave blank for no change
    setRole(userToEdit.role);
    setError(null);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingUserId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !username.trim()) {
      setError('Nome e Login de Usuário são campos obrigatórios.');
      return;
    }

    if (!editingUserId && !password) {
      setError('Uma senha de acesso é obrigatória para novos usuários.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingUserId) {
        // Edit User
        const body: any = {
          name: name.trim(),
          username: username.trim().toLowerCase(),
          role
        };
        if (password) {
          body.password = password;
        }

        const response = await apiFetch(`/api/users/${editingUserId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        const data = await response.json();
        if (response.ok) {
          showSuccess(`Usuário "${data.name}" atualizado com sucesso!`);
          setIsFormOpen(false);
          fetchUsers();
        } else {
          setError(data.error || 'Falha ao atualizar dados do usuário.');
        }
      } else {
        // Create User
        const response = await apiFetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            username: username.trim().toLowerCase(),
            password,
            role
          })
        });

        const data = await response.json();
        if (response.ok) {
          showSuccess(`Usuário "${data.name}" cadastrado com sucesso!`);
          setIsFormOpen(false);
          fetchUsers();
        } else {
          setError(data.error || 'Falha ao cadastrar novo usuário.');
        }
      }
    } catch (err) {
      setError('Falha de comunicação com o servidor.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (userToDelete: User) => {
    if (userToDelete.id === currentUser.id) {
      alert('Você não pode excluir seu próprio usuário do sistema enquanto estiver logado.');
      return;
    }

    if (!confirm(`Deseja realmente remover o usuário "${userToDelete.name}" (${userToDelete.username}) do sistema?\n\nEsta ação é irreversível e o usuário perderá o acesso imediatamente.`)) {
      return;
    }

    setError(null);
    try {
      const response = await apiFetch(`/api/users/${userToDelete.id}`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (response.ok) {
        showSuccess('Usuário excluído com sucesso.');
        fetchUsers();
      } else {
        setError(data.error || 'Falha ao excluir usuário.');
      }
    } catch (err) {
      setError('Falha de comunicação com o servidor.');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs overflow-hidden" id="user-management-panel">
      {/* HEADER DA SEÇÃO */}
      <div className="p-6 border-b border-neutral-100 bg-neutral-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
            <Users className="text-emerald-600" size={22} />
            Gerenciamento de Contas e Usuários
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Cadastre novos funcionários, defina permissões e proteja o acesso ao sistema FocoDiario.
          </p>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={fetchUsers}
            className="p-2 border border-neutral-200 hover:bg-neutral-100 rounded-xl transition-all cursor-pointer text-neutral-600"
            title="Atualizar dados"
            id="btn-refresh-users"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            id="btn-add-user"
          >
            <UserPlus size={15} />
            Novo Usuário
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* BANNER DE RETORNO / INFOS */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs animate-fade-in" id="error-alert">
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-500" />
            <div>
              <span className="font-bold">Atenção:</span> {error}
            </div>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl flex items-center gap-2 text-xs font-bold animate-fade-in" id="success-alert">
            <Check size={16} className="text-emerald-600 shrink-0" />
            {successMessage}
          </div>
        )}

        {/* COMPONENTE DE CADASTRO/EDIÇÃO (MODAL EMBUTIDO VELOZ) */}
        {isFormOpen && (
          <div className="mb-6 p-5 bg-neutral-50 border border-neutral-200 rounded-2xl animate-fade-in" id="user-form-container">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-1.5">
                <Shield size={16} className="text-neutral-600" />
                {editingUserId ? `Editando Usuário: ${name}` : 'Cadastrar Novo Usuário no Sistema'}
              </h3>
              <button
                onClick={handleCloseForm}
                className="p-1 hover:bg-neutral-200 rounded-lg text-neutral-400 hover:text-neutral-600 transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-neutral-600 mb-1">Nome Completo do Usuário</label>
                <input
                  type="text"
                  placeholder="Ex: João da Silva Santos"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-600 mb-1">Login de Acesso (Username)</label>
                <input
                  type="text"
                  placeholder="Ex: joao.agro"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={!!editingUserId}
                  className="w-full px-3 py-2 border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 rounded-lg text-xs uppercase disabled:bg-neutral-100 disabled:text-neutral-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-600 mb-1">
                  Senha {editingUserId ? '(Deixe em branco para manter a atual)' : 'de Acesso'}
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                    <Key size={12} />
                  </span>
                  <input
                    type="password"
                    placeholder={editingUserId ? "••••••" : "Mínimo 6 caracteres"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 rounded-lg text-xs"
                    required={!editingUserId}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-600 mb-1">Nível de Permissão (Hierarquia)</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 rounded-lg text-xs"
                >
                  <option value="employee">Funcionário Padrão (Sem finanças, acesso a pedidos e Kanban próprio)</option>
                  <option value="admin">Administrador Geral (Contas, uploads de boletos, histórico completo)</option>
                </select>
              </div>

              <div className="md:col-span-2 flex justify-end gap-2 pt-2 border-t border-neutral-200/50">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="px-4 py-2 border border-neutral-200 hover:bg-neutral-100 text-neutral-700 font-bold rounded-lg text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <RefreshCw size={12} className="animate-spin" />}
                  {editingUserId ? 'Salvar Alterações' : 'Criar Conta de Usuário'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* EXIBIÇÃO DE CARREGANDO */}
        {loading ? (
          <div className="py-12 text-center text-neutral-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw size={24} className="animate-spin text-emerald-600" />
            <p className="text-xs">Carregando usuários do sistema...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center rounded-2xl border-2 border-dashed border-neutral-200 bg-neutral-50 text-neutral-500">
            <Users size={32} className="mx-auto mb-2 text-neutral-300" />
            <p className="text-sm font-bold text-neutral-700">Nenhum usuário cadastrado além de você.</p>
            <p className="text-xs text-neutral-400 mt-1">Clique em "Novo Usuário" para registrar novas contas no sistema.</p>
          </div>
        ) : (
          /* TABELA DE USUÁRIOS */
          <div className="overflow-x-auto rounded-xl border border-neutral-200" id="users-table-container">
            <table className="min-w-full divide-y divide-neutral-200 text-left text-xs text-neutral-700 bg-white">
              <thead className="bg-neutral-50 text-neutral-600 uppercase font-bold font-mono text-[10px] tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-4">Nome completo</th>
                  <th scope="col" className="px-6 py-4">Nome de usuário (Login)</th>
                  <th scope="col" className="px-6 py-4">Nível de Permissão</th>
                  <th scope="col" className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-sans">
                {users.map((item) => {
                  const isSelf = item.id === currentUser.id;
                  return (
                    <tr key={item.id} className="hover:bg-neutral-50/50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase ${
                            item.role === 'admin' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-neutral-100 text-neutral-800'
                          }`}>
                            {item.name.substring(0, 2)}
                          </div>
                          <div>
                            <span className="font-bold text-neutral-900 block">
                              {item.name}
                              {isSelf && (
                                <span className="ml-1.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-bold rounded-md">
                                  Você (Logado)
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-neutral-600 uppercase">
                        {item.username}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${
                          item.role === 'admin'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : 'bg-blue-50 text-blue-700 border border-blue-100'
                        } border`}>
                          <Shield size={10} />
                          {item.role === 'admin' ? 'Administrador Geral' : 'Funcionário Padrão'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 hover:bg-neutral-100 text-neutral-600 hover:text-emerald-600 rounded-lg transition-colors border border-neutral-200 cursor-pointer"
                            title="Editar especificações"
                          >
                            <Edit3 size={13} />
                          </button>
                          
                          <button
                            onClick={() => handleDelete(item)}
                            disabled={isSelf}
                            className={`p-1.5 rounded-lg transition-colors border ${
                              isSelf 
                                ? 'opacity-40 bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed'
                                : 'hover:bg-red-50 text-neutral-400 hover:text-red-600 border-neutral-200 cursor-pointer'
                            }`}
                            title={isSelf ? 'Você não pode excluir a si mesmo.' : 'Excluir usuário do sistema'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
