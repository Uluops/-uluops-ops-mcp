/**
 * Main Entry Point Tests
 *
 * Tests for src/index.ts startup sequence, error handlers, and configuration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original process.on (binding required for proper restoration)
// eslint-disable-next-line @typescript-eslint/unbound-method
const originalOn = process.on;

describe('Main Entry Point', () => {
  const mockConfig = {
    api: {
      baseUrl: 'http://localhost:3001/api',
      apiKey: 'ulr_test-api-key-for-unit-tests',
      timeout: 30000,
      retries: 3,
    },
    security: {
      logLevel: 'info',
      enableLogging: false,
      verboseLogging: false,
      logPerformanceMetrics: false,
      logDir: '/tmp/logs',
    },
  };

  let processOnHandlers: Map<string, (...args: unknown[]) => void>;
  let mockLoggerInstance: {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };
  let mockServerInstance: {
    connect: ReturnType<typeof vi.fn>;
    tool: ReturnType<typeof vi.fn>;
    resource: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.resetModules();

    // Capture process.on handlers
    processOnHandlers = new Map();
    process.on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      processOnHandlers.set(event, handler);
      return process;
    }) as typeof process.on;

    // Mock process.exit using spyOn for type safety
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // Create fresh mock instances
    mockLoggerInstance = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    mockServerInstance = {
      connect: vi.fn().mockResolvedValue(undefined),
      tool: vi.fn(),
      resource: vi.fn(),
    };

    // Setup mocks before importing index.js
    vi.doMock('../config/index.js', () => ({
      loadConfig: vi.fn().mockReturnValue({ config: mockConfig, warnings: [] }),
      validateConfig: vi.fn(),
    }));

    vi.doMock('../utils/logger.js', () => ({
      createLogger: vi.fn().mockReturnValue(mockLoggerInstance),
    }));

    vi.doMock('@uluops/ops-sdk', () => ({
      OpsClient: vi.fn().mockImplementation(() => ({
        projects: { listIssues: vi.fn() },
        issues: { search: vi.fn() },
        runs: { save: vi.fn() },
        analytics: { getByMetric: vi.fn() },
        taxonomy: { get: vi.fn() },
      })),
    }));

    vi.doMock('mcp-secure-server', () => ({
      SecureMcpServer: {
        create: vi.fn().mockResolvedValue(mockServerInstance),
      },
    }));

    vi.doMock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
      StdioServerTransport: vi.fn().mockImplementation(() => ({})),
    }));

    vi.doMock('../tools/index.js', () => ({
      registerAllTools: vi.fn(),
    }));

    vi.doMock('../resources/index.js', () => ({
      registerAllResources: vi.fn(),
    }));
  });

  afterEach(() => {
    // Restore original process.on (process.exit restored by vi.restoreAllMocks)
    process.on = originalOn;
    vi.restoreAllMocks();
  });

  describe('main() function', () => {
    it('should execute full startup sequence', async () => {
      const { main } = await import('../index.js');
      const { loadConfig, validateConfig } = await import('../config/index.js');
      const { createLogger } = await import('../utils/logger.js');
      const { OpsClient } = await import('@uluops/ops-sdk');
      const { SecureMcpServer } = await import('mcp-secure-server');
      const { registerAllTools } = await import('../tools/index.js');
      const { registerAllResources } = await import('../resources/index.js');

      await main();

      // Verify configuration was loaded and validated
      expect(loadConfig).toHaveBeenCalled();
      expect(validateConfig).toHaveBeenCalledWith(mockConfig);

      // Verify logger was created
      expect(createLogger).toHaveBeenCalledWith({
        level: 'info',
        enableFileLogging: false,
        logDir: '/tmp/logs',
      });

      // Verify SDK client was created
      expect(OpsClient).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:3001/api',
        apiKey: 'ulr_test-api-key-for-unit-tests',
        timeout: 30000,
        retries: 3,
      });

      // Verify MCP server was created
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(SecureMcpServer.create).toHaveBeenCalled();

      // Verify tools and resources were registered
      expect(registerAllTools).toHaveBeenCalled();
      expect(registerAllResources).toHaveBeenCalled();

      // Verify server connected
      expect(mockServerInstance.connect).toHaveBeenCalled();
    });

    it('should log startup and ready messages', async () => {
      const { main } = await import('../index.js');

      await main();

      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        'Starting uluops-tracker MCP client',
        expect.objectContaining({
          apiUrl: 'http://localhost:3001/api',
        })
      );

      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        'MCP server connected and ready',
        expect.objectContaining({
          tools: expect.any(Object),
          resources: expect.any(Array),
        })
      );
    });

    it('should throw when config validation fails', async () => {
      vi.doMock('../config/index.js', () => ({
        loadConfig: vi.fn().mockReturnValue({ config: mockConfig, warnings: [] }),
        validateConfig: vi.fn().mockImplementation(() => {
          throw new Error('Invalid config');
        }),
      }));

      const { main } = await import('../index.js');
      await expect(main()).rejects.toThrow('Invalid config');
    });

    it('should throw when server creation fails', async () => {
      vi.doMock('mcp-secure-server', () => ({
        SecureMcpServer: {
          create: vi.fn().mockRejectedValue(new Error('Server creation failed')),
        },
      }));

      const { main } = await import('../index.js');
      await expect(main()).rejects.toThrow('Server creation failed');
    });

    it('should throw when server connection fails', async () => {
      const failingServer = {
        connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
        tool: vi.fn(),
        resource: vi.fn(),
      };

      vi.doMock('mcp-secure-server', () => ({
        SecureMcpServer: {
          create: vi.fn().mockResolvedValue(failingServer),
        },
      }));

      const { main } = await import('../index.js');
      await expect(main()).rejects.toThrow('Connection failed');
    });
  });

  describe('Signal Handlers', () => {
    it('should register SIGINT handler', async () => {
      const { main } = await import('../index.js');
      await main();

      expect(processOnHandlers.has('SIGINT')).toBe(true);
    });

    it('should register SIGTERM handler', async () => {
      const { main } = await import('../index.js');
      await main();

      expect(processOnHandlers.has('SIGTERM')).toBe(true);
    });

    it('should exit gracefully on SIGINT', async () => {
      const { main } = await import('../index.js');
      await main();

      const sigintHandler = processOnHandlers.get('SIGINT');
      expect(sigintHandler).toBeDefined();

      if (sigintHandler) {
        sigintHandler();
      }

      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        'Received SIGINT, shutting down gracefully'
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method -- mocked process.exit is tested
      expect(vi.mocked(process.exit)).toHaveBeenCalledWith(0);
    });

    it('should exit gracefully on SIGTERM', async () => {
      const { main } = await import('../index.js');
      await main();

      const sigtermHandler = processOnHandlers.get('SIGTERM');
      expect(sigtermHandler).toBeDefined();

      if (sigtermHandler) {
        sigtermHandler();
      }

      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        'Received SIGTERM, shutting down gracefully'
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method -- mocked process.exit is tested
      expect(vi.mocked(process.exit)).toHaveBeenCalledWith(0);
    });
  });

  describe('Error Handlers', () => {
    it('should register uncaughtException handler', async () => {
      const { main } = await import('../index.js');
      await main();

      expect(processOnHandlers.has('uncaughtException')).toBe(true);
    });

    it('should register unhandledRejection handler', async () => {
      const { main } = await import('../index.js');
      await main();

      expect(processOnHandlers.has('unhandledRejection')).toBe(true);
    });

    it('should log and exit on uncaughtException', async () => {
      const { main } = await import('../index.js');
      await main();

      const handler = processOnHandlers.get('uncaughtException');
      expect(handler).toBeDefined();

      if (handler) {
        const error = new Error('Test uncaught exception');
        handler(error);
      }

      expect(mockLoggerInstance.error).toHaveBeenCalledWith('Uncaught exception', {
        error: 'Test uncaught exception',
        stack: expect.any(String),
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method -- mocked process.exit is tested
      expect(vi.mocked(process.exit)).toHaveBeenCalledWith(1);
    });

    it('should log and exit on unhandledRejection', async () => {
      const { main } = await import('../index.js');
      await main();

      const handler = processOnHandlers.get('unhandledRejection');
      expect(handler).toBeDefined();

      if (handler) {
        handler('Promise rejection reason');
      }

      expect(mockLoggerInstance.error).toHaveBeenCalledWith('Unhandled rejection', {
        reason: 'Promise rejection reason',
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method -- mocked process.exit is tested
      expect(vi.mocked(process.exit)).toHaveBeenCalledWith(1);
    });
  });

  describe('MCP Server Configuration', () => {
    it('should create server with correct security settings', async () => {
      const { main } = await import('../index.js');
      const { SecureMcpServer } = await import('mcp-secure-server');

      await main();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(SecureMcpServer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'uluops-tracker-client',
        }),
        expect.objectContaining({
          securityLevel: 'basic',
          maxRequestsPerMinute: 120,
          maxParamCount: 3000,
          burstThreshold: 15,
          burstWindowMs: 5000,
          automationDetection: { enabled: false },
        })
      );
    });

    it('should configure default write policy', async () => {
      const { main } = await import('../index.js');
      const { SecureMcpServer } = await import('mcp-secure-server');

      await main();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const [, options] = vi.mocked(SecureMcpServer.create).mock.calls[0];
      expect(options.defaultPolicy).toEqual({
        allowWrites: true,
        allowNetwork: true,
      });
    });

    it('should configure resource policy for validation scheme', async () => {
      const { main } = await import('../index.js');
      const { SecureMcpServer } = await import('mcp-secure-server');

      await main();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const [, options] = vi.mocked(SecureMcpServer.create).mock.calls[0];
      expect(options.resourcePolicy).toEqual({
        allowedSchemes: ['validation'],
      });
    });
  });

  describe('Module Exports', () => {
    it('should export main function', async () => {
      const module = await import('../index.js');
      expect(module.main).toBeDefined();
      expect(typeof module.main).toBe('function');
    });
  });
});

describe('Tool Registry Integration', () => {
  it('should export toolRegistry from config', async () => {
    const { toolRegistry } = await import('../config/tool-registry.js');
    expect(toolRegistry).toBeDefined();
    expect(Array.isArray(toolRegistry)).toBe(true);
  });

  it('should have 48 tools registered', async () => {
    const { toolRegistry } = await import('../config/tool-registry.js');
    expect(toolRegistry.length).toBe(48);
  });
});
