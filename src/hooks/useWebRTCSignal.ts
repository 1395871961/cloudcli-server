import { useCallback, useEffect, useRef, useState } from 'react';

export type RTCStatus =
  | 'idle'
  | 'connecting'
  | 'signaling'
  | 'p2p-connecting'
  | 'connected'
  | 'error'
  | 'closed';

type Options = {
  token: string;
  deviceId: string | null;
  onMessage?: (data: string) => void;
};

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

export function useWebRTCSignal({ token, deviceId, onMessage }: Options) {
  const [status, setStatus] = useState<RTCStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.close();
    wsRef.current?.close();
    dcRef.current = null;
    pcRef.current = null;
    wsRef.current = null;
    sessionIdRef.current = null;
  }, []);

  const send = useCallback((data: string) => {
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(data);
      return true;
    }
    return false;
  }, []);

  const connect = useCallback(() => {
    if (!deviceId || !token) return;
    cleanup();
    setError(null);
    setStatus('connecting');

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/signal?token=${token}`);
    wsRef.current = ws;

    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    pcRef.current = pc;

    // Create data channel before offer
    const dc = pc.createDataChannel('main', { ordered: true });
    dcRef.current = dc;

    dc.onopen = () => setStatus('connected');
    dc.onclose = () => setStatus('closed');
    dc.onmessage = (e) => onMessage?.(e.data);

    pc.onicecandidate = (e) => {
      if (e.candidate && ws.readyState === WebSocket.OPEN && sessionIdRef.current) {
        ws.send(JSON.stringify({
          type: 'ice',
          payload: e.candidate,
          session_id: sessionIdRef.current,
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        setStatus('error');
        setError('P2P 连接失败，可能是网络穿透不支持。请确保双端在线。');
      }
    };

    ws.onopen = () => {
      setStatus('signaling');
      ws.send(JSON.stringify({ type: 'connect', device_id: deviceId }));
    };

    ws.onmessage = async (e) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(e.data); } catch { return; }

      if (msg.type === 'error') {
        setStatus('error');
        setError(String(msg.message ?? '连接失败'));
        cleanup();
        return;
      }

      if (msg.type === 'connected') {
        sessionIdRef.current = msg.session_id as string;
        // Create SDP offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({
          type: 'offer',
          payload: offer,
          session_id: sessionIdRef.current,
        }));
        setStatus('p2p-connecting');
        return;
      }

      if (msg.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit));
        return;
      }

      if (msg.type === 'ice') {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.payload as RTCIceCandidateInit));
        } catch { /* ignore stale candidates */ }
        return;
      }
    };

    ws.onerror = () => {
      setStatus('error');
      setError('信令 WebSocket 连接失败');
    };

    ws.onclose = () => {
      if (status !== 'connected') {
        setStatus('closed');
      }
    };
  }, [deviceId, token, onMessage, cleanup, status]);

  const disconnect = useCallback(() => {
    cleanup();
    setStatus('idle');
    setError(null);
  }, [cleanup]);

  useEffect(() => () => { cleanup(); }, [cleanup]);

  return { status, error, connect, disconnect, send };
}
