/**
 * Logger Tests
 *
 * Tests for structured logger with file output support.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLogger, type Logger, type LoggerConfig } from '../utils/logger.js';
import * as fs from 'node:fs';

// Mock fs module
vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}));

// Mock process.cwd for predictable test paths
const originalCwd = process.cwd.bind(process);
const mockCwd = '/test/project';

describe('logger', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const mockAppendFileSync = vi.mocked(fs.appendFileSync);
  const mockMkdirSync = vi.mocked(fs.mkdirSync);
  const mockExistsSync = vi.mocked(fs.existsSync);

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExistsSync.mockReturnValue(true);
    // Mock process.cwd for per-project logging
    process.cwd = (): string => mockCwd;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    process.cwd = originalCwd;
  });

  describe('createLogger with string level (backwards compatibility)', () => {
    it('should create logger with string level', () => {
      const logger = createLogger('info');

      logger.info('test message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);
      expect(parsed.level).toBe('INFO');
      expect(parsed.message).toBe('test message');
    });
  });

  describe('createLogger with config object', () => {
    it('should create logger with config object', () => {
      const config: LoggerConfig = {
        level: 'debug',
        enableFileLogging: false,
      };

      const logger = createLogger(config);
      logger.debug('debug message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const parsed = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(parsed.level).toBe('DEBUG');
    });
  });

  describe('log levels', () => {
    it('should log all levels when level is debug', () => {
      const logger = createLogger('debug');

      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(4);
    });

    it('should skip debug when level is info', () => {
      const logger = createLogger('info');

      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
      const calls = consoleErrorSpy.mock.calls.map((c) => JSON.parse(c[0]).level);
      expect(calls).not.toContain('DEBUG');
    });

    it('should skip debug and info when level is warn', () => {
      const logger = createLogger('warn');

      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      const calls = consoleErrorSpy.mock.calls.map((c) => JSON.parse(c[0]).level);
      expect(calls).toEqual(['WARN', 'ERROR']);
    });

    it('should only log error when level is error', () => {
      const logger = createLogger('error');

      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(parsed.level).toBe('ERROR');
    });
  });

  describe('log format', () => {
    it('should include timestamp in ISO format', () => {
      const logger = createLogger('info');

      logger.info('test');

      const parsed = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include context when provided', () => {
      const logger = createLogger('info');

      logger.info('test message', { userId: 123, action: 'login' });

      const parsed = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(parsed.context).toEqual({ userId: 123, action: 'login' });
    });

    it('should not include context key when context is empty', () => {
      const logger = createLogger('info');

      logger.info('test message', {});

      const parsed = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(parsed.context).toBeUndefined();
    });

    it('should not include context key when context is undefined', () => {
      const logger = createLogger('info');

      logger.info('test message');

      const parsed = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(parsed.context).toBeUndefined();
    });
  });

  describe('file logging', () => {
    it('should create log directory if it does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      createLogger({
        level: 'info',
        enableFileLogging: true,
        logDir: '/custom/log/dir',
      });

      expect(mockMkdirSync).toHaveBeenCalledWith('/custom/log/dir', { recursive: true });
    });

    it('should not create log directory if it already exists', () => {
      mockExistsSync.mockReturnValue(true);

      createLogger({
        level: 'info',
        enableFileLogging: true,
        logDir: '/custom/log/dir',
      });

      expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it('should use default log directory when not specified', () => {
      mockExistsSync.mockReturnValue(false);

      createLogger({
        level: 'info',
        enableFileLogging: true,
      });

      expect(mockMkdirSync).toHaveBeenCalledWith('/test/project/logs', {
        recursive: true,
      });
    });

    it('should write to file when file logging is enabled', () => {
      const logger = createLogger({
        level: 'info',
        enableFileLogging: true,
        logDir: '/var/log/test',
      });

      logger.info('file log test');

      expect(mockAppendFileSync).toHaveBeenCalled();
      const [filePath, content] = mockAppendFileSync.mock.calls[0];
      expect(filePath).toMatch(/^\/var\/log\/test\/mcp-client-\d{4}-\d{2}-\d{2}\.log$/);
      expect(content).toContain('file log test');
      expect(String(content).endsWith('\n')).toBe(true);
    });

    it('should not write to file when file logging is disabled', () => {
      const logger = createLogger({
        level: 'info',
        enableFileLogging: false,
      });

      logger.info('no file log');

      expect(mockAppendFileSync).not.toHaveBeenCalled();
    });

    it('should silently ignore file write errors', () => {
      mockAppendFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const logger = createLogger({
        level: 'info',
        enableFileLogging: true,
      });

      // Should not throw
      expect(() => logger.info('test')).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled(); // Still logs to stderr
    });
  });

  describe('Logger interface', () => {
    it('should implement all required methods', () => {
      const logger: Logger = createLogger('info');

      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
  });
});
