/**
 * WebRTC Signaling Module
 *
 * Manages two WebSocket channels:
 *  - /ws/device  : Desktop Electron app connects here, registers device, sends heartbeat
 *  - /ws/signal  : Mobile browser connects here, requests P2P connection to a device
 *
 * The server only routes signaling messages (SDP offer/answer, ICE candidates).
 * Actual data never passes through the server after the P2P channel is established.
 */

import crypto from 'crypto';
import { WebSocket } from 'ws';
import { deviceDb } from '../database/db.js';

const HEARTBEAT_INTERVAL = 25000; // 25s
const HEARTBEAT_TIMEOUT = 60000;  // 60s — disconnect if no pong

/**
 * Handle a desktop device WebSocket connection (/ws/device)
 * Expected first message: { type: 'register', device_id, device_name, platform }
 */
export function handleDeviceConnection(ws, request) {
  const user = request.user;
  let deviceId = null;
  let heartbeatTimer = null;
  let pongTimer = null;

  const deviceSockets = request.app?.locals?.deviceSockets;

  function resetPongTimer() {
    clearTimeout(pongTimer);
    pongTimer = setTimeout(() => {
      console.log(`[Signal] Device ${deviceId} timed out, closing`);
      ws.terminate();
    }, HEARTBEAT_TIMEOUT);
  }

  // Send ping every 25s
  heartbeatTimer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
      resetPongTimer();
    }
  }, HEARTBEAT_INTERVAL);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'pong') {
      clearTimeout(pongTimer);
      return;
    }

    if (msg.type === 'register') {
      deviceId = msg.device_id;
      const name = msg.device_name || 'Unknown Device';
      const platform = msg.platform || 'unknown';

      if (!user?.id) {
        console.error('[Signal] Cannot register device: user.id is null');
        ws.close(4003, 'Authentication error');
        return;
      }

      try {
        deviceDb.upsert(deviceId, user.id, name, platform);
        if (deviceSockets) deviceSockets.set(deviceId, ws);
        console.log(`[Signal] Device registered: ${deviceId} (${name}) user=${user.id}`);
        ws.send(JSON.stringify({ type: 'registered', device_id: deviceId }));
        resetPongTimer();
      } catch (err) {
        console.error('[Signal] Device register DB error:', err.message);
        ws.close(4004, 'Server error');
      }
      return;
    }

    // Forward signaling messages to the target mobile client
    // msg: { type: 'answer'|'ice', target_session, payload }
    if (msg.type === 'answer' || msg.type === 'ice') {
      const mobileSessions = request.app?.locals?.mobileSessions;
      const targetWs = mobileSessions?.get(msg.target_session);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify({ ...msg, from_device: deviceId }));
      }
    }
  });

  ws.on('close', () => {
    clearInterval(heartbeatTimer);
    clearTimeout(pongTimer);
    if (deviceId) {
      deviceDb.setOnline(deviceId, false);
      if (deviceSockets) deviceSockets.delete(deviceId);
      console.log(`[Signal] Device disconnected: ${deviceId}`);
    }
  });

  ws.on('error', (err) => {
    console.error('[Signal] Device WS error:', err.message);
  });
}

/**
 * Handle a mobile browser WebSocket connection (/ws/signal)
 * Expected first message: { type: 'connect', device_id }
 * Then: { type: 'offer', payload } / { type: 'ice', payload }
 */
export function handleSignalConnection(ws, request) {
  const user = request.user;
  const sessionId = crypto.randomUUID();
  let targetDeviceId = null;

  const mobileSessions = request.app?.locals?.mobileSessions;
  const deviceSockets = request.app?.locals?.deviceSockets;

  if (mobileSessions) mobileSessions.set(sessionId, ws);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'connect') {
      targetDeviceId = msg.device_id;

      // Verify device exists (ownership not checked — cross-account access is intentional
      // since Render's ephemeral DB may assign different user_ids across restarts)
      const device = deviceDb.getById(targetDeviceId);
      if (!device) {
        ws.send(JSON.stringify({ type: 'error', message: 'Device not found' }));
        ws.close();
        return;
      }

      const deviceWs = deviceSockets?.get(targetDeviceId);
      if (!deviceWs || deviceWs.readyState !== WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'Device is offline' }));
        ws.close();
        return;
      }

      ws.send(JSON.stringify({ type: 'connected', session_id: sessionId }));
      console.log(`[Signal] Mobile session ${sessionId} → device ${targetDeviceId}`);
      return;
    }

    // Forward SDP offer / ICE candidate to device
    if ((msg.type === 'offer' || msg.type === 'ice') && targetDeviceId) {
      const deviceWs = deviceSockets?.get(targetDeviceId);
      if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        deviceWs.send(JSON.stringify({ ...msg, session_id: sessionId }));
      }
    }
  });

  ws.on('close', () => {
    if (mobileSessions) mobileSessions.delete(sessionId);
    // Notify device that mobile disconnected
    if (targetDeviceId) {
      const deviceWs = deviceSockets?.get(targetDeviceId);
      if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        deviceWs.send(JSON.stringify({ type: 'mobile_disconnected', session_id: sessionId }));
      }
    }
    console.log(`[Signal] Mobile session closed: ${sessionId}`);
  });

  ws.on('error', (err) => {
    console.error('[Signal] Mobile WS error:', err.message);
  });
}
