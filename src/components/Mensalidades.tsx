import React, { useState, useEffect } from 'react';
import { Mensalidade, User, MensalidadeStatus } from '../types';
import { Plus, DollarSign, Calendar, Tag, FileText, CheckCircle, AlertCircle, FileLock2, Trash2, ArrowUpRight, Check, X, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface MensalidadesProps {
  user: User;
}

const CATEGORIES = [
  'Impostos / Contábil',
  'Energia / Água / Telecom',
  'Medicamentos / Vacinas',
  'Rações / Insumos',
  'Software / Tecnologia',
  'Mensalidades Diversas',
  'Outros'
];

export default function Mensalidades({ user }: MensalidadesProps) {
  const [bills, setBills] = useState<Mensalidade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter Month State - Default to Current Calendar Month
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return new Date().toISOString().substring(0, 7); // Ex: '2026-05'
  });

  // Form states
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [dueDay, setDueDay] = useState('10');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [showAddForm, setShowAddForm] = useState(false);

  // Interaction Modal/Popups states
  const [activeJustifyId, setActiveJustifyId] = useState<string | null>(null);
  const [justification, setJustification] = useState('');

  // Target file upload states
  const [uploadLoadingId, setUploadLoadingId] = useState<string | null>(null);

  // Gera lista dinâmica de meses em português (de Janeiro de 2026 até no máximo 1 mês à frente)
  const generateMonthsList = () => {
    const list = [];
    const currentDate = new Date();
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    // Começa em Janeiro de 2026 (2026-01)
    const startDate = new Date(2026, 0, 1);
    // VAI até no máximo 1 mês no futuro do mês/ano atual
    const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);

    const tempDate = new Date(startDate);
    while (tempDate <= endDate) {
      const value = tempDate.toISOString().substring(0, 7);
      const label = `${monthNames[tempDate.getMonth()]} de ${tempDate.getFullYear()}`;
      list.push({ value, label });
      tempDate.setMonth(tempDate.getMonth() + 1);
    }
    return list.reverse();
  };

  const isCurrentMonth = selectedMonth === new Date().toISOString().substring(0, 7);

  const loadBills = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/mensalidades?month=${selectedMonth}`);
      const data = await res.json();
      setBills(data);
    } catch (err) {
      setError('Erro ao carregar mensalidades.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBills();
  }, [selectedMonth]);

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !value || !dueDay) {
      alert('Preencha todos os campos obrigatórios.');
      return;
    }

    try {
      const res = await apiFetch('/api/mensalidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          value: parseFloat(value),
          dueDay: parseInt(dueDay),
          category,
          month: selectedMonth
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar.');

      setName('');
      setValue('');
      setDueDay('10');
      setShowAddForm(false);
      loadBills();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Handle PDF upload
  const handlePdfUpload = async (billId: string, file: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Operação Negada: Apenas arquivos em formato PDF são válidos para boletos diários!');
      return;
    }

    setUploadLoadingId(billId);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiFetch(`/api/mensalidades/${billId}/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro no envio do boleto PDF.');
      }

      alert('Boleto PDF anexado com sucesso e status atualizado para CONCLUÍDO!');
      loadBills();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploadLoadingId(null);
    }
  };

  // Submit Justification
  const handleJustifyBill = async (billId: string) => {
    if (!justification.trim()) {
      alert('Erro: Texto explicativo de justificativa é obrigatório.');
      return;
    }

    try {
      const response = await apiFetch(`/api/mensalidades/${billId}/justify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justification })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao justificar.');
      }

      alert('Mensalidade justificada com sucesso!');
      setJustification('');
      setActiveJustifyId(null);
      loadBills();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteBill = async (billId: string) => {
    if (!confirm('Atenção: A exclusão de uma mensalidade irá remover o seu cadastro e sua renovação para os meses seguintes. Os registros de pagamentos em meses passados serão preservados no histórico financeiro.\n\nDeseja deletar esta conta?')) return;

    try {
      const response = await apiFetch(`/api/mensalidades/${billId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        loadBills();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Safe checks for permissions inside code
  if (user.role !== 'admin') {
    return (
      <div className="p-8 text-center bg-white border border-neutral-200 rounded-xl space-y-4" id="restricted-view">
        <div className="inline-flex justify-center p-3 text-red-600 bg-red-100 rounded-full">
          <ShieldAlert size={48} />
        </div>
        <h3 className="text-xl font-bold text-neutral-900 font-sans">Seção Restrita</h3>
        <p className="text-sm text-neutral-500 max-w-sm mx-auto font-sans leading-relaxed">
          Você logou como Funcionário. Apenas administradores do sistema têm credenciais para gerenciar mensalidades e lançar dados fiscais.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-neutral-800" id="bills-screen">
      
      {/* HEADER CONTROL ACTIONS */}
      <div className="bg-white p-6 border border-neutral-200 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-fadeIn" id="bills-header">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 font-sans">
            Contas e Mensalidades Recorrentes
          </h2>
          <p className="text-sm text-neutral-500 font-sans">
            Cadastro financeiro estruturado com carregamento de PDFs ou justificativas fiscais.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          {/* Month Selector Filter */}
          <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5 shadow-2xs">
            <span className="text-[10px] font-bold text-neutral-500 uppercase font-sans tracking-wider whitespace-nowrap">Mês de Referência:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-0 text-xs font-bold font-sans text-neutral-900 cursor-pointer focus:outline-none focus:ring-0 py-0 pr-6 pl-0"
              id="select-reference-month"
            >
              {generateMonthsList().map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <button
            id="btn-toggle-add-bill"
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-neutral-950 hover:bg-neutral-800 text-white rounded-lg text-xs font-bold transition-transform flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider whitespace-nowrap"
          >
            <Plus size={14} />
            {showAddForm ? 'Ocultar Novo' : 'Cadastrar Conta Recorrente'}
          </button>
        </div>
      </div>

      {/* WARNING NOTIFICATION WHEN FILTERING PAST OR FUTURE MONTHS */}
      {!isCurrentMonth && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3 text-xs text-amber-800 font-sans animate-fadeIn" id="past-month-alert">
          <AlertCircle size={16} className="mt-0.5 text-amber-600 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">Modo de Consulta Histórica ({selectedMonth})</p>
            <p className="text-amber-700 leading-relaxed">
              Você está visualizando a folha de parcelas e comprovantes de outro período. Qualquer status alterado (PDF ou justificativa) será saldo unicamente neste mês selecionado. Adicionar novas contas ou alterar dados estruturais criará e atualizará as configurações recorrentes para os próximos meses da folha.
            </p>
          </div>
        </div>
      )}

      {/* REGISTRATION FORM */}
      {showAddForm && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs animate-fadeIn" id="add-bill-card">
          <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 mb-4 font-sans border-b border-neutral-100 pb-2">
            Nova Mensalidade Recorrente
          </h3>
          <form onSubmit={handleCreateBill} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end" id="add-bill-form">
            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5" htmlFor="bill-name">
                Nome da Conta
              </label>
              <input
                id="bill-name"
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome da conta (ex: Energia, Água...)"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 text-xs text-neutral-950 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5" htmlFor="bill-value">
                Valor Estimado (R$)
              </label>
              <input
                id="bill-value"
                required
                type="number"
                step="0.01"
                min="0.1"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.00"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 text-xs text-neutral-950 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5" htmlFor="bill-due-day">
                Dia de Vencimento
              </label>
              <input
                id="bill-due-day"
                required
                type="number"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 text-xs text-neutral-950 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5" htmlFor="bill-category">
                Categoria Fiscal
              </label>
              <select
                id="bill-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 text-xs text-neutral-950 focus:outline-none focus:ring-1 focus:ring-neutral-400 font-sans"
              >
                {CATEGORIES.map((cat, i) => (
                  <option key={i} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-4 flex justify-end gap-2 pt-4 border-t border-neutral-100 mt-2">
              <button
                id="btn-cancel-bill"
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 border text-xs font-bold font-sans rounded-lg text-neutral-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                id="btn-save-bill"
                type="submit"
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold font-sans rounded-lg cursor-pointer"
              >
                Adicionar e Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* BILL PACKAGES LIST */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs" id="bills-list-card">
        <div className="px-6 py-4 bg-neutral-50 border-b border-neutral-200 flex justify-between items-center">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Contas Mensais Cadastradas
          </h3>
          <span className="text-[10px] bg-neutral-200 px-2 py-0.5 text-neutral-700 font-mono rounded-full font-bold">
            Total Estipulado: R$ {bills.reduce((sum, b) => sum + b.value, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-neutral-500 animate-pulse">
            Carregando mensalidades e registros de comprovantes fiscais...
          </div>
        ) : bills.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 italic text-sm">
            Nenhuma mensalidade cadastrada. Clique em "Cadastrar Conta Recorrente" para iniciar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs" id="bills-table">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 font-semibold text-neutral-600">
                  <th className="p-4 uppercase tracking-wider font-mono">Conta / Credor</th>
                  <th className="p-4 uppercase tracking-wider font-mono">Categoria</th>
                  <th className="p-4 uppercase tracking-wider font-mono">Valor Estimado</th>
                  <th className="p-4 uppercase tracking-wider font-mono">Vencimento</th>
                  <th className="p-4 uppercase tracking-wider font-mono">Situação</th>
                  <th className="p-4 uppercase tracking-wider font-mono text-center">Faturamento / Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {bills.map((bill) => {
                  return (
                    <tr key={bill.id} id={`row-bill-${bill.id}`} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="p-4 font-semibold text-neutral-900 font-sans">
                        <div className="space-y-0.5">
                          <p className="text-sm font-bold text-neutral-900">{bill.name}</p>
                          <p className="text-[10px] font-mono text-neutral-400">ID: {bill.id}</p>
                        </div>
                      </td>
                      <td className="p-4 text-neutral-600 font-sans">{bill.category}</td>
                      <td className="p-4 font-medium font-mono text-neutral-950">
                        R$ {bill.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 font-semibold font-mono text-neutral-800">
                        Dia {bill.dueDay} de cada mês
                      </td>
                      <td className="p-4 font-semibold font-sans">
                        {bill.status === 'completed' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-full border border-emerald-100 text-[10px] font-bold">
                            <CheckCircle size={11} /> Pago (Boleto Anexado)
                          </span>
                        )}
                        {bill.status === 'justified' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-800 rounded-full border border-indigo-100 text-[10px] font-bold">
                            <Tag size={11} /> Conta Justificada
                          </span>
                        )}
                        {bill.status === 'pending' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 text-rose-800 rounded-full border border-rose-100 text-[10px] font-bold">
                            <AlertCircle size={11} /> Pendente
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-sans text-right">
                        <div className="flex items-center justify-end gap-2.5 flex-wrap">
                          {/* CASO PAGO / COMPROVADO EM PDF */}
                          {bill.pdfUrl && (
                            <a
                              id={`view-pdf-${bill.id}`}
                              href={`${bill.pdfUrl}?token=${encodeURIComponent(user.token || '')}`}
                              target="_blank"
                              rel="referrer"
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              Ver Boleto
                              <ArrowUpRight size={12} />
                            </a>
                          )}

                          {/* CASO JUSTIFICADO */}
                          {bill.status === 'justified' && (
                            <div className="text-left bg-neutral-100 p-2 border border-neutral-200 rounded-lg max-w-[200px] text-[10px] text-neutral-600 italic font-mono block break-words" id={`justification-bubble-${bill.id}`}>
                              <strong>Explicativa:</strong> "{bill.justification}"
                            </div>
                          )}

                          {/* CASO EM ABERTO/PENDENTE - EXIGE ARQUIVO PDF OU JUSTIFICATIVA COM TEXTO OBRIGATORIO */}
                          {bill.status === 'pending' && (
                            <div className="flex items-center gap-2">
                              {/* BOLETO PDF UPLOAD BUTTON */}
                              <div className="relative">
                                <label
                                  id={`upload-label-${bill.id}`}
                                  htmlFor={`upload-pdf-${bill.id}`}
                                  className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-bold transition-colors inline-md items-center gap-1 cursor-pointer"
                                >
                                  {uploadLoadingId === bill.id ? 'Salvando...' : 'Carregar PDF'}
                                </label>
                                <input
                                  id={`upload-pdf-${bill.id}`}
                                  type="file"
                                  accept=".pdf"
                                  disabled={uploadLoadingId === bill.id}
                                  onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      handlePdfUpload(bill.id, e.target.files[0]);
                                    }
                                  }}
                                  className="hidden"
                                />
                              </div>

                              {/* JUSTIFICAR */}
                              <button
                                id={`btn-justify-form-${bill.id}`}
                                onClick={() => {
                                  setActiveJustifyId(bill.id);
                                  setJustification('');
                                }}
                                className="px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-neutral-200 rounded-lg text-xs font-bold cursor-pointer"
                              >
                                Justificar
                              </button>
                            </div>
                          )}

                          {/* DELETAR MENSALIDADE */}
                          <button
                            id={`btn-delete-bill-${bill.id}`}
                            onClick={() => handleDeleteBill(bill.id)}
                            className="p-1 px-1.5 text-neutral-300 hover:text-red-700 rounded-lg transition-colors cursor-pointer"
                            title="Deletar Recorrência"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {/* EXPANSIVEL JUSTIFICATIVA SUBMIT FORM */}
                        {activeJustifyId === bill.id && (
                          <div className="mt-3 p-3 bg-neutral-50 border border-neutral-200 text-left rounded-lg space-y-2 animate-fadeIn" id={`justify-box-${bill.id}`}>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600">
                              Justificativa Obrigatória (Falta de boleto)
                            </p>
                            <textarea
                              id={`textarea-justify-${bill.id}`}
                              required
                              rows={2}
                              value={justification}
                              onChange={(e) => setJustification(e.target.value)}
                              placeholder="Fatos explicativos (ex: Crédito de ICMS do estado, isenção em contrato fiscal, etc.)"
                              className="w-full bg-white border border-neutral-200 text-xs p-2 rounded-lg text-neutral-900 focus:outline-none"
                            />
                            <div className="flex justify-end gap-1.5">
                              <button
                                id={`btn-cancel-justify-${bill.id}`}
                                onClick={() => setActiveJustifyId(null)}
                                className="px-2 py-1 bg-neutral-200 hover:bg-neutral-300 rounded-sm text-[10px] font-bold font-sans text-neutral-700 cursor-pointer"
                              >
                                Cancelar
                              </button>
                              <button
                                id={`btn-submit-justify-${bill.id}`}
                                onClick={() => handleJustifyBill(bill.id)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm text-[10px] font-bold font-sans cursor-pointer"
                              >
                                Confirmar
                              </button>
                            </div>
                          </div>
                        )}
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
