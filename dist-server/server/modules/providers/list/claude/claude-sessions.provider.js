import { getSessionMessages } from '@/projects.js';
import { createNormalizedMessage, generateMessageId, readObjectRecord } from '@/shared/utils.js';
const PROVIDER = 'claude';
const loadClaudeSessionMessages = getSessionMessages;
/**
 * Claude writes internal command and system reminder entries into history.
 * Those are useful for the CLI but should not appear in the user-facing chat.
 */
const INTERNAL_CONTENT_PREFIXES = [
    '<command-name>',
    '<command-message>',
    '<command-args>',
    '<local-command-stdout>',
    '<system-reminder>',
    'Caveat:',
    'This session is being continued from a previous',
    '[Request interrupted',
];
function isInternalContent(content) {
    return INTERNAL_CONTENT_PREFIXES.some((prefix) => content.startsWith(prefix));
}
export class ClaudeSessionsProvider {
    /**
     * Normalizes one Claude JSONL entry or live SDK stream event into the shared
     * message shape consumed by REST and WebSocket clients.
     */
    normalizeMessage(rawMessage, sessionId) {
        const raw = readObjectRecord(rawMessage);
        if (!raw) {
            return [];
        }
        if (raw.type === 'content_block_delta' && raw.delta?.text) {
            return [createNormalizedMessage({ kind: 'stream_delta', content: raw.delta.text, sessionId, provider: PROVIDER })];
        }
        if (raw.type === 'content_block_stop') {
            return [createNormalizedMessage({ kind: 'stream_end', sessionId, provider: PROVIDER })];
        }
        const messages = [];
        const ts = raw.timestamp || new Date().toISOString();
        const baseId = raw.uuid || generateMessageId('claude');
        if (raw.message?.role === 'user' && raw.message?.content) {
            if (Array.isArray(raw.message.content)) {
                for (let partIndex = 0; partIndex < raw.message.content.length; partIndex++) {
                    const part = raw.message.content[partIndex];
                    if (part.type === 'tool_result') {
                        messages.push(createNormalizedMessage({
                            id: `${baseId}_tr_${part.tool_use_id}`,
                            sessionId,
                            timestamp: ts,
                            provider: PROVIDER,
                            kind: 'tool_result',
                            toolId: part.tool_use_id,
                            content: typeof part.content === 'string' ? part.content : JSON.stringify(part.content),
                            isError: Boolean(part.is_error),
                            subagentTools: raw.subagentTools,
                            toolUseResult: raw.toolUseResult,
                        }));
                    }
                    else if (part.type === 'text') {
                        const text = part.text || '';
                        if (text && !isInternalContent(text)) {
                            messages.push(createNormalizedMessage({
                                id: `${baseId}_text_${partIndex}`,
                                sessionId,
                                timestamp: ts,
                                provider: PROVIDER,
                                kind: 'text',
                                role: 'user',
                                content: text,
                            }));
                        }
                    }
                }
                if (messages.length === 0) {
                    const textParts = raw.message.content
                        .filter((part) => part.type === 'text')
                        .map((part) => part.text)
                        .filter(Boolean)
                        .join('\n');
                    if (textParts && !isInternalContent(textParts)) {
                        messages.push(createNormalizedMessage({
                            id: `${baseId}_text`,
                            sessionId,
                            timestamp: ts,
                            provider: PROVIDER,
                            kind: 'text',
                            role: 'user',
                            content: textParts,
                        }));
                    }
                }
            }
            else if (typeof raw.message.content === 'string') {
                const text = raw.message.content;
                if (text && !isInternalContent(text)) {
                    messages.push(createNormalizedMessage({
                        id: baseId,
                        sessionId,
                        timestamp: ts,
                        provider: PROVIDER,
                        kind: 'text',
                        role: 'user',
                        content: text,
                    }));
                }
            }
            return messages;
        }
        if (raw.type === 'thinking' && raw.message?.content) {
            messages.push(createNormalizedMessage({
                id: baseId,
                sessionId,
                timestamp: ts,
                provider: PROVIDER,
                kind: 'thinking',
                content: raw.message.content,
            }));
            return messages;
        }
        if (raw.type === 'tool_use' && raw.toolName) {
            messages.push(createNormalizedMessage({
                id: baseId,
                sessionId,
                timestamp: ts,
                provider: PROVIDER,
                kind: 'tool_use',
                toolName: raw.toolName,
                toolInput: raw.toolInput,
                toolId: raw.toolCallId || baseId,
            }));
            return messages;
        }
        if (raw.type === 'tool_result') {
            messages.push(createNormalizedMessage({
                id: baseId,
                sessionId,
                timestamp: ts,
                provider: PROVIDER,
                kind: 'tool_result',
                toolId: raw.toolCallId || '',
                content: raw.output || '',
                isError: false,
            }));
            return messages;
        }
        if (raw.message?.role === 'assistant' && raw.message?.content) {
            if (Array.isArray(raw.message.content)) {
                let partIndex = 0;
                for (const part of raw.message.content) {
                    if (part.type === 'text' && part.text) {
                        messages.push(createNormalizedMessage({
                            id: `${baseId}_${partIndex}`,
                            sessionId,
                            timestamp: ts,
                            provider: PROVIDER,
                            kind: 'text',
                            role: 'assistant',
                            content: part.text,
                        }));
                    }
                    else if (part.type === 'tool_use') {
                        messages.push(createNormalizedMessage({
                            id: `${baseId}_${partIndex}`,
                            sessionId,
                            timestamp: ts,
                            provider: PROVIDER,
                            kind: 'tool_use',
                            toolName: part.name,
                            toolInput: part.input,
                            toolId: part.id,
                        }));
                    }
                    else if (part.type === 'thinking' && part.thinking) {
                        messages.push(createNormalizedMessage({
                            id: `${baseId}_${partIndex}`,
                            sessionId,
                            timestamp: ts,
                            provider: PROVIDER,
                            kind: 'thinking',
                            content: part.thinking,
                        }));
                    }
                    partIndex++;
                }
            }
            else if (typeof raw.message.content === 'string') {
                messages.push(createNormalizedMessage({
                    id: baseId,
                    sessionId,
                    timestamp: ts,
                    provider: PROVIDER,
                    kind: 'text',
                    role: 'assistant',
                    content: raw.message.content,
                }));
            }
            return messages;
        }
        return messages;
    }
    /**
     * Loads Claude JSONL history for a project/session and returns normalized
     * messages, preserving the existing pagination behavior from projects.js.
     */
    async fetchHistory(sessionId, options = {}) {
        const { projectName, limit = null, offset = 0 } = options;
        if (!projectName) {
            return { messages: [], total: 0, hasMore: false, offset: 0, limit: null };
        }
        let result;
        try {
            result = await loadClaudeSessionMessages(projectName, sessionId, limit, offset);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[ClaudeProvider] Failed to load session ${sessionId}:`, message);
            return { messages: [], total: 0, hasMore: false, offset: 0, limit: null };
        }
        const rawMessages = Array.isArray(result) ? result : (result.messages || []);
        const total = Array.isArray(result) ? rawMessages.length : (result.total || 0);
        const hasMore = Array.isArray(result) ? false : Boolean(result.hasMore);
        const toolResultMap = new Map();
        for (const raw of rawMessages) {
            if (raw.message?.role === 'user' && Array.isArray(raw.message?.content)) {
                for (const part of raw.message.content) {
                    if (part.type === 'tool_result' && part.tool_use_id) {
                        toolResultMap.set(part.tool_use_id, {
                            content: part.content,
                            isError: Boolean(part.is_error),
                            subagentTools: raw.subagentTools,
                            toolUseResult: raw.toolUseResult,
                        });
                    }
                }
            }
        }
        const normalized = [];
        for (const raw of rawMessages) {
            normalized.push(...this.normalizeMessage(raw, sessionId));
        }
        for (const msg of normalized) {
            if (msg.kind === 'tool_use' && msg.toolId && toolResultMap.has(msg.toolId)) {
                const toolResult = toolResultMap.get(msg.toolId);
                if (!toolResult) {
                    continue;
                }
                msg.toolResult = {
                    content: typeof toolResult.content === 'string'
                        ? toolResult.content
                        : JSON.stringify(toolResult.content),
                    isError: toolResult.isError,
                    toolUseResult: toolResult.toolUseResult,
                };
                msg.subagentTools = toolResult.subagentTools;
            }
        }
        return {
            messages: normalized,
            total,
            hasMore,
            offset,
            limit,
        };
    }
}
//# sourceMappingURL=claude-sessions.provider.js.map