export type UserRole = 'admin' | 'employee' | 'guest';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  name: string;
}

export type TaskStatus = 'todo' | 'inprogress' | 'pending' | 'completed';

export interface KanbanTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  userId: string; // Separado por funcionário
  userName: string;
  createdAt: string;
}

export interface KanbanHistoryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  userId: string;
  userName: string;
  tasks: Array<{
    id: string;
    title: string;
    description?: string;
    completedAt: string;
  }>;
}

export type MensalidadeStatus = 'pending' | 'waiting_bill' | 'completed' | 'justified';

export interface MensalidadeTemplate {
  id: string;
  name: string;
  value: number;
  dueDay: number;
  category: string;
  createdAt: string;
}

export interface Mensalidade {
  id: string;
  templateId?: string; // ID do template original
  name: string;
  value: number;
  dueDay: number; // dia do mês (1 a 31)
  category: string;
  status: MensalidadeStatus;
  pdfUrl?: string; // Caminho do boleto enviado
  justification?: string; // Texto obrigatório caso seja justificado
  lastUpdated?: string;
  month?: string; // Formato YYYY-MM descritivo (ex: "2026-05")
}

export interface BreedQuantity {
  breed: string;
  quantity: number;
}

export type ChickBatchStatus = 'open' | 'finalized';
export type CustomerOrderStatus = 'registered' | 'delivered';

export interface CustomerOrder {
  id: string;
  customerName: string;
  quantities: BreedQuantity[];
  observation?: string;
  status: CustomerOrderStatus;
  createdAt: string;
}

export interface ChickBatch {
  id: string;
  openedBy: string; // Nome do usuário que abriu
  openedAt: string;
  deliveryDate: string; // Próxima segunda-feira
  status: ChickBatchStatus;
  finalizedAt?: string;
  pdfUrl?: string; // URL para o PDF gerado
  orders: CustomerOrder[];
}
