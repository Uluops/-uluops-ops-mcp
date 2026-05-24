/**
 * Configuration Tests
 *
 * Tests for configuration loading and validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, validateConfig } from '../config/index.js';

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear relevant env vars
    delete process.env.ULUOPS_BASE_URL;
    delete process.env.ULUOPS_API_KEY;
    delete process.env.ULUOPS_TRACKER_TIMEOUT;
    delete process.env.ULUOPS_TRACKER_RETRIES;
    delete process.env.ULUOPS_BASE_URL;
    delete process.env.ULUOPS_API_KEY;
    delete process.env.LOG_LEVEL;
    delete process.env.ENABLE_FILE_LOGGING;
    delete process.env.LOG_DIR;
    delete process.env.VERBOSE_LOGGING;
    delete process.env.LOG_PERFORMANCE_METRICS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should load config with required API URL', () => {
      process.env.ULUOPS_BASE_URL = 'https://api.example.com';

      const { config } = loadConfig();

      expect(config.api.baseUrl).toBe('https://api.example.com');
    });

    it('should use production default if API URL is missing', () => {
      const { config } = loadConfig();
      expect(config.api.baseUrl).toBe('https://api.uluops.ai/api/v1/ops');
    });

    it('should use default timeout if not specified', () => {
      process.env.ULUOPS_BASE_URL = 'https://api.example.com';

      const { config } = loadConfig();

      expect(config.api.timeout).toBe(30000);
    });

    it('should parse custom timeout from env', () => {
      process.env.ULUOPS_BASE_URL = 'https://api.example.com';
      process.env.ULUOPS_TRACKER_TIMEOUT = '60000';

      const { config } = loadConfig();

      expect(config.api.timeout).toBe(60000);
    });

    it('should parse retries from env', () => {
      process.env.ULUOPS_BASE_URL = 'https://api.example.com';
      process.env.ULUOPS_TRACKER_RETRIES = '5';

      const { config } = loadConfig();

      expect(config.api.retries).toBe(5);
    });

    it('should use default retries if not specified', () => {
      process.env.ULUOPS_BASE_URL = 'https://api.example.com';

      const { config } = loadConfig();

      expect(config.api.retries).toBe(3);
    });

    it('should load API key from env', () => {
      process.env.ULUOPS_BASE_URL = 'https://api.example.com';
      process.env.ULUOPS_API_KEY = 'secret-key';

      const { config } = loadConfig();

      expect(config.api.apiKey).toBe('secret-key');
    });

    it('should load server config with defaults', () => {
      process.env.ULUOPS_BASE_URL = 'https://api.example.com';

      const { config } = loadConfig();

      expect(config.server.name).toBe('uluops-tracker-client');
      expect(config.server.version).toBe('1.0.0');
    });

    it('should load security config with defaults', () => {
      process.env.ULUOPS_BASE_URL = 'https://api.example.com';

      const { config } = loadConfig();

      expect(config.security.logLevel).toBe('info');
      expect(config.security.enableLogging).toBe(true);
      expect(config.security.verboseLogging).toBe(true);
      expect(config.security.logPerformanceMetrics).toBe(true);
    });

    it('should parse log level from env', () => {
      process.env.ULUOPS_BASE_URL = 'https://api.example.com';
      process.env.LOG_LEVEL = 'debug';

      const { config } = loadConfig();

      expect(config.security.logLevel).toBe('debug');
    });

    it('should use default log level if invalid', () => {
      process.env.ULUOPS_BASE_URL = 'https://api.example.com';
      process.env.LOG_LEVEL = 'invalid';

      const { config } = loadConfig();

      expect(config.security.logLevel).toBe('info');
    });

    it('should parse enable logging from env', () => {
      process.env.ULUOPS_BASE_URL = 'https://api.example.com';
      process.env.ENABLE_FILE_LOGGING = 'true';

      const { config } = loadConfig();

      expect(config.security.enableLogging).toBe(true);
    });

    it('should parse enable logging with "1" value', () => {
      process.env.ULUOPS_BASE_URL = 'https://api.example.com';
      process.env.ENABLE_FILE_LOGGING = '1';

      const { config } = loadConfig();

      expect(config.security.enableLogging).toBe(true);
    });

    it('should load log directory from env', () => {
      process.env.ULUOPS_BASE_URL = 'https://api.example.com';
      process.env.LOG_DIR = '/var/log/tracker';

      const { config } = loadConfig();

      expect(config.security.logDir).toBe('/var/log/tracker');
    });

    it('should return no warnings', () => {
      process.env.ULUOPS_BASE_URL = 'https://api.example.com';
      process.env.ULUOPS_API_KEY = 'my-key';

      const { warnings } = loadConfig();

      expect(warnings).toHaveLength(0);
    });

  });

  describe('validateConfig', () => {
    it('should pass for valid config', () => {
      process.env.ULUOPS_BASE_URL = 'https://api.example.com';
      process.env.ULUOPS_API_KEY = 'test-key';

      const { config } = loadConfig();

      expect(() => validateConfig(config)).not.toThrow();
    });

    it('should throw for invalid URL format', () => {
      const config = {
        api: {
          baseUrl: 'not-a-valid-url',
          timeout: 30000,
          retries: 3,
        },
        server: { name: 'test', version: '1.0.0' },
        security: {
          logLevel: 'info' as const,
          enableLogging: false,
          verboseLogging: true,
          logPerformanceMetrics: true,
        },
      };

      expect(() => validateConfig(config)).toThrow('Invalid API URL');
    });

    it('should throw for zero timeout', () => {
      const config = {
        api: {
          baseUrl: 'https://api.example.com',
          apiKey: 'test-key',
          timeout: 0,
          retries: 3,
        },
        server: { name: 'test', version: '1.0.0' },
        security: {
          logLevel: 'info' as const,
          enableLogging: false,
          verboseLogging: true,
          logPerformanceMetrics: true,
        },
      };

      expect(() => validateConfig(config)).toThrow('Timeout must be a positive number');
    });

    it('should throw for negative timeout', () => {
      const config = {
        api: {
          baseUrl: 'https://api.example.com',
          apiKey: 'test-key',
          timeout: -1000,
          retries: 3,
        },
        server: { name: 'test', version: '1.0.0' },
        security: {
          logLevel: 'info' as const,
          enableLogging: false,
          verboseLogging: true,
          logPerformanceMetrics: true,
        },
      };

      expect(() => validateConfig(config)).toThrow('Timeout must be a positive number');
    });

    it('should throw for negative retries', () => {
      const config = {
        api: {
          baseUrl: 'https://api.example.com',
          apiKey: 'test-key',
          timeout: 30000,
          retries: -1,
        },
        server: { name: 'test', version: '1.0.0' },
        security: {
          logLevel: 'info' as const,
          enableLogging: false,
          verboseLogging: true,
          logPerformanceMetrics: true,
        },
      };

      expect(() => validateConfig(config)).toThrow('Retries must be a non-negative number');
    });

    it('should throw for missing API key', () => {
      const config = {
        api: {
          baseUrl: 'https://api.example.com',
          timeout: 30000,
          retries: 3,
        },
        server: { name: 'test', version: '1.0.0' },
        security: {
          logLevel: 'info' as const,
          enableLogging: false,
          verboseLogging: true,
          logPerformanceMetrics: true,
        },
      };

      expect(() => validateConfig(config)).toThrow('API key is required');
    });

    it('should throw for empty API key', () => {
      const config = {
        api: {
          baseUrl: 'https://api.example.com',
          apiKey: '',
          timeout: 30000,
          retries: 3,
        },
        server: { name: 'test', version: '1.0.0' },
        security: {
          logLevel: 'info' as const,
          enableLogging: false,
          verboseLogging: true,
          logPerformanceMetrics: true,
        },
      };

      expect(() => validateConfig(config)).toThrow('API key is required');
    });

    it('should allow zero retries', () => {
      const config = {
        api: {
          baseUrl: 'https://api.example.com',
          apiKey: 'test-key',
          timeout: 30000,
          retries: 0,
        },
        server: { name: 'test', version: '1.0.0' },
        security: {
          logLevel: 'info' as const,
          enableLogging: false,
          verboseLogging: true,
          logPerformanceMetrics: true,
        },
      };

      expect(() => validateConfig(config)).not.toThrow();
    });
  });
});
