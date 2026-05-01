import express from 'express';
import { providerAuthService } from './services/provider-auth.service.js';
import { providerMcpService } from './services/mcp.service.js';
import { AppError, asyncHandler, createApiSuccessResponse } from '../../shared/utils.js';
const router = express.Router();
const readPathParam = (value, name) => {
    if (typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value) && typeof value[0] === 'string') {
        return value[0];
    }
    throw new AppError(`${name} path parameter is invalid.`, {
        code: 'INVALID_PATH_PARAMETER',
        statusCode: 400,
    });
};
const normalizeProviderParam = (value) => readPathParam(value, 'provider').trim().toLowerCase();
const readOptionalQueryString = (value) => {
    if (typeof value !== 'string') {
        return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
};
const parseMcpScope = (value) => {
    if (value === undefined) {
        return undefined;
    }
    const normalized = readOptionalQueryString(value);
    if (!normalized) {
        return undefined;
    }
    if (normalized === 'user' || normalized === 'local' || normalized === 'project') {
        return normalized;
    }
    throw new AppError(`Unsupported MCP scope "${normalized}".`, {
        code: 'INVALID_MCP_SCOPE',
        statusCode: 400,
    });
};
const parseMcpTransport = (value) => {
    const normalized = readOptionalQueryString(value);
    if (!normalized) {
        throw new AppError('transport is required.', {
            code: 'MCP_TRANSPORT_REQUIRED',
            statusCode: 400,
        });
    }
    if (normalized === 'stdio' || normalized === 'http' || normalized === 'sse') {
        return normalized;
    }
    throw new AppError(`Unsupported MCP transport "${normalized}".`, {
        code: 'INVALID_MCP_TRANSPORT',
        statusCode: 400,
    });
};
const parseMcpUpsertPayload = (payload) => {
    if (!payload || typeof payload !== 'object') {
        throw new AppError('Request body must be an object.', {
            code: 'INVALID_REQUEST_BODY',
            statusCode: 400,
        });
    }
    const body = payload;
    const name = readOptionalQueryString(body.name);
    if (!name) {
        throw new AppError('name is required.', {
            code: 'MCP_NAME_REQUIRED',
            statusCode: 400,
        });
    }
    const transport = parseMcpTransport(body.transport);
    const scope = parseMcpScope(body.scope);
    const workspacePath = readOptionalQueryString(body.workspacePath);
    return {
        name,
        transport,
        scope,
        workspacePath,
        command: readOptionalQueryString(body.command),
        args: Array.isArray(body.args) ? body.args.filter((entry) => typeof entry === 'string') : undefined,
        env: typeof body.env === 'object' && body.env !== null
            ? Object.fromEntries(Object.entries(body.env).filter((entry) => typeof entry[1] === 'string'))
            : undefined,
        cwd: readOptionalQueryString(body.cwd),
        url: readOptionalQueryString(body.url),
        headers: typeof body.headers === 'object' && body.headers !== null
            ? Object.fromEntries(Object.entries(body.headers).filter((entry) => typeof entry[1] === 'string'))
            : undefined,
        envVars: Array.isArray(body.envVars)
            ? body.envVars.filter((entry) => typeof entry === 'string')
            : undefined,
        bearerTokenEnvVar: readOptionalQueryString(body.bearerTokenEnvVar),
        envHttpHeaders: typeof body.envHttpHeaders === 'object' && body.envHttpHeaders !== null
            ? Object.fromEntries(Object.entries(body.envHttpHeaders).filter((entry) => typeof entry[1] === 'string'))
            : undefined,
    };
};
const parseProvider = (value) => {
    const normalized = normalizeProviderParam(value);
    if (normalized === 'claude' || normalized === 'codex' || normalized === 'cursor' || normalized === 'gemini') {
        return normalized;
    }
    throw new AppError(`Unsupported provider "${normalized}".`, {
        code: 'UNSUPPORTED_PROVIDER',
        statusCode: 400,
    });
};
router.get('/:provider/auth/status', asyncHandler(async (req, res) => {
    const provider = parseProvider(req.params.provider);
    const status = await providerAuthService.getProviderAuthStatus(provider);
    res.json(createApiSuccessResponse(status));
}));
router.get('/:provider/mcp/servers', asyncHandler(async (req, res) => {
    const provider = parseProvider(req.params.provider);
    const workspacePath = readOptionalQueryString(req.query.workspacePath);
    const scope = parseMcpScope(req.query.scope);
    if (scope) {
        const servers = await providerMcpService.listProviderMcpServersForScope(provider, scope, { workspacePath });
        res.json(createApiSuccessResponse({ provider, scope, servers }));
        return;
    }
    const groupedServers = await providerMcpService.listProviderMcpServers(provider, { workspacePath });
    res.json(createApiSuccessResponse({ provider, scopes: groupedServers }));
}));
router.post('/:provider/mcp/servers', asyncHandler(async (req, res) => {
    const provider = parseProvider(req.params.provider);
    const payload = parseMcpUpsertPayload(req.body);
    const server = await providerMcpService.upsertProviderMcpServer(provider, payload);
    res.status(201).json(createApiSuccessResponse({ server }));
}));
router.delete('/:provider/mcp/servers/:name', asyncHandler(async (req, res) => {
    const provider = parseProvider(req.params.provider);
    const scope = parseMcpScope(req.query.scope);
    const workspacePath = readOptionalQueryString(req.query.workspacePath);
    const result = await providerMcpService.removeProviderMcpServer(provider, {
        name: readPathParam(req.params.name, 'name'),
        scope,
        workspacePath,
    });
    res.json(createApiSuccessResponse(result));
}));
router.post('/mcp/servers/global', asyncHandler(async (req, res) => {
    const payload = parseMcpUpsertPayload(req.body);
    if (payload.scope === 'local') {
        throw new AppError('Global MCP add supports only "user" or "project" scopes.', {
            code: 'INVALID_GLOBAL_MCP_SCOPE',
            statusCode: 400,
        });
    }
    const results = await providerMcpService.addMcpServerToAllProviders({
        ...payload,
        scope: payload.scope === 'user' ? 'user' : 'project',
    });
    res.status(201).json(createApiSuccessResponse({ results }));
}));
export default router;
//# sourceMappingURL=provider.routes.js.map