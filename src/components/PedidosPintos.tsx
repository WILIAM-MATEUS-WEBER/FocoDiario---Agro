import React, { useState, useEffect } from 'react';
import { ChickBatch, CustomerOrder, BreedQuantity, User, CustomerOrderStatus } from '../types';
import { Plus, ClipboardCopy, FileSpreadsheet, PackageCheck, FileDown, CheckSquare, Trash2, Calendar, RefreshCw, Layers, Settings } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { apiFetch } from '../utils/api';

interface PedidosPintosProps {
  user: User;
}

const DEFAULT_FALLBACK_BREEDS = [
  'Pinto de Corte (Frango / Pesado)',
  'Pinto de Postura (Poedeira de Ovos)',
  'Pinto Carijó Especial',
  'Pinto Caipira Colonial',
  'Pinto Pescoço Pelado Caipira',
  'Pinto de Angola (Tô Fraco)'
];

export default function PedidosPintos({ user }: PedidosPintosProps) {
  const [batches, setBatches] = useState<ChickBatch[]>([]);
  const [breeds, setBreeds] = useState<string[]>(DEFAULT_FALLBACK_BREEDS);
  const [loading, setLoading] = useState(false);
  
  // Create customer order states
  const [customerName, setCustomerName] = useState('');
  const [observation, setObservation] = useState('');
  // Object mapping breed name to quantity string
  const [breedQuantities, setBreedQuantities] = useState<Record<string, string>>({});

  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newBreedName, setNewBreedName] = useState('');
  const [showManageBreeds, setShowManageBreeds] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  const loadBreeds = async () => {
    try {
      const response = await apiFetch('/api/chicks/breeds');
      if (response.ok) {
        const data = await response.json();
        setBreeds(data);
      }
    } catch (e) {
      console.error('Erro ao buscar especies:', e);
    }
  };

  const loadBatches = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/chicks/batches');
      const data = await response.json();
      setBatches(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
    loadBreeds();
  }, []);

  useEffect(() => {
    setBreedQuantities(prev => {
      const nextAcc = { ...prev };
      breeds.forEach(breed => {
        if (nextAcc[breed] === undefined) {
          nextAcc[breed] = '';
        }
      });
      return nextAcc;
    });
  }, [breeds]);

  const activeBatch = batches.find(b => b.status === 'open');

  const handleOpenBatch = async () => {
    if (activeBatch) {
      alert('Operação Interrompida: Já existe um lote de pedidos aberto no momento.');
      return;
    }

    try {
      const response = await apiFetch('/api/chicks/batch/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openedBy: user.name })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao abrir lote.');

      alert(`Lote semanal de pintos aberto com sucesso! Data de entrega estipulada para a próxima segunda-feira: ${data.deliveryDate}`);
      loadBatches();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBatch) return;
    if (!customerName.trim()) {
      alert('O nome do cliente é obrigatório.');
      return;
    }

    // Map quantities. If blank/not a number, set to 0 as requested ("se o campo n tiver nenhum numero a quantidade deve ser 0")
    const formattedQuantities: BreedQuantity[] = breeds.map(breed => {
      const valStr = breedQuantities[breed];
      const quantity = valStr && !isNaN(Number(valStr)) ? Math.floor(Number(valStr)) : 0;
      return { breed, quantity };
    });

    const hasAnyQuantity = formattedQuantities.some(q => q.quantity > 0);
    if (!hasAnyQuantity && !confirm('Aviso: Todas as quantidades estão zeradas. Deseja registrar este pedido assim mesmo?')) {
      return;
    }

    try {
      const response = await apiFetch('/api/chicks/batch/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: activeBatch.id,
          customerName,
          quantities: formattedQuantities,
          observation
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao registrar.');

      setCustomerName('');
      setObservation('');
      setBreedQuantities(breeds.reduce((acc, br) => ({ ...acc, [br]: '' }), {}));
      setShowAddCustomer(false);
      loadBatches();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!activeBatch) return;
    if (!confirm('Deseja realmente excluir este pedido de cliente do lote aberto?')) {
      return;
    }

    try {
      const response = await apiFetch(`/api/chicks/batch/${activeBatch.id}/order/${orderId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        loadBatches();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleDeliver = async (batchId: string, orderId: string, currentStatus: CustomerOrderStatus) => {
    const nextStatus: CustomerOrderStatus = currentStatus === 'registered' ? 'delivered' : 'registered';
    try {
      const response = await apiFetch(`/api/chicks/batch/${batchId}/order/${orderId}/deliver`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (response.ok) {
        loadBatches();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGeneratePDF = (batch: ChickBatch) => {
    try {
      // Calculate breed aggregated totals
      const totalsByBreed: Record<string, number> = {};
      breeds.forEach(b => { totalsByBreed[b] = 0; });

      batch.orders.forEach(order => {
        order.quantities.forEach(q => {
          totalsByBreed[q.breed] = (totalsByBreed[q.breed] || 0) + q.quantity;
        });
      });

      const doc = new jsPDF();
      
      // Document Styling
      doc.setFillColor(34, 197, 94); // Green accent
      doc.rect(0, 0, 210, 15, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.text("FOCODIARIO - RESUMO DE PEDIDOS DE PINTOS", 12, 10);

      // Metadados do Lote
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(10);
      doc.setFont('Helvetica', 'normal');
      doc.text(`Identificador do Lote: ${batch.id}`, 12, 25);
      doc.text(`Aberto por: ${batch.openedBy} em ${new Date(batch.openedAt).toLocaleDateString()}`, 12, 31);
      doc.text(`Previsao de Entrega: ${new Date(batch.deliveryDate + 'T12:00:00Z').toLocaleDateString()}`, 12, 37);
      doc.text(`Status do Lote: ${batch.status === 'open' ? 'Aberto' : 'Finalizado'}`, 12, 43);

      // Linha separadora
      doc.setDrawColor(200, 200, 200);
      doc.line(12, 48, 198, 48);

      // SEÇÃO 1: RESUMO ACUMULADO POR ESPÉCIE
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      doc.text("RESUMO GERAL DO LOTE (POR ESPECIE)", 12, 57);

      let currentY = 65;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.text("Especie de Ave", 15, currentY);
      doc.text("Qtde.", 180, currentY);
      
      doc.line(12, currentY + 3, 198, currentY + 3);
      currentY += 8;

      doc.setFont('Helvetica', 'normal');
      Object.entries(totalsByBreed).forEach(([breed, total]) => {
        if (total > 0 || true) { // Mostrar todos para fins de inventário completo
          doc.text(breed, 15, currentY);
          doc.setFont('Helvetica', 'bold');
          doc.text(String(total), 180, currentY);
          doc.setFont('Helvetica', 'normal');
          doc.line(12, currentY + 3, 198, currentY + 3);
          currentY += 8;
        }
      });

      const grandTotalCount = Object.values(totalsByBreed).reduce((sum, v) => sum + v, 0);
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(16, 185, 129);
      doc.text("TOTAL GERAL DE AVES COMPROMETIDAS:", 15, currentY);
      doc.text(String(grandTotalCount), 180, currentY);
      doc.setTextColor(50, 50, 50);
      doc.setFont('Helvetica', 'normal');

      currentY += 15;

      // Verificação para quebra de página se necessário
      if (currentY > 210) {
        doc.addPage();
        currentY = 20;
      }

      // SEÇÃO 2: DETALHAMENTO DE PEDIDOS DOS CLIENTES
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      doc.text("LISTA DETALHADA POR CLIENTE", 12, currentY);
      currentY += 8;

      batch.orders.forEach((order, index) => {
        if (currentY > 240) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`${index + 1}. Cliente: ${order.customerName}`, 12, currentY);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`Status: ${order.status === 'registered' ? 'Registrado - Aguardando Retirada' : 'Entregue'}`, 140, currentY);
        currentY += 6;

        // Lista de quantidades de aves solicitadas
        const requestedBreeds = order.quantities.filter(q => q.quantity > 0);
        if (requestedBreeds.length === 0) {
          doc.text("Nenhum item solicitado", 15, currentY);
          currentY += 5;
        } else {
          requestedBreeds.forEach(q => {
            doc.text(`- ${q.breed}: ${q.quantity} unidades`, 15, currentY);
            currentY += 5;
          });
        }

        if (order.observation) {
          doc.setFont('Helvetica', 'italic');
          doc.text(`Obs: ${order.observation}`, 15, currentY);
          doc.setFont('Helvetica', 'normal');
          currentY += 5;
        }

        doc.line(12, currentY + 1, 198, currentY + 1);
        currentY += 8;
      });

      // Salva PDF no navegador do cliente
      doc.save(`FocoDiario_Lote_Pintos_${batch.deliveryDate}.pdf`);
    } catch (err: any) {
      alert(`Erro na geração do PDF: ${err.message}`);
    }
  };

  const handleFinalizeBatch = async (batchId: string) => {
    if (!confirm('Deseja realmente finalizar o lote de pedidos? Isso fechará o lote semanal para novas adições e disponibilizará o relatório PDF geral final.')) {
      return;
    }

    try {
      const response = await apiFetch(`/api/chicks/batch/${batchId}/finalize`, {
        method: 'POST'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao fechar.');

      alert(`Lote finalizado com sucesso! Gerando PDF de resumo do lote.`);
      handleGeneratePDF(data);
      loadBatches();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddBreed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBreedName.trim()) return;
    setManageError(null);
    try {
      const response = await apiFetch('/api/chicks/breeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBreedName })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao cadastrar espécie.');
      }
      setNewBreedName('');
      loadBreeds();
    } catch (err: any) {
      setManageError(err.message);
    }
  };

  const handleRemoveBreed = async (breedName: string) => {
    if (!confirm(`Deseja realmente remover a espécie "${breedName}"?`)) return;
    setManageError(null);
    try {
      const response = await apiFetch(`/api/chicks/breeds/${encodeURIComponent(breedName)}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao remover espécie.');
      }
      loadBreeds();
    } catch (err: any) {
      setManageError(err.message);
    }
  };

  return (
    <div className="space-y-6 text-neutral-800" id="chicks-screen">
      
      {/* HEADER CONTROL ACTIONS */}
      <div className="bg-white p-6 border border-neutral-200 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4" id="chicks-header">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 font-sans">
            🐣 Pedidos de Pintos de Corte e Postura
          </h2>
          <p className="text-sm text-neutral-500 font-sans">
            Abra o lote semanal cooperativo, cadastre clientes e emita o PDF consolidado.
          </p>
        </div>

        {!activeBatch ? (
          <button
            id="btn-open-batch"
            onClick={handleOpenBatch}
            className="px-4 py-2.5 bg-neutral-950 hover:bg-neutral-850 text-white rounded-lg text-xs font-bold transition-transform flex items-center gap-2 cursor-pointer uppercase tracking-wider"
          >
            <Layers size={14} />
            Abrir Novo Lote Semanal
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs rounded-lg font-mono">
              ● LOTE ATIVO EM ABERTO (Entrega: {new Date(activeBatch.deliveryDate + 'T12:00:00Z').toLocaleDateString()})
            </span>
            <button
              id="btn-finalize-batch"
              onClick={() => handleFinalizeBatch(activeBatch.id)}
              className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-transform flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
            >
              <PackageCheck size={14} />
              Fechar Lote e Ver PDF
            </button>
          </div>
        )}
      </div>

      {/* SEÇÃO DE GERENCIAMENTO DE ESPÉCIES */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs" id="manage-breeds-bench">
        <button
          id="btn-toggle-manage-breeds"
          type="button"
          onClick={() => {
            setShowManageBreeds(!showManageBreeds);
            setManageError(null);
          }}
          className="w-full text-left px-6 py-4 flex justify-between items-center hover:bg-neutral-50 font-semibold text-sm text-neutral-900 font-sans transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Settings size={16} className="text-neutral-600" />
            Configurar Espécies / Raças de Pintos ({breeds.length})
          </span>
          <span className="text-xs text-neutral-400 font-mono">
            {showManageBreeds ? 'Ocultar Configurações' : 'Configurar Catálogo'}
          </span>
        </button>

        {showManageBreeds && (
          <div className="p-6 border-t border-neutral-100 bg-neutral-50/50 space-y-4" id="manage-breeds-content">
            <p className="text-xs text-neutral-500 font-sans">
              Gerencie a lista de espécies disponíveis nos lotes. Você só pode remover raças que <strong>não estejam com entrega pendente para nenhum cliente</strong>.
            </p>

            {manageError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-700 font-sans" id="manage-breeds-error">
                ⚠️ {manageError}
              </div>
            )}

            <form onSubmit={handleAddBreed} className="flex gap-2 max-w-md" id="add-breed-form">
              <input
                type="text"
                required
                value={newBreedName}
                onChange={(e) => setNewBreedName(e.target.value)}
                placeholder="Ex: Pinto Caipira Gigante..."
                className="flex-1 bg-white border border-neutral-200 rounded-lg p-2.5 text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-400 font-sans"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-bold font-sans cursor-pointer transition-colors shrink-0"
              >
                + Adicionar
              </button>
            </form>

            <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mt-2 max-w-xl" id="breeds-catalog-list">
              {breeds.map((breedName) => (
                <div key={breedName} className="p-3 flex justify-between items-center text-xs font-sans">
                  <span className="text-neutral-800 font-medium">{breedName}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveBreed(breedName)}
                    className="text-neutral-400 hover:text-red-650 transition-colors p-1 cursor-pointer"
                    title="Remover Espécie"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ACTIVE BATCH WORKING BENCH */}
      {activeBatch ? (
        <div className="space-y-6" id="working-batch-bench">
          
          {/* CLIENT REGISTRATION FOR THE ACTIVE BATCH */}
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
            <button
              id="btn-toggle-add-customer"
              onClick={() => setShowAddCustomer(!showAddCustomer)}
              className="w-full text-left px-6 py-4 flex justify-between items-center hover:bg-neutral-50 font-semibold text-sm text-neutral-900 font-sans transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Plus size={16} className="text-emerald-600" />
                Registrar Pedido de Cliente neste Lote
              </span>
              <span className="text-xs text-neutral-400 font-mono">
                {showAddCustomer ? 'Fechar Formulário' : 'Carregar Formulário'}
              </span>
            </button>

            {showAddCustomer && (
              <form onSubmit={handleAddCustomer} className="p-6 border-t border-neutral-100 bg-neutral-50/50 space-y-6" id="add-customer-form">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wider mb-1.5" htmlFor="customer-name">
                      Nome completo do Cliente
                    </label>
                    <input
                      id="customer-name"
                      required
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Nome do cliente..."
                      className="w-full bg-white border border-neutral-200 rounded-lg p-2.5 text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wider mb-1.5" htmlFor="customer-obs">
                      Observações adicionais
                    </label>
                    <input
                      id="customer-obs"
                      type="text"
                      value={observation}
                      onChange={(e) => setObservation(e.target.value)}
                      placeholder="Instruções de entrega, vacinas, caixas..."
                      className="w-full bg-white border border-neutral-200 rounded-lg p-2.5 text-xs text-neutral-900 focus:outline-none"
                    />
                  </div>
                </div>

                {/* QUANTITIES PER BREED GRID */}
                <div>
                  <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3 border-b pb-1">
                    Quantidades Solicitadas (Aves) — Campos vazios serão tratados como 0
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {breeds.map((breed) => (
                      <div key={breed} className="bg-white p-3 border border-neutral-200 rounded-xl shadow-xs">
                        <label className="block text-xs font-semibold text-neutral-700 mb-1 leading-snug">
                          {breed}
                        </label>
                        <input
                          id={`breed-input-${breed}`}
                          type="number"
                          min="0"
                          value={breedQuantities[breed] || ''}
                          onChange={(e) => setBreedQuantities({
                            ...breedQuantities,
                            [breed]: e.target.value
                          })}
                          placeholder="0"
                          className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2 text-xs font-bold font-mono text-neutral-950 focus:outline-none focus:bg-white"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-neutral-100">
                  <button
                    id="btn-cancel-customer"
                    type="button"
                    onClick={() => setShowAddCustomer(false)}
                    className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 rounded-lg text-xs font-bold text-neutral-700 cursor-pointer text-center"
                  >
                    Descartar Formulário
                  </button>
                  <button
                    id="btn-save-customer"
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer text-center"
                  >
                    Registrar Lançamento
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* ACTIVE BATCH LOTE CUSTOMERS GRID */}
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs" id="active-batch-customers">
            <div className="px-6 py-4 bg-neutral-50 border-b border-neutral-200 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Ordens do Lote Atual
              </h3>
              <span className="text-[10px] bg-neutral-200 px-2.5 py-0.5 font-bold font-mono text-neutral-800 rounded-full">
                {activeBatch.orders.length} Clientes Ativos
              </span>
            </div>

            {activeBatch.orders.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 italic text-sm">
                Nenhum cliente cadastrado neste lote ativo. Clique acima para cadastrar a primeira encomenda.
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {activeBatch.orders.map((order) => {
                  const totalBreedsSum = order.quantities.reduce((s, b) => s + b.quantity, 0);

                  return (
                    <div key={order.id} id={`order-box-${order.id}`} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-neutral-50/30 transition-colors">
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-bold text-neutral-950 text-base">{order.customerName}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                            order.status === 'delivered' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {order.status === 'delivered' ? '✓ Entregue' : 'Registrado'}
                          </span>
                        </div>
                        
                        {/* Breed List */}
                        <div className="flex flex-wrap gap-2 pt-1 font-mono text-[11px]">
                          {order.quantities.filter(q => q.quantity > 0).map((br, index) => (
                            <span key={index} className="bg-neutral-100 border text-neutral-700 px-2 py-0.5 rounded-md">
                              {br.breed}: <strong>{br.quantity}</strong>
                            </span>
                          ))}
                          {totalBreedsSum === 0 && (
                            <span className="text-red-500 italic">Nenhum espécime solicitado (0)</span>
                          )}
                        </div>

                        {order.observation && (
                          <p className="text-xs text-neutral-500 italic bg-neutral-50 p-2 rounded-md border inline-block">
                            Obs: {order.observation}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* MARK DELIVERED OR BACK */}
                        <button
                          id={`deliver-btn-${order.id}`}
                          onClick={() => handleToggleDeliver(activeBatch.id, order.id, order.status)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                            order.status === 'delivered'
                              ? 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          {order.status === 'delivered' ? 'Voltar para Registrado' : 'Marcar como Entregue'}
                        </button>

                        {/* DELETE ORDER ALLOWED IN OPEN BATCH */}
                        <button
                          id={`delete-order-btn-${order.id}`}
                          onClick={() => handleDeleteOrder(order.id)}
                          className="p-1 px-1.5 text-neutral-300 hover:text-red-650 transition-colors cursor-pointer"
                          title="Remover Encomenda"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* NO OPEN BATCH MESSAGE */
        <div className="bg-white border p-12 text-center rounded-xl space-y-4" id="no-open-batch-box">
          <div className="inline-flex justify-center p-4 text-emerald-600 bg-emerald-50 rounded-full">
            <Layers size={40} />
          </div>
          <h3 className="text-md font-bold text-neutral-900 font-sans">Nenhum lote semanal em andamento</h3>
          <p className="text-sm text-neutral-500 max-w-sm mx-auto font-sans leading-relaxed">
            As ordens de aves estão suspensas no momento. Clique no botão de nova abertura acima para instanciar a entrega com data mapeada para o próximo ciclo de segunda-feira.
          </p>
        </div>
      )}

      {/* PAST FINALIZED BATCHES HISTORY */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs" id="batches-history">
        <div className="px-6 py-4 bg-neutral-50 border-b border-neutral-200">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Histórico das Remessas / Lotes de Pintos
          </h3>
        </div>

        {loading ? (
          <div className="p-6 text-center text-sm text-neutral-400">Carregando lotes de arquivamento...</div>
        ) : batches.filter(b => b.status === 'finalized').length === 0 ? (
          <div className="p-6 text-center text-neutral-400 italic text-sm">Nenhum lote foi encerrado e finalizado ainda.</div>
        ) : (
          <div className="divide-y divide-neutral-150">
            {batches.filter(b => b.status === 'finalized').map((batch) => {
              const totalChicksInBatch = batch.orders.reduce((sum, o) => {
                return sum + o.quantities.reduce((inSum, q) => inSum + q.quantity, 0);
              }, 0);

              return (
                <div key={batch.id} id={`history-batch-${batch.id}`} className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-neutral-50/30">
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-neutral-950 font-sans">
                      Lote de Aves — Entrega realizada em {new Date(batch.deliveryDate + 'T12:00:00Z').toLocaleDateString()}
                    </p>
                    <p className="text-xs text-neutral-500 font-mono">
                      Arquivado em {new Date(batch.finalizedAt!).toLocaleDateString()} • {batch.orders.length} clientes atendidos • {totalChicksInBatch} pintos encomendados
                    </p>
                  </div>

                  <button
                    id={`btn-download-pdf-past-${batch.id}`}
                    onClick={() => handleGeneratePDF(batch)}
                    className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-lg transition-transform flex items-center gap-1 cursor-pointer"
                  >
                    <FileDown size={12} />
                    Download PDF Relatório
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
