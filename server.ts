import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import crypto from 'crypto';
import { 
  UserRole, 
  User, 
  KanbanTask, 
  TaskStatus, 
  KanbanHistoryEntry, 
  Mensalidade, 
  MensalidadeTemplate,
  MensalidadeStatus, 
  BreedQuantity, 
  CustomerOrder, 
  ChickBatch,
  CustomerOrderStatus 
} from './src/types';

const app = express();
const PORT = 3000;

app.use(express.json());

// Diretorios necessarios para o sistema
const DATA_DIR = path.join(process.cwd(), 'data');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const DB_FILE = path.join(DATA_DIR, 'focodiario_db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configura o middleware para servir uploads estaticamente de forma segura
app.use('/uploads', express.static(UPLOADS_DIR));

// Helper para hashing seguro de senhas utilizando Node.js crypto (PBKDF2 - alto nivel de seguranca contra injection e brute force)
function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Interface para banco de dados local
interface DatabaseSchema {
  users: Array<{
    id: string;
    username: string;
    name: string;
    role: UserRole;
    passwordHash: string;
    salt: string;
  }>;
  tasks: KanbanTask[];
  history: KanbanHistoryEntry[];
  mensalidades: Mensalidade[];
  mensalidadesTemplates?: MensalidadeTemplate[];
  batches: ChickBatch[];
  breeds?: string[];
}

// Inicializa banco de dados com dados padrão caso não exista
const defaultSaltAdmin = generateSalt();
const defaultSaltFunc = generateSalt();

const defaultDb: DatabaseSchema = {
  users: [
    {
      id: 'u1',
      username: 'admin',
      name: 'Administrador (FocoDiario)',
      role: 'admin',
      passwordHash: hashPassword('admin123', defaultSaltAdmin),
      salt: defaultSaltAdmin
    },
    {
      id: 'u2',
      username: 'funcionario',
      name: 'Funcionário Padrão',
      role: 'employee',
      passwordHash: hashPassword('funcionario123', defaultSaltFunc),
      salt: defaultSaltFunc
    }
  ],
  tasks: [],
  history: [],
  mensalidades: [],
  mensalidadesTemplates: [
    {
      id: 't-1',
      name: 'Internet da Agropecuária',
      value: 150.00,
      dueDay: 10,
      category: 'Utilidades',
      createdAt: new Date().toISOString()
    },
    {
      id: 't-2',
      name: 'Energia Elétrica Copel',
      value: 850.45,
      dueDay: 15,
      category: 'Insumos',
      createdAt: new Date().toISOString()
    },
    {
      id: 't-3',
      name: 'Sistema de Emissão Fiscal',
      value: 299.90,
      dueDay: 28,
      category: 'Software/Tecnologia',
      createdAt: new Date().toISOString()
    }
  ],
  batches: [],
  breeds: [
    'Pinto de Corte (Frango / Pesado)',
    'Pinto de Postura (Poedeira de Ovos)',
    'Pinto Carijó Especial',
    'Pinto Caipira Colonial',
    'Pinto Pescoço Pelado Caipira',
    'Pinto de Angola (Tô Fraco)'
  ]
};

function loadDb(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      const db: DatabaseSchema = JSON.parse(data);
      
      let changed = false;

      // Se não há breeds no DB legado, cria-os com a lista padrão
      if (!db.breeds) {
        db.breeds = [
          'Pinto de Corte (Frango / Pesado)',
          'Pinto de Postura (Poedeira de Ovos)',
          'Pinto Carijó Especial',
          'Pinto Caipira Colonial',
          'Pinto Pescoço Pelado Caipira',
          'Pinto de Angola (Tô Fraco)'
        ];
        changed = true;
      }

      // Se não há mensalidadesTemplates no DB legado, cria-os
      if (!db.mensalidadesTemplates) {
        db.mensalidadesTemplates = [];
        changed = true;
      }

      const currentMonth = new Date().toISOString().substring(0, 7); // Ex: "2026-05"

      // Se gabarito de templates estiver vazio, inicializa a partir de mensalidades legadas ou padrão 
      if (db.mensalidadesTemplates.length === 0) {
        if (db.mensalidades && db.mensalidades.length > 0) {
          db.mensalidadesTemplates = db.mensalidades.map((m, index) => ({
            id: `t-${index + 1}-${Date.now()}`,
            name: m.name,
            value: m.value,
            dueDay: m.dueDay,
            category: m.category,
            createdAt: new Date().toISOString()
          }));
        } else {
          db.mensalidadesTemplates = [
            { id: 't-1', name: 'Internet da Agropecuária', value: 150.00, dueDay: 10, category: 'Utilidades', createdAt: new Date().toISOString() },
            { id: 't-2', name: 'Energia Elétrica Copel', value: 850.45, dueDay: 15, category: 'Insumos', createdAt: new Date().toISOString() },
            { id: 't-3', name: 'Sistema de Emissão Fiscal', value: 299.90, dueDay: 28, category: 'Software/Tecnologia', createdAt: new Date().toISOString() }
          ];
        }
        changed = true;
      }

      // Garante que todas as mensalidades atuais no banco têm 'month' definido
      if (db.mensalidades && db.mensalidades.length > 0) {
        db.mensalidades.forEach(m => {
          if (!m.month) {
            m.month = currentMonth;
            if (!m.templateId && db.mensalidadesTemplates) {
              const matched = db.mensalidadesTemplates.find(t => t.name === m.name);
              if (matched) {
                m.templateId = matched.id;
              }
            }
            changed = true;
          }
        });
      }

      if (changed) {
        saveDb(db);
      }
      return db;
    }
  } catch (error) {
    console.error('Erro ao ler banco de dados JSON:', error);
  }
  
  // Se não houver arquivo, cria o default alimentado com instâncias para o mês atual
  const currentMonth = new Date().toISOString().substring(0, 7);
  const initialDb: DatabaseSchema = {
    ...defaultDb,
    mensalidades: (defaultDb.mensalidadesTemplates || []).map(t => ({
      id: `m-${Date.now()}-${t.id}-${Math.floor(Math.random() * 1000)}`,
      templateId: t.id,
      name: t.name,
      value: t.value,
      dueDay: t.dueDay,
      category: t.category,
      status: 'pending',
      month: currentMonth
    }))
  };
  saveDb(initialDb);
  return initialDb;
}

function saveDb(db: DatabaseSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (error) {
    console.error('Erro ao salvar banco de dados JSON:', error);
  }
}

// Inicializacao do DB
loadDb();

// Configuração do Multer para upload restrito a PDF (validado server-side)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const fileId = crypto.randomBytes(8).toString('hex');
    const safeName = `${Date.now()}-${fileId}.pdf`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Validacao rigida do tipo de arquivo server-side
    const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF são permitidos para boletos e comprovantes!'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // Limite de 10MB por arquivo
  }
});


// ==========================================
// ROTAS DE AUTENTICAÇÃO
// ==========================================

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Preencha o usuário e a senha.' });
  }

  const db = loadDb();
  const foundUser = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!foundUser) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  const checkHash = hashPassword(password, foundUser.salt);
  if (checkHash === foundUser.passwordHash) {
    // Retorna os dados publicos do usuario autenticado com seguranca
    return res.json({
      id: foundUser.id,
      username: foundUser.username,
      name: foundUser.name,
      role: foundUser.role
    });
  }

  return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
});

// Novo registro de usuário (Admin Only)
app.post('/api/auth/register', (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios para registrar usuário.' });
  }

  const db = loadDb();
  const exists = db.users.some(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: 'Nome de usuário já existe.' });
  }

  const salt = generateSalt();
  const newUser = {
    id: `u-${Date.now()}`,
    username: username.toLowerCase(),
    name,
    role: role as UserRole,
    passwordHash: hashPassword(password, salt),
    salt
  };

  db.users.push(newUser);
  saveDb(db);

  return res.json({
    id: newUser.id,
    username: newUser.username,
    name: newUser.name,
    role: newUser.role
  });
});


// ==========================================
// ROTAS DE KANBAN
// ==========================================

// Retorna tarefas de Kanban
app.get('/api/kanban', (req, res) => {
  const db = loadDb();
  const { userId } = req.query;

  let filteredTasks = db.tasks;
  if (userId) {
    filteredTasks = db.tasks.filter(t => t.userId === userId);
  }
  return res.json(filteredTasks);
});

// Cria tarefa
app.post('/api/kanban', (req, res) => {
  const { title, description, status, userId, userName } = req.body;
  if (!title || !userId || !userName) {
    return res.status(400).json({ error: 'Título e Usuário do Kanban são obrigatórios.' });
  }

  const db = loadDb();
  const newTask: KanbanTask = {
    id: `task-${Date.now()}`,
    title,
    description: description || '',
    status: (status || 'todo') as TaskStatus,
    userId,
    userName,
    createdAt: new Date().toISOString()
  };

  db.tasks.push(newTask);
  saveDb(db);

  return res.json(newTask);
});

// Atualiza status ou campos de uma tarefa
app.put('/api/kanban/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, status } = req.body;

  const db = loadDb();
  const taskIdx = db.tasks.findIndex(t => t.id === id);

  if (taskIdx === -1) {
    return res.status(404).json({ error: 'Tarefa não encontrada.' });
  }

  if (title !== undefined) db.tasks[taskIdx].title = title;
  if (description !== undefined) db.tasks[taskIdx].description = description;
  if (status !== undefined) db.tasks[taskIdx].status = status as TaskStatus;

  saveDb(db);
  return res.json(db.tasks[taskIdx]);
});

// Deleta tarefa
app.delete('/api/kanban/:id', (req, res) => {
  const { id } = req.params;
  const db = loadDb();
  const initialLen = db.tasks.length;
  db.tasks = db.tasks.filter(t => t.id !== id);

  if (db.tasks.length === initialLen) {
    return res.status(404).json({ error: 'Tarefa não encontrada.' });
  }

  saveDb(db);
  return res.json({ success: true });
});

// Encerrar o Dia (Limpa Concluídos e salva no Histórico com data)
app.post('/api/kanban/close-day', (req, res) => {
  const { userId, userName } = req.body;
  if (!userId || !userName) {
    return res.status(400).json({ error: 'Usuário é obrigatório para encerrar o dia.' });
  }

  const db = loadDb();
  
  // Pegar tarefas concluidas deste usuario
  const completedTasksOfUser = db.tasks.filter(t => t.userId === userId && t.status === 'completed');
  
  if (completedTasksOfUser.length === 0) {
    return res.status(400).json({ error: 'Não há tarefas concluídas para salvar no histórico deste usuário hoje.' });
  }

  // Criar entrada no historico com data local simplificada
  const localToday = new Date().toISOString().split('T')[0];
  
  const historyEntry: KanbanHistoryEntry = {
    id: `hist-${Date.now()}`,
    date: localToday,
    userId,
    userName,
    tasks: completedTasksOfUser.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      completedAt: new Date().toISOString()
    }))
  };

  db.history.push(historyEntry);

  // Remover tarefas concluidas deste usuario do Kanban ativo
  db.tasks = db.tasks.filter(t => !(t.userId === userId && t.status === 'completed'));

  saveDb(db);

  return res.json({ success: true, historyEntry });
});

// Consultas de histórico por data
app.get('/api/kanban/history', (req, res) => {
  const db = loadDb();
  const { date, userId } = req.query;

  let filtered = db.history;
  
  if (date) {
    filtered = filtered.filter(h => h.date === date);
  }
  if (userId) {
    filtered = filtered.filter(h => h.userId === userId);
  }

  // Ordena por data decrescente
  filtered.sort((a, b) => b.date.localeCompare(a.date));

  return res.json(filtered);
});


// ==========================================
// ROTAS DE MENSALIDADES (ADMIN ONLY)
// ==========================================

// Retorna mensalidades cadastradas para o mês solicitado (lazily instantiates if none exist for that month)
app.get('/api/mensalidades', (req, res) => {
  const db = loadDb();
  const { month } = req.query; // Ex: "2026-05"

  const targetMonth = typeof month === 'string' ? month : new Date().toISOString().substring(0, 7);
  
  // Filtra as mensalidades daquele mês especificamente
  let monthlyBills = db.mensalidades.filter(m => m.month === targetMonth);
  
  // Se não existem mensalidades para esse mês, e existem templates cadastrados, autocria-as!
  if (monthlyBills.length === 0 && db.mensalidadesTemplates && db.mensalidadesTemplates.length > 0) {
    const templates = db.mensalidadesTemplates || [];
    const newInstances: Mensalidade[] = templates.map(t => ({
      id: `m-${Date.now()}-${t.id}-${Math.floor(Math.random() * 1000)}`,
      templateId: t.id,
      name: t.name,
      value: t.value,
      dueDay: t.dueDay,
      category: t.category,
      status: 'pending',
      month: targetMonth
    }));
    
    db.mensalidades.push(...newInstances);
    saveDb(db);
    monthlyBills = newInstances;
  }
  
  return res.json(monthlyBills);
});

// Cadastra mensalidade recorrente (Cria Template + Instância do mês ativo)
app.post('/api/mensalidades', (req, res) => {
  const { name, value, dueDay, category, month } = req.body;

  if (!name || value === undefined || dueDay === undefined || !category) {
    return res.status(400).json({ error: 'Nome, valor, dia do vencimento e categoria são obrigatórios.' });
  }

  const numDay = Number(dueDay);
  if (numDay < 1 || numDay > 31) {
    return res.status(400).json({ error: 'O dia do vencimento deve ser de 1 a 31.' });
  }

  const db = loadDb();
  if (!db.mensalidadesTemplates) {
    db.mensalidadesTemplates = [];
  }

  // Cria o template recorrente para que apareça nos meses subsequentes
  const templateId = `t-${Date.now()}`;
  const newTemplate: MensalidadeTemplate = {
    id: templateId,
    name,
    value: Number(value),
    dueDay: numDay,
    category,
    createdAt: new Date().toISOString()
  };
  db.mensalidadesTemplates.push(newTemplate);

  // Cria a instancia correspondente para o mês selecionado (ou o mês corrente)
  const targetMonth = typeof month === 'string' ? month : new Date().toISOString().substring(0, 7);
  const newInstance: Mensalidade = {
    id: `m-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    templateId: templateId,
    name,
    value: Number(value),
    dueDay: numDay,
    category,
    status: 'pending',
    month: targetMonth
  };
  db.mensalidades.push(newInstance);

  saveDb(db);
  return res.json(newInstance);
});

// Atualiza mensalidade (status geral, valor etc.)
app.put('/api/mensalidades/:id', (req, res) => {
  const { id } = req.params;
  const { name, value, dueDay, category, status } = req.body;

  const db = loadDb();
  const idx = db.mensalidades.findIndex(m => m.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Mensalidade não encontrada.' });
  }

  const instance = db.mensalidades[idx];

  if (name !== undefined) instance.name = name;
  if (value !== undefined) instance.value = Number(value);
  if (dueDay !== undefined) {
    const numDay = Number(dueDay);
    if (numDay >= 1 && numDay <= 31) {
      instance.dueDay = numDay;
    }
  }
  if (category !== undefined) instance.category = category;
  if (status !== undefined) instance.status = status as MensalidadeStatus;

  instance.lastUpdated = new Date().toISOString();

  // Se a instância tiver um template associado, atualiza o template correspondente
  // para que os meses subsequentes herdem essas edições estruturais
  if (instance.templateId && db.mensalidadesTemplates) {
    const tIdx = db.mensalidadesTemplates.findIndex(t => t.id === instance.templateId);
    if (tIdx !== -1) {
      if (name !== undefined) db.mensalidadesTemplates[tIdx].name = name;
      if (value !== undefined) db.mensalidadesTemplates[tIdx].value = Number(value);
      if (dueDay !== undefined) {
        const numDay = Number(dueDay);
        if (numDay >= 1 && numDay <= 31) {
          db.mensalidadesTemplates[tIdx].dueDay = numDay;
        }
      }
      if (category !== undefined) db.mensalidadesTemplates[tIdx].category = category;
    }
  }

  saveDb(db);
  return res.json(instance);
});

// Upload de boleto PDF (conclui ou muda status para concluído/aguardando boleto)
app.post('/api/mensalidades/:id/upload', (req, res) => {
  const { id } = req.params;

  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo PDF não recebido.' });
    }

    const db = loadDb();
    const idx = db.mensalidades.findIndex(m => m.id === id);

    if (idx === -1) {
      // Exclui o arquivo salvo se não achar a mensalidade correspondente
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
      return res.status(404).json({ error: 'Mensalidade não encontrada.' });
    }

    // Configura caminho do boleto enviado
    const relativePath = `/uploads/${req.file.filename}`;
    db.mensalidades[idx].pdfUrl = relativePath;
    db.mensalidades[idx].status = 'completed'; // Ao subir PDF conclui com sucesso
    db.mensalidades[idx].justification = undefined; // Limpa justificativa anterior se houver
    db.mensalidades[idx].lastUpdated = new Date().toISOString();

    saveDb(db);
    return res.json(db.mensalidades[idx]);
  });
});

// Justificar falta de boleto (Justificado exige texto obrigatório)
app.post('/api/mensalidades/:id/justify', (req, res) => {
  const { id } = req.params;
  const { justification } = req.body;

  if (!justification || justification.trim().length === 0) {
    return res.status(400).json({ error: 'A justificativa explicativa é obrigatória.' });
  }

  const db = loadDb();
  const idx = db.mensalidades.findIndex(m => m.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Mensalidade não encontrada.' });
  }

  db.mensalidades[idx].status = 'justified';
  db.mensalidades[idx].justification = justification;
  db.mensalidades[idx].pdfUrl = undefined; // Limpa pdf anterior se houver
  db.mensalidades[idx].lastUpdated = new Date().toISOString();

  saveDb(db);
  return res.json(db.mensalidades[idx]);
});

// Deletar mensalidade (Para a recorrência futura e remove a instância atual sem deletar histórico de outros meses)
app.delete('/api/mensalidades/:id', (req, res) => {
  const { id } = req.params;
  const db = loadDb();
  
  const recordIndex = db.mensalidades.findIndex(m => m.id === id);
  if (recordIndex === -1) {
    return res.status(404).json({ error: 'Mensalidade não encontrada.' });
  }

  const record = db.mensalidades[recordIndex];

  // Opcional: deletar arquivo PDF se houver
  if (record.pdfUrl) {
    const fullPath = path.join(process.cwd(), record.pdfUrl);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (e) {}
    }
  }

  // Deleta o template se existir, parando a renovação futura
  if (record.templateId && db.mensalidadesTemplates) {
    db.mensalidadesTemplates = db.mensalidadesTemplates.filter(t => t.id !== record.templateId);
  }

  // Deleta do mês corrente
  db.mensalidades = db.mensalidades.filter(m => m.id !== id);

  saveDb(db);
  return res.json({ success: true, message: 'Mensalidade e recorrência futura excluídas com sucesso. Histórico de meses passados preservado.' });
});


// ==========================================
// NOTIFICAÇÕES & CRIACAO DE ALERTAS (Vencimento)
// ==========================================
// O usuário solicitou avisar se a mensalidade está próxima, notificando 2 dias e 1 dia antes.
app.get('/api/notifications', (req, res) => {
  const db = loadDb();
  const currentDate = new Date();
  const currentDaysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const todayNum = currentDate.getDate();

  const alerts: Array<{
    id: string;
    mensalidadeId: string;
    name: string;
    value: number;
    dueDay: number;
    daysLeft: number;
    type: 'warning_2_days' | 'urgent_1_day' | 'today';
    message: string;
  }> = [];

  // Pega mensalidades que não estão 'completed' ou 'justified' e pertencem ao mês corrente
  const currentMonth = new Date().toISOString().substring(0, 7);
  const pendingBills = db.mensalidades.filter(m => 
    (m.status === 'pending' || m.status === 'waiting_bill') && 
    (m.month === currentMonth || !m.month)
  );

  for (const bill of pendingBills) {
    // Calcula quantos dias faltam para o dueDay
    let daysLeft = bill.dueDay - todayNum;
    
    // Se o vencimento já passou neste mês, calcula em relação ao próximo mês
    if (daysLeft < 0) {
      daysLeft = (currentDaysInMonth - todayNum) + bill.dueDay;
    }

    if (daysLeft === 2) {
      alerts.push({
        id: `alert-2-${bill.id}`,
        mensalidadeId: bill.id,
        name: bill.name,
        value: bill.value,
        dueDay: bill.dueDay,
        daysLeft,
        type: 'warning_2_days',
        message: `⚠️ Alerta de Vencimento: Falta apenas 2 dias para vencer a mensalidade "${bill.name}" (R$ ${bill.value.toFixed(2)}).`
      });
    } else if (daysLeft === 1) {
      alerts.push({
        id: `alert-1-${bill.id}`,
        mensalidadeId: bill.id,
        name: bill.name,
        value: bill.value,
        dueDay: bill.dueDay,
        daysLeft,
        type: 'urgent_1_day',
        message: `🚨 URGENTE: Falta apenas 1 dia para o vencimento da mensalidade "${bill.name}" (R$ ${bill.value.toFixed(2)})!`
      });
    } else if (daysLeft === 0) {
      alerts.push({
        id: `alert-0-${bill.id}`,
        mensalidadeId: bill.id,
        name: bill.name,
        value: bill.value,
        dueDay: bill.dueDay,
        daysLeft: 0,
        type: 'today',
        message: `🔥 VENCE HOJE: O boleto de "${bill.name}" vence hoje! Realize o upload do boleto para concluir.`
      });
    }
  }

  return res.json(alerts);
});


// ==========================================
// ROTAS DE PEDIDOS DE PINTOS
// ==========================================

// Retorna o lote padrão/ativo e histórico de lotes
app.get('/api/chicks/batches', (req, res) => {
  const db = loadDb();
  // Ordena por data mais recente
  const sorted = [...db.batches].sort((a,b) => b.openedAt.localeCompare(a.openedAt));
  return res.json(sorted);
});

// Abre lote semanal manual
app.post('/api/chicks/batch/open', (req, res) => {
  const { openedBy } = req.body;
  if (!openedBy) {
    return res.status(400).json({ error: 'Para abrir um lote é necessário identificar quem abriu.' });
  }

  const db = loadDb();
  
  // Só pode haver 1 lote aberto por vez
  const openBatchExists = db.batches.some(b => b.status === 'open');
  if (openBatchExists) {
    return res.status(400).json({ error: 'Já existe um pedido de pintos aberto no momento! Finalize o atual para poder abrir um novo.' });
  }

  // Calcula a próxima segunda-feira como data de entrega
  const getNextMonday = (): string => {
    const d = new Date();
    const day = d.getDay();
    // Próxima segunda: se hoje for segunda (1), adiciona 7 dias. Se não, calcula distância.
    const distanceToMon = (1 - day + 7) % 7;
    const daysToAdd = distanceToMon === 0 ? 7 : distanceToMon;
    d.setDate(d.getDate() + daysToAdd);
    return d.toISOString().split('T')[0];
  };

  const newBatch: ChickBatch = {
    id: `batch-${Date.now()}`,
    openedBy,
    openedAt: new Date().toISOString(),
    deliveryDate: getNextMonday(),
    status: 'open',
    orders: []
  };

  db.batches.push(newBatch);
  saveDb(db);

  return res.json(newBatch);
});

// Adiciona cliente e quantidades de espécies ao lote aberto
app.post('/api/chicks/batch/order', (req, res) => {
  const { batchId, customerName, quantities, observation } = req.body;
  
  if (!batchId || !customerName || !quantities || !Array.isArray(quantities)) {
    return res.status(400).json({ error: 'Dados incompletos para registrar o pedido do cliente.' });
  }

  const db = loadDb();
  const batchIdx = db.batches.findIndex(b => b.id === batchId);

  if (batchIdx === -1) {
    return res.status(404).json({ error: 'Lote de pedidos não encontrado.' });
  }

  if (db.batches[batchIdx].status !== 'open') {
    return res.status(400).json({ error: 'Este lote já se encontra finalizado. Não é permitido adicionar novos pedidos.' });
  }

  // Validação rígida de espécie/pinto quantidade. Se o campo de quantidade não tiver número, é 0.
  const formattedQuantities: BreedQuantity[] = quantities.map((item: any) => ({
    breed: String(item.breed || ''),
    quantity: isNaN(Number(item.quantity)) || Number(item.quantity) <= 0 ? 0 : Math.floor(Number(item.quantity))
  }));

  const newOrder: CustomerOrder = {
    id: `order-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    customerName,
    quantities: formattedQuantities,
    observation: observation || '',
    status: 'registered',
    createdAt: new Date().toISOString()
  };

  db.batches[batchIdx].orders.push(newOrder);
  saveDb(db);

  return res.json(db.batches[batchIdx]);
});

// Exclui pedido de cliente do lote aberto
app.delete('/api/chicks/batch/:batchId/order/:orderId', (req, res) => {
  const { batchId, orderId } = req.params;

  const db = loadDb();
  const batchIdx = db.batches.findIndex(b => b.id === batchId);

  if (batchIdx === -1) {
    return res.status(404).json({ error: 'Lote não encontrado.' });
  }

  if (db.batches[batchIdx].status !== 'open') {
    return res.status(400).json({ error: 'Apenas pedidos de lotes abertos podem ser excluídos.' });
  }

  const initialLen = db.batches[batchIdx].orders.length;
  db.batches[batchIdx].orders = db.batches[batchIdx].orders.filter(o => o.id !== orderId);

  if (db.batches[batchIdx].orders.length === initialLen) {
    return res.status(404).json({ error: 'Pedido do cliente não encontrado.' });
  }

  saveDb(db);
  return res.json(db.batches[batchIdx]);
});

// Alterna status de entrega de um pedido de cliente (Registrado -> Entregue)
app.put('/api/chicks/batch/:batchId/order/:orderId/deliver', (req, res) => {
  const { batchId, orderId } = req.params;
  const { status } = req.body; // 'registered' | 'delivered'

  const db = loadDb();
  const batchIdx = db.batches.findIndex(b => b.id === batchId);

  if (batchIdx === -1) {
    return res.status(404).json({ error: 'Lote não encontrado.' });
  }

  const orderIdx = db.batches[batchIdx].orders.findIndex(o => o.id === orderId);
  if (orderIdx === -1) {
    return res.status(404).json({ error: 'Pedido do cliente não encontrado.' });
  }

  db.batches[batchIdx].orders[orderIdx].status = (status || 'delivered') as CustomerOrderStatus;
  saveDb(db);

  return res.json(db.batches[batchIdx]);
});

// Finaliza o lote atual
app.post('/api/chicks/batch/:batchId/finalize', (req, res) => {
  const { batchId } = req.params;

  const db = loadDb();
  const batchIdx = db.batches.findIndex(b => b.id === batchId);

  if (batchIdx === -1) {
    return res.status(404).json({ error: 'Lote não encontrado.' });
  }

  if (db.batches[batchIdx].status !== 'open') {
    return res.status(400).json({ error: 'Lote de pedidos já está finalizado.' });
  }

  db.batches[batchIdx].status = 'finalized';
  db.batches[batchIdx].finalizedAt = new Date().toISOString();

  saveDb(db);
  return res.json(db.batches[batchIdx]);
});


// ==========================================
// ROTAS DINÂMICAS DE ESPÉCIES (BREEDS) DE PINTOS
// ==========================================

// Retorna todas as espécies cadastradas
app.get('/api/chicks/breeds', (req, res) => {
  const db = loadDb();
  if (!db.breeds) {
    db.breeds = [
      'Pinto de Corte (Frango / Pesado)',
      'Pinto de Postura (Poedeira de Ovos)',
      'Pinto Carijó Especial',
      'Pinto Caipira Colonial',
      'Pinto Pescoço Pelado Caipira',
      'Pinto de Angola (Tô Fraco)'
    ];
  }
  return res.json(db.breeds);
});

// Cadastra uma nova espécie de pinto
app.post('/api/chicks/breeds', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'O nome da espécie é obrigatório!' });
  }

  const db = loadDb();
  if (!db.breeds) db.breeds = [];

  const trimmedName = name.trim();
  if (db.breeds.some(b => b.toLowerCase() === trimmedName.toLowerCase())) {
    return res.status(400).json({ error: 'Esta espécie já está cadastrada.' });
  }

  db.breeds.push(trimmedName);
  saveDb(db);
  return res.json({ success: true, breeds: db.breeds });
});

// Exclui uma espécie, mas apenas se todos os clientes correspondentes estiverem 'delivered' (status: ENTREGUE)
app.delete('/api/chicks/breeds/:name', (req, res) => {
  const { name } = req.params;
  const db = loadDb();

  if (!db.breeds) {
    db.breeds = [];
  }

  // Verifica se o lote atual ou lotes passados têm clientes com esta espécie cuja entrega ainda não foi realizada (registrado)
  let lockReason = null;
  for (const batch of db.batches) {
    for (const order of batch.orders) {
      const match = order.quantities.find(q => q.breed === name);
      if (match && match.quantity > 0 && order.status !== 'delivered') {
        lockReason = `O cliente "${order.customerName}" possui um pedido não entregue (Pendente) desta espécie no lote com entrega estipulada para ${new Date(batch.deliveryDate + 'T12:00:00Z').toLocaleDateString()}.`;
        break;
      }
    }
    if (lockReason) break;
  }

  if (lockReason) {
    return res.status(400).json({ error: `Impossível remover espécie: ${lockReason} Para remover, todos os clientes que solicitaram esta espécie devem estar com o status ENTREGUE.` });
  }

  db.breeds = db.breeds.filter(b => b !== name);
  saveDb(db);
  return res.json({ success: true, breeds: db.breeds });
});


// ==========================================
// ROTA ADICIONAL KANBAN DE REABRIR DIA
// ==========================================
app.post('/api/kanban/reopen-day', (req, res) => {
  const { userId, date } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Usuário é obrigatório para reabrir o dia.' });
  }

  const targetDate = date || new Date().toISOString().split('T')[0];
  const db = loadDb();

  // Encontra a entrada do histórico correspondente a esse usuário e data
  const historyIdx = db.history.findIndex(h => h.userId === userId && h.date === targetDate);
  if (historyIdx === -1) {
    return res.status(404).json({ error: 'Nenhum histórico de encerramento do dia encontrado para hoje para este usuário.' });
  }

  const entry = db.history[historyIdx];

  // Restaura as tarefas consolidadas de volta ao Kanban ativo na coluna 'completed' (Concluído)
  if (entry.tasks && entry.tasks.length > 0) {
    const restoredTasks: KanbanTask[] = entry.tasks.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description || '',
      status: 'completed',
      userId: entry.userId,
      userName: entry.userName,
      createdAt: new Date().toISOString()
    }));
    db.tasks.push(...restoredTasks);
  }

  // Remove o registro de histórico desta data para reabrir o dia
  db.history.splice(historyIdx, 1);
  saveDb(db);

  return res.json({ success: true });
});


// ==========================================
// VITE MIDDLEWARE & SERVIDOR DE PRODUÇÃO
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FocoDiario Server running on http://localhost:${PORT}`);
  });
}

startServer();
