import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'a358dd72dd34c42ca2f175595df70d099636c014';
const ADMIN_USER = process.env.ADMIN_USERNAME || 'DR1P7@VS';
const ADMIN_PASS = process.env.ADMIN_PASS || 'DR1P7@2008VS';

// --- Remote offsets & bones config ---
const defaultConfig = {
  offsets: {
    Il2Cpp: '0x0',
    InitBase: '0x983FF10',
    StaticClass: '0x5C',
    CurrentMatch: '0x50',
    MatchStatus: '0x3C',
    LocalPlayer: '0x44',
    DictionaryEntities: '0x68',
    Player_IsDead: '0x4C',
    Player_Name: '0x24C',
    Player_Data: '0x44',
    Player_ShadowBase: '0x149C',
    XPose: '0x78',
    AvatarManager: '0x420',
    Avatar: '0x94',
    Avatar_IsVisible: '0x7C',
    Avatar_Data: '0x10',
    Avatar_Data_IsTeam: '0x51',
    AvatarPropManager: '0x3DC',
    FollowCamera: '0x3B0',
    Camera: '0x14',
    AimRotation: '0x368',
    MainCameraTransform: '0x1BC',
    Weapon: '0x35C',
    WeaponData: '0x54',
    WeaponRecoil: '0xC',
    ViewMatrix: '0xBC',
    SilentAim: '0x4A0',
    sAim1: '0x4A0',
    sAim2: '0x874',
    sAim3: '0x38',
    sAim4: '0x2C'
  },
  bones: {
    Head: '0x3B8',
    Root: '0x3CC',
    LeftWrist: '0x3B4',
    Spine: '0x3C0',
    Hip: '0x3C8',
    RightCalf: '0x3D0',
    LeftCalf: '0x3D4',
    RightFoot: '0x3D8',
    LeftFoot: '0x3DC',
    RightWrist: '0x3E0',
    LeftHand: '0x3E4',
    LeftSholder: '0x3EC',
    RightSholder: '0x3F0',
    RightWristJoint: '0x3F4',
    LeftWristJoint: '0x3F8',
    LeftElbow: '0x3FC',
    RightElbow: '0x400',
    Pelvis: '0x3C',
    LeftShoulder: '0x3EC',
    RightShoulder: '0x3F0'
  }
};

let configState = JSON.parse(JSON.stringify(defaultConfig));
const CONFIG_PATH = path.join(__dirname, 'config.json');

function mergeConfig(base, incoming) {
  const result = { ...base };
  if (!incoming || typeof incoming !== 'object') return result;

  for (const sectionKey of ['offsets', 'bones']) {
    const baseSection = base[sectionKey];
    const incSection = incoming[sectionKey];
    if (!baseSection || typeof baseSection !== 'object' || !incSection || typeof incSection !== 'object') continue;

    const merged = { ...baseSection };
    for (const [k, v] of Object.entries(incSection)) {
      if (Object.prototype.hasOwnProperty.call(merged, k) && typeof v === 'string') {
        merged[k] = v;
      }
    }
    result[sectionKey] = merged;
  }

  return result;
}

try {
  if (fs.existsSync(CONFIG_PATH)) {
    const disk = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    configState = mergeConfig(configState, disk);
    console.log('Loaded config.json for offsets/bones');
  }
} catch (e) {
  console.error('Failed to load config.json:', e);
}

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

// --- Offsets/Bones config API ---
app.get('/api/config', (req, res) => {
  res.json(configState);
});

app.post('/api/config', auth, (req, res) => {
  try {
    const body = req.body || {};
    if (!body.offsets && !body.bones) {
      return res.status(400).json({ error: 'no_config' });
    }

    configState = mergeConfig(configState, body);

    fs.writeFile(CONFIG_PATH, JSON.stringify(configState, null, 2), (err) => {
      if (err) {
        console.error('Failed to write config.json:', err);
        return res.status(500).json({ error: 'save_failed' });
      }
      return res.json({ ok: true, config: configState });
    });
  } catch (e) {
    console.error('Config update error:', e);
    return res.status(500).json({ error: 'config_update_failed' });
  }
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
