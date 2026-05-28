import React, { useState } from 'react';
import { Lock, User as UserIcon, ShieldAlert } from 'lucide-react';
import { User } from '../types';
import { apiFetch } from '../utils/api';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch('/api/user-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        throw new Error(
          'Bloqueio de Cookies de Segurança (AI Studio): O navegador impediu os cookies de segurança necessários dentro do painel integrado (iframe).\n\n' +
          '👉 Para RESOLVER EM 2 SEGUNDOS:\n' +
          '1. Clique no botão "Open in new tab" (Abrir em nova aba) no canto superior direito do painel de visualização.\n' +
          '2. Isso validará os cookies e liberará o acesso tanto na nova aba quanto aqui!'
        );
      }

      if (!response.ok) {
        throw new Error(data.error || 'Credenciais inválidas.');
      }

      onLoginSuccess(data);
    } catch (err: any) {
      setError(err.message || 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (userType: 'admin' | 'employee') => {
    if (userType === 'admin') {
      setUsername('admin');
      setPassword('admin123');
    } else {
      setUsername('funcionario');
      setPassword('funcionario123');
    }
    setError(null);
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col justify-center items-center px-4" id="login-container">
      <div className="w-full max-w-md bg-white border border-neutral-200 shadow-sm rounded-xl overflow-hidden p-8" id="login-card">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-emerald-50 text-emerald-600 rounded-full mb-3">
            <ShieldAlert size={32} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 font-sans">FocoDiario</h1>
          <p className="text-sm text-neutral-500 mt-2 font-sans">
            Módulo de Gestão Segura — Agropecuária & Financeiro
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100 flex items-start gap-2 animate-pulse" id="login-error">
            <span>⚠️</span>
            <p className="font-medium whitespace-pre-line text-left">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" id="login-form">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2" htmlFor="username">
              Nome de Usuário
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">
                <UserIcon size={18} />
              </span>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                placeholder="Ex: admin"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2" htmlFor="password">
              Senha de Acesso
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">
                <Lock size={18} />
              </span>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                placeholder="Ex: ••••••••"
                disabled={loading}
              />
            </div>
          </div>

          <button
            id="login-btn-submit"
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Autenticando...' : 'Entrar no Sistema'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-neutral-100 text-center">
          <p className="text-xs text-neutral-400 font-medium uppercase tracking-widest mb-3">Atalhos de Acesso Rápido</p>
          <div className="flex justify-center gap-2">
            <button
              id="login-btn-quick-admin"
              onClick={() => handleQuickLogin('admin')}
              className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium rounded-md transition-colors border border-neutral-200 cursor-pointer"
            >
              Módulo Admin
            </button>
            <button
              id="login-btn-quick-emp"
              onClick={() => handleQuickLogin('employee')}
              className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium rounded-md transition-colors border border-neutral-200 cursor-pointer"
            >
              Módulo Funcionário
            </button>
          </div>
          <p className="text-[10px] text-neutral-400 mt-3 font-mono">
            Senhas padrão: admin123 para Admin | funcionario123 para Funcionário
          </p>
        </div>
      </div>
    </div>
  );
}
