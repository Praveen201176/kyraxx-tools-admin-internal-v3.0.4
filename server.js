import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'a358dd72dd34c42ca2f175595df70d099636c014';
const ADMIN_USER = process.env.ADMIN_USERNAME || 'DR1P7@VS';
const ADMIN_PASS = process.env.ADMIN_PASS || 'DR1P7@2008VS';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Serve index.html for root and any non-API routes
app.get('/', (req, res) => {
  console.log('Serving index.html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

app.use(express.static('public'));

// In-memory state
const clients = new Map(); // client_id -> { status, last_seen }
let killDirective = { kill_all: false, kill_clients: [], message: '' };

// Utility
const now = () => new Date();
const isActive = (dt) => (now() - dt) <= 120 * 1000; // 2 minutes

// Auth helpers
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
function auth(req, res, next) {
  try {
    const header = req.headers['authorization'] || '';
    const [, token] = header.split(' ');
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

// Admin login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = signToken({ role: 'admin', sub: 'kyraxx-admin' });
    return res.json({ token });
  }
  return res.status(401).json({ error: 'invalid_credentials' });
});

// Heartbeat from clients (open)
app.post('/api/heartbeat', (req, res) => {
  try {
    const { client_id, status, ts } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id required' });
    clients.set(client_id, {
      status: status || '',
      last_seen: ts ? new Date(ts) : now()
    });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'heartbeat_failed' });
  }
});

// Admin: list clients (protected)
app.get('/api/clients', auth, (_req, res) => {
  const list = Array.from(clients.entries()).map(([id, v]) => ({
    client_id: id,
    status: v.status,
    last_seen: v.last_seen,
    active: isActive(v.last_seen)
  })).sort((a,b) => (a.client_id > b.client_id ? 1 : -1));
  res.json({ clients: list, server_time: now() });
});

// Client poll for kill directive (open)
app.get('/api/kill', (_req, res) => {
  res.json(killDirective);
});

// Admin: set kill directives (protected)
app.post('/api/kill', auth, (req, res) => {
  const { kill_all, kill_clients, message } = req.body || {};
  const msg = typeof message === 'string' ? message : '';
  if (kill_all === true) {
    killDirective = { kill_all: true, kill_clients: [], message: msg };
    return res.json({ ok: true, killDirective });
  }
  if (Array.isArray(kill_clients)) {
    const filtered = kill_clients.filter(x => typeof x === 'string');
    killDirective = { kill_all: false, kill_clients: filtered, message: msg };
    return res.json({ ok: true, killDirective });
  }
  return res.status(400).json({ error: 'invalid_payload' });
});

// Admin: clear kill directives (protected)
app.post('/api/kill/clear', auth, (_req, res) => {
  killDirective = { kill_all: false, kill_clients: [], message: '' };
  res.json({ ok: true, killDirective });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Server running on http://0.0.0.0:${PORT}`);
  console.log('✓ Environment:', process.env.NODE_ENV || 'development');
  console.log('✓ Admin user:', ADMIN_USER);
}).on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

