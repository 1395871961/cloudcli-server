/**
 * Electron WebRTC Device Server
 *
 * Runs in the Electron main process. Connects to the remote VPS signaling
 * server via /ws/device, receives WebRTC offers from mobile clients, and
 * establishes P2P DataChannels.
 *
 * Requires: npm install @roamhq/wrtc  (prebuilt WebRTC for Node.js)
 */

const { EventEmitter } = require('events');

const STUN_SERVERS = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

class DeviceWebRTC extends EventEmitter {
  constructor({ serverUrl, token, deviceId, deviceName, platform = process.platform }) {
    super();
    this.serverUrl = serverUrl;   // remote VPS URL, e.g. https://vps.example.com
    this.token = token;
    this.deviceId = deviceId;
    this.deviceName = deviceName;
    this.platform = platform;

    this.ws = null;
    this.peers = new Map();       // sessionId -> RTCPeerConnection
    this.channels = new Map();    // sessionId -> RTCDataChannel
    this._heartbeatTimer = null;
    this._reconnectTimer = null;
    this._reconnectDelay = 2000;
    this._stopped = false;

    // Try to load @roamhq/wrtc (optional — only available when installed)
    try {
      this._wrtc = require('@roamhq/wrtc');
    } catch {
      this._wrtc = null;
      console.warn('[WebRTC] @roamhq/wrtc not found — WebRTC will not be available');
    }
  }

  get wsUrl() {
    const u = new URL(this.serverUrl);
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${u.host}/ws/device?token=${this.token}`;
  }

  start() {
    this._stopped = false;
    this._connect();
  }

  stop() {
    this._stopped = true;
    clearTimeout(this._reconnectTimer);
    clearInterval(this._heartbeatTimer);
    this.ws?.close();
    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    this.channels.clear();
    this.emit('status', 'stopped');
  }

  _connect() {
    if (this._stopped) return;
    try {
      const WebSocket = require('ws');
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;

      ws.on('open', () => {
        this._reconnectDelay = 2000;
        ws.send(JSON.stringify({
          type: 'register',
          device_id: this.deviceId,
          device_name: this.deviceName,
          platform: this.platform,
        }));
        this._startHeartbeat();
        this.emit('status', 'connected');
        console.log('[WebRTC] Registered with signaling server');
      });

      ws.on('message', (raw) => this._onSignal(raw.toString()));

      ws.on('close', () => {
        clearInterval(this._heartbeatTimer);
        this.emit('status', 'disconnected');
        if (!this._stopped) this._scheduleReconnect();
      });

      ws.on('error', (err) => {
        console.error('[WebRTC] WS error:', err.message);
        if (err.message?.includes('401')) {
          console.warn('[WebRTC] Auth failed (401) — clearing token and stopping reconnect');
          this._stopped = true;
          this.emit('auth-failed');
        } else {
          this.emit('status', 'error');
        }
      });
    } catch (err) {
      console.error('[WebRTC] connect error:', err.message);
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this._stopped) return;
    console.log(`[WebRTC] Reconnecting in ${this._reconnectDelay}ms…`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000);
      this._connect();
    }, this._reconnectDelay);
  }

  _startHeartbeat() {
    clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === 1 /* OPEN */) {
        this.ws.send(JSON.stringify({ type: 'pong' }));
      }
    }, 20000);
  }

  async _onSignal(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'ping') {
      this.ws?.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (msg.type === 'registered') {
      console.log('[WebRTC] Server confirmed registration:', msg.device_id);
      return;
    }

    if (msg.type === 'offer') {
      await this._handleOffer(msg);
      return;
    }

    if (msg.type === 'ice') {
      const pc = this.peers.get(msg.session_id);
      if (pc) {
        try {
          const IceClass = this._wrtc ? this._wrtc.RTCIceCandidate : RTCIceCandidate;
          await pc.addIceCandidate(new IceClass(msg.payload));
        } catch { /* stale candidate */ }
      }
      return;
    }

    if (msg.type === 'mobile_disconnected') {
      this._closePeer(msg.session_id);
      return;
    }
  }

  async _handleOffer(msg) {
    if (!this._wrtc) {
      console.warn('[WebRTC] Cannot handle offer: @roamhq/wrtc not installed');
      return;
    }

    const sessionId = msg.session_id;
    const { RTCPeerConnection, RTCSessionDescription } = this._wrtc;

    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    this.peers.set(sessionId, pc);

    pc.onicecandidate = (e) => {
      if (e.candidate && this.ws?.readyState === 1) {
        this.ws.send(JSON.stringify({
          type: 'ice',
          payload: e.candidate,
          target_session: sessionId,
        }));
      }
    };

    pc.ondatachannel = (e) => {
      const dc = e.channel;
      this.channels.set(sessionId, dc);

      dc.onopen = () => {
        console.log(`[WebRTC] DataChannel open with session ${sessionId}`);
        this.emit('channel-open', sessionId, dc);
      };

      dc.onmessage = (ev) => {
        this.emit('message', sessionId, ev.data);
      };

      dc.onclose = () => {
        this.channels.delete(sessionId);
        this.emit('channel-close', sessionId);
      };
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this._closePeer(sessionId);
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.ws?.send(JSON.stringify({
      type: 'answer',
      payload: answer,
      target_session: sessionId,
    }));

    console.log(`[WebRTC] Sent answer for session ${sessionId}`);
  }

  _closePeer(sessionId) {
    this.peers.get(sessionId)?.close();
    this.peers.delete(sessionId);
    this.channels.delete(sessionId);
    this.emit('channel-close', sessionId);
    console.log(`[WebRTC] Closed peer for session ${sessionId}`);
  }

  /** Send data to a specific mobile session */
  send(sessionId, data) {
    const dc = this.channels.get(sessionId);
    if (dc?.readyState === 'open') {
      dc.send(data);
      return true;
    }
    return false;
  }

  /** Broadcast to all connected mobile sessions */
  broadcast(data) {
    for (const [sessionId, dc] of this.channels) {
      if (dc.readyState === 'open') dc.send(data);
    }
  }
}

module.exports = DeviceWebRTC;
