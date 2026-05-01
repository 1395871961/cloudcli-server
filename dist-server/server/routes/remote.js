/**
 * Remote command relay endpoint
 *
 * Receives messages forwarded by the Electron main process from the mobile
 * WebRTC DataChannel and broadcasts them to connected WebSocket clients so
 * the existing chat/terminal infrastructure handles them transparently.
 *
 * Only accessible from localhost (Electron main process).
 */
import express from 'express';
import { WebSocket } from 'ws';
const router = express.Router();
// Only allow requests from localhost
const localhostOnly = (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || '';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        return next();
    }
    res.status(403).json({ error: 'Forbidden' });
};
router.post('/command', localhostOnly, (req, res) => {
    const msg = req.body;
    if (!msg || !msg.type) {
        return res.status(400).json({ error: 'Invalid message' });
    }
    const wss = req.app.locals.wss;
    if (wss) {
        const payload = JSON.stringify({ ...msg, _from: 'remote' });
        let sent = 0;
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
                sent++;
            }
        });
        res.json({ success: true, sent });
    }
    else {
        res.json({ success: false, reason: 'No WebSocket server' });
    }
});
export default router;
//# sourceMappingURL=remote.js.map