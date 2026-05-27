import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import crypto from 'crypto';
import pg from 'pg';
const { Pool } = pg;
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

// Configuração de Conexão com PostgreSQL (seja Vercel Postgres ou DATABASE_URL padrão)
// Dá preferência para o parãmetro de conexão securitizado do Vercel
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
let pool: pg.Pool | null = null;

if (connectionString) {
  console.log('PostgreSQL detectado! Inicializando conexão segura com o banco...');
  pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false // Essencial para conexões seguras de servidores de hospedagem como Vercel/Neon
    }
  });
}

// Diretorios necessarios para o sistema (fallback local se necessário)
const DATA_DIR = path.join(process.cwd(), 'data');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const DB_FILE = path.join(DATA_DIR, 'focodiario_db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const SECRET_KEY = process.env.API_SECRET_KEY || 'focodiario_secret_key_2026_super_secure';


function createToken(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 12 * 60 * 60 * 1000 })).toString('base64url'); // 12h exp
  const signature = crypto.createHmac('sha256', SECRET_KEY)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', SECRET_KEY)
      .update(`${header}.${body}`)
      .digest('base64url');
    if (signature !== expectedSignature) return null;
    
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch (error) {
    return null;
  }
}

function authenticate(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Formato do token inválido.' });
  }

  const payload = verifyToken(parts[1]);
  if (!payload) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Efetue login novamente.' });
  }

  req.user = payload;
  next();
}

function requireAdmin(req: any, res: any, next: any) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Permissão negada. Apenas administradores podem executar esta ação.' });
  }
  next();
}

function isValidPdfBytes(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);
    
    // O cabeçalho deve iniciar exatamente com os bites do marcador '%PDF'
    return buffer.toString('utf8') === '%PDF';
  } catch (error) {
    return false;
  }
}

// Configura o middleware para servir uploads estaticamente APENAS mediante login verificado
app.get('/uploads/:filename', (req, res) => {
  const { filename } = req.params;
  const { token } = req.query;

  let verifiedUser = null;
  
  // Tenta extrair token pelo header ou pelo query parameter (links diretos do navegador)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    verifiedUser = verifyToken(authHeader.substring(7));
  } else if (typeof token === 'string') {
    verifiedUser = verifyToken(token);
  }

  if (!verifiedUser) {
    return res.status(403).send('Acesso proibido. Faça login no sistema para visualizar boletos e comprovantes de pagamento.');
  }

  // Previne Path Traversal (segurança contra vazamento de arquivos do sistema)
  const safeFilename = path.basename(filename);
  const filePath = path.join(UPLOADS_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Arquivo não encontrado.');
  }

  return res.sendFile(filePath);
});

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

// Funções utilitárias de carga/escrita do arquivo local
function loadDbFromFile(): DatabaseSchema {
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
        saveDbToFile(db);
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
  saveDbToFile(initialDb);
  return initialDb;
}

function saveDbToFile(db: DatabaseSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (error) {
    console.error('Erro ao salvar banco de dados JSON:', error);
  }
}

// Inicializa a tabela focodiario_state no PostgreSQL caso conectando ao banco pela primeira vez
async function initPostgresDb() {
  if (!pool) return;
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS focodiario_state (
          id INT PRIMARY KEY,
          data JSONB,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      const checkRes = await client.query('SELECT COUNT(*) FROM focodiario_state WHERE id = 1;');
      if (parseInt(checkRes.rows[0].count, 10) === 0) {
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
        await client.query(
          'INSERT INTO focodiario_state (id, data) VALUES ($1, $2);',
          [1, JSON.stringify(initialDb)]
        );
        console.log('Tabela de estado persistente criada no PostgreSQL com as credenciais iniciais.');
      } else {
        console.log('Banco PostgreSQL conectado e verificado com sucesso.');
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Falha de inicialização no PostgreSQL:', err);
  }
}

// Estado em memória (cached) para servir requisições de forma ultrarrápida
let cachedDb: DatabaseSchema | null = null;

function loadDb(): DatabaseSchema {
  if (cachedDb) return cachedDb;
  return loadDbFromFile();
}

function saveDb(db: DatabaseSchema) {
  cachedDb = db;
  saveDbToFile(db);
  
  if (pool) {
    const syncPromise = pool.query(
      'INSERT INTO focodiario_state (id, data, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP;',
      [1, JSON.stringify(db)]
    ).catch((err: any) => {
      console.error('Erro de sincronização assíncrona com PostgreSQL:', err);
    });

    const activeReq = (global as any).currentExpressRequest;
    if (activeReq && typeof activeReq.trackWrite === 'function') {
      activeReq.trackWrite(syncPromise);
    }
  }
}

// Registra interceptor de requisições do Express para sincronizar dados Postgres
app.use(async (req: any, res: any, next: any) => {
  (global as any).currentExpressRequest = req;

  const originalJson = res.json;
  const pendingWrites: Array<Promise<any>> = [];

  req.trackWrite = (promise: Promise<any>) => {
    pendingWrites.push(promise);
  };

  res.json = async function(data: any) {
    if (pendingWrites.length > 0) {
      await Promise.all(pendingWrites).catch(err => {
        console.error('Erro ao aguardar conclusões de escrita pendentes no Postgres:', err);
      });
    }
    return originalJson.call(res, data);
  };

  if (pool) {
    try {
      const dbResult = await pool.query('SELECT data FROM focodiario_state WHERE id = 1 LIMIT 1;');
      if (dbResult.rows && dbResult.rows.length > 0) {
        cachedDb = dbResult.rows[0].data;
      }
    } catch (err) {
      console.error('Erro ao carregar dados do Postgres para a requisição. Usando backup local em cache:', err);
    }
  }

  next();
});

// Inicialização imediata
if (pool) {
  initPostgresDb().then(async () => {
    try {
      const dbResult = await pool.query('SELECT data FROM focodiario_state WHERE id = 1 LIMIT 1;');
      if (dbResult.rows && dbResult.rows.length > 0) {
        cachedDb = dbResult.rows[0].data;
        console.log('Cache inicial de dados Postgres preenchido com sucesso.');
      }
    } catch (e) {
      console.log('Falha ao obter cache inicial Postgres. Utilizando arquivo local.');
      cachedDb = loadDbFromFile();
    }
  });
} else {
  loadDb();
}


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
    const userPayload = {
      id: foundUser.id,
      username: foundUser.username,
      name: foundUser.name,
      role: foundUser.role
    };
    const token = createToken(userPayload);
    // Retorna os dados publicos do usuario autenticado com seguranca e o token assinado stateless
    return res.json({
      ...userPayload,
      token
    });
  }

  return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
});

// Novo registro de usuário (Admin Only)
app.post('/api/auth/register', authenticate, requireAdmin, (req, res) => {
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
// ROTAS DE GERENCIAMENTO DE USUÁRIOS (ADMIN ONLY)
// ==========================================

// Listar todos os usuários (Sem hashes/salts por segurança)
app.get('/api/users', authenticate, requireAdmin, (req, res) => {
  const db = loadDb();
  const safeUsers = db.users.map(u => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role
  }));
  return res.json(safeUsers);
});

// Criar novo usuário (Admin Only)
app.post('/api/users', authenticate, requireAdmin, (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios para registrar um novo usuário.' });
  }

  const db = loadDb();
  const exists = db.users.some(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: 'Este nome de usuário já está sendo utilizado.' });
  }

  const salt = generateSalt();
  const newUser = {
    id: `u-${Date.now()}`,
    username: username.trim().toLowerCase(),
    name: name.trim(),
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

// Editar usuário (Admin Only) - Altera nome, login, função e senha (se enviada)
app.put('/api/users/:id', authenticate, requireAdmin, (req: any, res: any) => {
  const { id } = req.params;
  const { username, password, name, role } = req.body;

  const db = loadDb();
  const userIdx = db.users.findIndex(u => u.id === id);
  if (userIdx === -1) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  const targetUser = db.users[userIdx];

  // Regra contra auto-rebaixamento de nível
  if (req.user.id === id && role && role !== 'admin') {
    return res.status(400).json({ error: 'Por segurança, você não pode alterar ou rebaixar seu próprio nível de administrador.' });
  }

  // Verifica se o novo username já existe em outro usuário
  if (username) {
    const cleanedUsername = username.trim().toLowerCase();
    const exists = db.users.some(u => u.id !== id && u.username.toLowerCase() === cleanedUsername);
    if (exists) {
      return res.status(400).json({ error: 'Este login de usuário já está em uso por outra pessoa.' });
    }
    targetUser.username = cleanedUsername;
  }

  if (name) targetUser.name = name.trim();
  if (role) targetUser.role = role as UserRole;

  // Atualiza senha se fornecida
  if (password && password.trim() !== '') {
    const salt = generateSalt();
    targetUser.salt = salt;
    targetUser.passwordHash = hashPassword(password, salt);
  }

  saveDb(db);

  return res.json({
    id: targetUser.id,
    username: targetUser.username,
    name: targetUser.name,
    role: targetUser.role
  });
});

// Excluir usuário (Admin Only)
app.delete('/api/users/:id', authenticate, requireAdmin, (req: any, res: any) => {
  const { id } = req.params;

  // Impede que o próprio usuário administrador se exclua do sistema
  if (req.user.id === id) {
    return res.status(400).json({ error: 'Segurança: Você não pode remover sua própria conta estando conectado a ela.' });
  }

  const db = loadDb();
  const initialLen = db.users.length;
  db.users = db.users.filter(u => u.id !== id);

  if (db.users.length === initialLen) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  saveDb(db);
  return res.json({ success: true, message: 'Usuário excluído com sucesso.' });
});

// ==========================================================
// ROTAS DE KANBAN
// ==========================================

// Retorna tarefas de Kanban
app.get('/api/kanban', authenticate, (req: any, res: any) => {
  const db = loadDb();
  let { userId } = req.query;

  // Se não for admin, NUNCA deixa consultar tarefas de outro usuário
  if (req.user.role !== 'admin') {
    userId = req.user.id;
  }

  let filteredTasks = db.tasks;
  if (userId) {
    filteredTasks = db.tasks.filter(t => t.userId === userId);
  }
  return res.json(filteredTasks);
});

// Cria tarefa
app.post('/api/kanban', authenticate, (req: any, res: any) => {
  let { title, description, status, userId, userName } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Título do Kanban é obrigatório.' });
  }

  // Se não for admin, força os dados serem do próprio usuário logado
  if (req.user.role !== 'admin') {
    userId = req.user.id;
    userName = req.user.name;
  } else {
    // Se for admin e não enviou, pega do próprio admin ou usa default
    if (!userId) userId = req.user.id;
    if (!userName) userName = req.user.name;
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
app.put('/api/kanban/:id', authenticate, (req: any, res: any) => {
  const { id } = req.params;
  const { title, description, status } = req.body;

  const db = loadDb();
  const taskIdx = db.tasks.findIndex(t => t.id === id);

  if (taskIdx === -1) {
    return res.status(404).json({ error: 'Tarefa não encontrada.' });
  }

  // Se não for admin, o dono da tarefa DEVE ser o usuário que está editando
  if (req.user.role !== 'admin' && db.tasks[taskIdx].userId !== req.user.id) {
    return res.status(403).json({ error: 'Permissão negada. Você só pode modificar suas próprias tarefas.' });
  }

  if (title !== undefined) db.tasks[taskIdx].title = title;
  if (description !== undefined) db.tasks[taskIdx].description = description;
  if (status !== undefined) db.tasks[taskIdx].status = status as TaskStatus;

  saveDb(db);
  return res.json(db.tasks[taskIdx]);
});

// Deleta tarefa
app.delete('/api/kanban/:id', authenticate, (req: any, res: any) => {
  const { id } = req.params;
  const db = loadDb();
  const taskIdx = db.tasks.findIndex(t => t.id === id);

  if (taskIdx === -1) {
    return res.status(404).json({ error: 'Tarefa não encontrada.' });
  }

  // Se não for admin, o dono da tarefa DEVE ser o usuário que está deletando
  if (req.user.role !== 'admin' && db.tasks[taskIdx].userId !== req.user.id) {
    return res.status(403).json({ error: 'Permissão negada. Você só pode deletar suas próprias tarefas.' });
  }

  db.tasks.splice(taskIdx, 1);
  saveDb(db);
  return res.json({ success: true });
});

// Encerrar o Dia (Limpa Concluídos e salva no Histórico com data)
app.post('/api/kanban/close-day', authenticate, (req: any, res: any) => {
  let { userId, userName } = req.body;

  // Se não for admin, força para fechar as próprias tarefas
  if (req.user.role !== 'admin') {
    userId = req.user.id;
    userName = req.user.name;
  } else {
    if (!userId) userId = req.user.id;
    if (!userName) userName = req.user.name;
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
app.get('/api/kanban/history', authenticate, (req: any, res: any) => {
  const db = loadDb();
  let { date, userId } = req.query;

  // Se não for admin, força para buscar apenas o próprio histórico
  if (req.user.role !== 'admin') {
    userId = req.user.id;
  }

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
app.get('/api/mensalidades', authenticate, requireAdmin, (req, res) => {
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
app.post('/api/mensalidades', authenticate, requireAdmin, (req, res) => {
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
app.put('/api/mensalidades/:id', authenticate, requireAdmin, (req, res) => {
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
app.post('/api/mensalidades/:id/upload', authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;

  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo PDF não recebido.' });
    }

    // Validação profunda por cabeçalho mágico de assinatura binária (%PDF)
    if (!isValidPdfBytes(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
      return res.status(400).json({ error: 'Segurança: O arquivo enviado possui extensão .pdf mas seu conteúdo binário interno não corresponde a um documento PDF legítimo.' });
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
app.post('/api/mensalidades/:id/justify', authenticate, requireAdmin, (req, res) => {
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
app.delete('/api/mensalidades/:id', authenticate, requireAdmin, (req, res) => {
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
app.get('/api/notifications', authenticate, (req, res) => {
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
app.get('/api/chicks/batches', authenticate, (req, res) => {
  const db = loadDb();
  // Ordena por data mais recente
  const sorted = [...db.batches].sort((a,b) => b.openedAt.localeCompare(a.openedAt));
  return res.json(sorted);
});

// Abre lote semanal manual
app.post('/api/chicks/batch/open', authenticate, (req, res) => {
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
app.post('/api/chicks/batch/order', authenticate, (req, res) => {
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
app.delete('/api/chicks/batch/:batchId/order/:orderId', authenticate, (req, res) => {
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
app.put('/api/chicks/batch/:batchId/order/:orderId/deliver', authenticate, (req, res) => {
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
app.post('/api/chicks/batch/:batchId/finalize', authenticate, (req, res) => {
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
app.get('/api/chicks/breeds', authenticate, (req, res) => {
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
app.post('/api/chicks/breeds', authenticate, (req, res) => {
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
app.delete('/api/chicks/breeds/:name', authenticate, (req, res) => {
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
app.post('/api/kanban/reopen-day', authenticate, (req: any, res: any) => {
  let { userId, date } = req.body;
  
  if (req.user.role !== 'admin') {
    userId = req.user.id;
  }

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
