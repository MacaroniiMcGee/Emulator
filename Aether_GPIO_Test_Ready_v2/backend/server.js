// server.js — libgpiod-backed backend with automation system
// Run with: sudo node server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { spawn, execFile } = require('child_process');
const EventEmitter = require('events');
const AutomationManager = require('./automation/AutomationManager');

const CHIP = 'gpiochip0';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET","POST"] } });

app.use(cors());
app.use(express.json());

// Create GPIO event emitter for automation system
class GPIOEventEmitter extends EventEmitter {}
const gpioEvents = new GPIOEventEmitter();

// Initialize automation system
let automationManager;

async function initializeAutomation() {
  try {
    automationManager = new AutomationManager(gpioEvents);
    await automationManager.initialize();
    console.log('[Automation] ✓ System initialized successfully');
  } catch (err) {
    console.error('[Automation] ✗ Failed to initialize:', err.message);
  }
}

// Call initialization
initializeAutomation();

// Request logger
app.use((req, _res, next) => { 
  console.log(`[REQ] ${req.method} ${req.url}`, req.body || ''); 
  next(); 
});

// Keep a gpioset process alive per pin to hold the level
const procs = new Map();
const states = new Map();

function killProc(pin) {
  const p = procs.get(pin);
  if (p && !p.killed) { 
    try { 
      process.kill(p.pid, 'SIGKILL'); 
    } catch {} 
  }
  procs.delete(pin);
}

function holdLevel(pin, value /*0|1*/) {
  killProc(pin);
  const args = ['-c', CHIP, `${pin}=${value}`];
  console.log(`[GPIO] Executing: gpioset ${args.join(' ')}`);
  
  const p = spawn('gpioset', args, { 
    stdio: ['ignore', 'pipe', 'pipe'] 
  });
  
  let stderrData = '';
  p.stderr.on('data', (data) => {
    stderrData += data.toString();
  });
  
  procs.set(pin, p);
  states.set(pin, value);
  
  // ⭐ EMIT EVENT FOR AUTOMATION SYSTEM
  gpioEvents.emit('gpio_change', { 
    pin, 
    value, 
    timestamp: Date.now() 
  });
  
  p.on('exit', (code) => { 
    if (procs.get(pin) === p) {
      procs.delete(pin);
      if (code !== 0) {
        console.error(`[GPIO] ✗ ERROR for pin ${pin}: Exit code ${code}`);
        console.error(`[GPIO] stderr: ${stderrData.trim()}`);
      } else {
        console.log(`[GPIO] ✓ Pin ${pin} successfully set to ${value}`);
      }
    }
  });
  
  p.on('error', (err) => {
    console.error(`[GPIO] Error spawning gpioset for pin ${pin}:`, err.message);
  });
  
  console.log(`[GPIO] Pin ${pin} command sent (PID: ${p.pid})`);
}

function readLevel(pin) {
  return new Promise((resolve, reject) => {
    execFile('gpioget', ['-c', CHIP, String(pin)], (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      const txt = String(stdout).trim();
      if (txt === '0' || txt === '1') return resolve(parseInt(txt, 10));
      const m = txt.match(/=\s*(active|inactive)/i);
      if (m) return resolve(m[1].toLowerCase() === 'active' ? 1 : 0);
      resolve(states.get(pin) ?? 0);
    });
  });
}

async function pulse(pin, msec = 300) {
  console.log(`[GPIO] Pulsing pin ${pin} for ${msec}ms`);
  holdLevel(pin, 1);
  await new Promise(r => setTimeout(r, Math.max(1, msec)));
  holdLevel(pin, 0);
}

// Handle automation-triggered GPIO actions
gpioEvents.on('gpio_action', (data) => {
  const { pin, value } = data;
  console.log(`[Automation] Triggering GPIO ${pin} = ${value}`);
  holdLevel(pin, value);
});

// ---- Standard GPIO Routes ----
app.get(['/api/health','/health'], (_req, res) => {
  res.json({ 
    success: true, 
    driver: 'libgpiod-tools', 
    chip: CHIP, 
    activePins: procs.size,
    automationEnabled: !!automationManager,
    timestamp: new Date().toISOString() 
  });
});

app.post('/api/gpio/write', (req, res) => {
  const pin = Number(req.body.pin ?? req.body.gpio);
  const value = Number(req.body.value ?? req.body.level);
  if (!Number.isInteger(pin) || !(value === 0 || value === 1)) {
    console.log(`[GPIO] Invalid request: pin=${pin}, value=${value}`);
    return res.status(400).json({ success: false, error: 'Pin and value required (numbers)' });
  }
  holdLevel(pin, value);
  io.emit('gpio_state_change', { pin, value });
  res.json({ success: true, pin, value });
});

app.post('/api/gpio/set', (req, res) => {
  const { pin, value } = req.body || {};
  if (!Number.isInteger(pin) || !(value === 0 || value === 1)) {
    return res.status(400).json({ success: false, error: 'Pin and value required (numbers)' });
  }
  holdLevel(pin, value);
  io.emit('gpio_state_change', { pin, value });
  res.json({ success: true, pin, value });
});

app.post('/api/gpio/pulse', async (req, res) => {
  try {
    const pin = Number(req.body.pin);
    const msec = Number(req.body.msec ?? 300);
    if (!Number.isInteger(pin)) return res.status(400).json({ success: false, error: 'Invalid pin' });
    await pulse(pin, msec);
    io.emit('gpio_state_change', { pin, value: 0 });
    res.json({ success: true, pin, msec });
  } catch (e) {
    console.error('[GPIO] Pulse error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/gpio/read/:pin', async (req, res) => {
  try {
    const pin = Number(req.params.pin);
    const v = await readLevel(pin);
    states.set(pin, v);
    res.json({ success: true, pin, value: v });
  } catch (e) {
    console.error('[GPIO] Read error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/gpio/states', (_req, res) => {
  const s = {}; 
  states.forEach((v, p) => s[p] = v);
  res.json({ success: true, states: s });
});

// ---- Automation API Routes ----

// Get all automation rules
app.get('/api/automation/rules', (req, res) => {
  if (!automationManager) {
    return res.status(503).json({ success: false, error: 'Automation not initialized' });
  }
  const rules = automationManager.getRules();
  res.json({ success: true, rules });
});

// Get automation statistics
app.get('/api/automation/stats', (req, res) => {
  if (!automationManager) {
    return res.status(503).json({ success: false, error: 'Automation not initialized' });
  }
  const stats = automationManager.getStats();
  res.json({ success: true, stats });
});

// Add new automation rule
app.post('/api/automation/rules', (req, res) => {
  if (!automationManager) {
    return res.status(503).json({ success: false, error: 'Automation not initialized' });
  }
  try {
    const rule = req.body;
    automationManager.addRule(rule);
    res.json({ success: true, message: 'Rule added successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Update automation rule
app.put('/api/automation/rules/:id', (req, res) => {
  if (!automationManager) {
    return res.status(503).json({ success: false, error: 'Automation not initialized' });
  }
  try {
    const { id } = req.params;
    const updates = req.body;
    automationManager.updateRule(id, updates);
    res.json({ success: true, message: 'Rule updated successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete automation rule
app.delete('/api/automation/rules/:id', (req, res) => {
  if (!automationManager) {
    return res.status(503).json({ success: false, error: 'Automation not initialized' });
  }
  try {
    const { id } = req.params;
    automationManager.removeRule(id);
    res.json({ success: true, message: 'Rule deleted successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Enable/disable rule
app.patch('/api/automation/rules/:id/:action', (req, res) => {
  if (!automationManager) {
    return res.status(503).json({ success: false, error: 'Automation not initialized' });
  }
  try {
    const { id, action } = req.params;
    if (action === 'enable') {
      automationManager.enableRule(id);
    } else if (action === 'disable') {
      automationManager.disableRule(id);
    } else {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }
    res.json({ success: true, message: `Rule ${action}d successfully` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Manual trigger for testing
app.post('/api/automation/trigger', async (req, res) => {
  if (!automationManager) {
    return res.status(503).json({ success: false, error: 'Automation not initialized' });
  }
  try {
    const { event, data } = req.body;
    await automationManager.triggerEvent(event, data);
    res.json({ success: true, message: 'Event triggered' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---- Socket.IO ----
io.on('connection', (socket) => {
  console.log('[Socket.IO] Client connected:', socket.id);
  const s = {}; 
  states.forEach((v, p) => s[p] = v);
  socket.emit('initial_states', s);
  
  socket.on('set_gpio', ({ pin, value, pulseMs }) => {
    if (Number.isInteger(pulseMs) && pulseMs > 0) {
      pulse(pin, pulseMs).catch(err => console.error('[GPIO] Pulse error:', err.message));
    } else {
      holdLevel(pin, value ? 1 : 0);
      io.emit('gpio_state_change', { pin, value: value ? 1 : 0 });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('[Socket.IO] Client disconnected:', socket.id);
  });
});

// ---- Cleanup ----
process.on('SIGINT', () => {
  console.log('\n[Cleanup] Cleaning up gpioset holders...');
  procs.forEach((p) => { 
    try { 
      process.kill(p.pid, 'SIGKILL'); 
    } catch {} 
  });
  process.exit();
});

// ---- Start Server ----
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`┌────────────────────────────────────────┐`);
  console.log(`  GPIO Control Server (libgpiod)`);
  console.log(`├────────────────────────────────────────┤`);
  console.log(`  Chip:       ${CHIP}`);
  console.log(`  Port:       ${PORT}`);
  console.log(`  Binding:    0.0.0.0 (all interfaces)`);
  console.log(`  Automation: ${automationManager ? 'ENABLED' : 'DISABLED'}`);
  console.log(`└────────────────────────────────────────┘`);
  console.log(`Ready to accept connections\n`);
});

app.use("/api/wiegand", require("./routes/wiegand"));
