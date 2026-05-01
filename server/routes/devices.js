import express from 'express';
import crypto from 'crypto';
import { deviceDb, pairCodeDb } from '../database/db.js';

const router = express.Router();

// GET /api/devices — list all devices for current user
router.get('/', (req, res) => {
  try {
    const devices = deviceDb.getByUser(req.user.id);
    // Merge live connection status from in-memory map
    const liveIds = req.app.locals.deviceSockets
      ? new Set(req.app.locals.deviceSockets.keys())
      : new Set();
    const result = devices.map(d => ({
      ...d,
      is_online: liveIds.has(d.id) ? 1 : 0
    }));
    res.json({ devices: result });
  } catch (err) {
    console.error('[Devices] list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/devices/:id — remove a device
router.delete('/:id', (req, res) => {
  try {
    const result = deviceDb.delete(req.params.id, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    // Disconnect live socket if present
    const sock = req.app.locals.deviceSockets?.get(req.params.id);
    if (sock) sock.close(4001, 'Device removed');
    res.json({ success: true });
  } catch (err) {
    console.error('[Devices] delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/devices/pair — generate a 6-digit pair code
router.post('/pair', (req, res) => {
  try {
    pairCodeDb.cleanup();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    pairCodeDb.create(code, req.user.id, 300); // 5 min TTL
    res.json({ code, expires_in: 300 });
  } catch (err) {
    console.error('[Devices] pair error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/devices/pair/consume — mobile uses code to get a JWT-linked device token
router.post('/pair/consume', (req, res) => {
  try {
    const { code, device_name, platform } = req.body;
    if (!code || !device_name) {
      return res.status(400).json({ error: 'code and device_name required' });
    }
    const row = pairCodeDb.consume(code);
    if (!row) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    const deviceId = crypto.randomUUID();
    deviceDb.upsert(deviceId, row.user_id, device_name, platform || 'mobile');
    res.json({ success: true, device_id: deviceId, user_id: row.user_id });
  } catch (err) {
    console.error('[Devices] pair consume error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
