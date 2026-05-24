/**
 * Resources Tests
 *
 * Tests for MCP resource registration and handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import { registerProjectsResource } from '../resources/projects.js';
import { registerTaxonomyResource } from '../resources/taxonomy.js';
import { registerAllResources } from '../resources/index.js';
import type {
  ResourceResponse,
  ResourceMetadata,
  ResourceHandler,
  McpServerResourceRegistration,
} from '../types/index.js';
import type { OpsClient } from '@uluops/ops-sdk';

describe('registerProjectsResource', () => {
  let mockServer: {
    resource: ReturnType<typeof vi.fn>;
  };
  let mockApiClient: {
    projects: {
      list: ReturnType<typeof vi.fn>;
    };
  };
  let projectsHandler: () => Promise<ResourceResponse>;
  let projectSummaryHandler: () => Promise<ResourceResponse>;

  beforeEach(() => {
    mockServer = {
      resource: vi.fn(),
    };
    mockApiClient = {
      projects: {
        list: vi.fn(),
      },
    };

    // Register resources and capture handlers
    registerProjectsResource(mockServer as any, mockApiClient as any);

    // Extract registered handlers
    expect(mockServer.resource).toHaveBeenCalledTimes(2);

    // First call: projects resource
    const projectsCall = mockServer.resource.mock.calls[0];
    expect(projectsCall[0]).toBe('projects');
    expect(projectsCall[1]).toBe('validation://projects');
    projectsHandler = projectsCall[3] as ResourceHandler;

    // Second call: project-summary resource
    const summaryCall = mockServer.resource.mock.calls[1];
    expect(summaryCall[0]).toBe('project-summary');
    expect(summaryCall[1]).toBe('validation://projects/{project}');
    projectSummaryHandler = summaryCall[3] as ResourceHandler;
  });

  describe('projects resource: validation://projects', () => {
    it('should register with correct name, uri, and metadata', () => {
      const [name, uri, metadata] = mockServer.resource.mock.calls[0];
      expect(name).toBe('projects');
      expect(uri).toBe('validation://projects');
      expect(metadata).toEqual({
        description: 'List all tracked projects',
        mimeType: 'application/json',
      });
    });

    it('should return projects list on success', async () => {
      mockApiClient.projects.list.mockResolvedValue({
        projects: ['project-a', 'project-b'],
      });

      const result = await projectsHandler();

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe('validation://projects');
      expect(result.contents[0].mimeType).toBe('application/json');

      const text = result.contents[0].text ?? '';
      const data = JSON.parse(text) as { projects: string[] };
      expect(data.projects).toEqual(['project-a', 'project-b']);
    });

    it('should handle API errors gracefully', async () => {
      mockApiClient.projects.list.mockRejectedValue(new Error('Connection failed'));

      const result = await projectsHandler();

      expect(result.contents).toHaveLength(1);
      const text = result.contents[0].text ?? '';
      const data = JSON.parse(text) as { error: string };
      expect(data.error).toBe('Connection failed');
    });
  });

  describe('project-summary resource: validation://projects/{project}', () => {
    it('should register with correct name, uri, and metadata', () => {
      const [name, uri, metadata] = mockServer.resource.mock.calls[1];
      expect(name).toBe('project-summary');
      expect(uri).toBe('validation://projects/{project}');
      expect((metadata as ResourceMetadata).description).toContain('project');
    });

    it('should return usage instructions for template resource', async () => {
      const result = await projectSummaryHandler();

      expect(result.contents).toHaveLength(1);
      const text = result.contents[0].text ?? '';
      const data = JSON.parse(text) as {
        info: string;
        tool: string;
        example: string;
        note: string;
      };
      expect(data.info).toContain('tool API');
      expect(data.tool).toBe('get_project_summary');
      expect(data.example).toBeDefined();
      expect(data.note).toContain('SDK limitation');
    });
  });
});

describe('registerTaxonomyResource', () => {
  let mockServer: {
    resource: ReturnType<typeof vi.fn>;
  };
  let taxonomyHandler: () => Promise<ResourceResponse>;

  const mockTaxonomyData = {
    domains: [
      { code: 'STR', name: 'Structural', description: 'Structural issues', modes: [{ code: 'OMI', name: 'omission', description: 'Missing element' }] },
      { code: 'SEM', name: 'Semantic', description: 'Semantic issues', modes: [{ code: 'INC', name: 'incorrectness', description: 'Wrong' }] },
      { code: 'PRA', name: 'Pragmatic', description: 'Pragmatic issues', modes: [{ code: 'ALI', name: 'misalignment', description: 'Misaligned' }] },
      { code: 'EPI', name: 'Epistemic', description: 'Epistemic issues', modes: [{ code: 'OVR', name: 'overclaiming', description: 'Overclaimed' }] },
    ],
    severities: [
      { code: 'C', name: 'critical', weight: 1 },
      { code: 'H', name: 'high', weight: 2 },
      { code: 'M', name: 'medium', weight: 3 },
      { code: 'L', name: 'low', weight: 4 },
      { code: 'I', name: 'info', weight: 5 },
    ],
    priorities: ['critical', 'high', 'suggested', 'backlog'],
    statuses: ['open', 'completed', 'deferred'],
    failureCodePattern: { pattern: '^(STR|SEM|PRA|EPI)-[A-Z]{3}/[CHMLI]$', format: '{DOMAIN}-{MODE}/{SEVERITY}', example: 'SEM-INC/H' },
  };

  const mockOpsClient = {
    taxonomy: { get: vi.fn().mockResolvedValue(mockTaxonomyData) },
  } as unknown as OpsClient;

  beforeEach(() => {
    mockServer = {
      resource: vi.fn(),
    };

    // Register resource and capture handler
    registerTaxonomyResource(mockServer as any, mockOpsClient);

    // Extract registered handler
    expect(mockServer.resource).toHaveBeenCalledTimes(1);
    const call = mockServer.resource.mock.calls[0];
    expect(call[0]).toBe('taxonomy');
    expect(call[1]).toBe('validation://taxonomy');
    taxonomyHandler = call[3] as ResourceHandler;
  });

  it('should register with correct name, uri, and metadata', () => {
    const [name, uri, metadata] = mockServer.resource.mock.calls[0];
    expect(name).toBe('taxonomy');
    expect(uri).toBe('validation://taxonomy');
    expect(metadata).toEqual({
      description: 'Failure taxonomy schema for classifying validation issues',
      mimeType: 'application/json',
    });
  });

  it('should return taxonomy data from SDK', async () => {
    const result = await taxonomyHandler();

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe('validation://taxonomy');
    expect(result.contents[0].mimeType).toBe('application/json');

    const text = result.contents[0].text ?? '';
    const taxonomy = JSON.parse(text) as Record<string, unknown>;
    expect(taxonomy).toHaveProperty('domains');
    expect(taxonomy).toHaveProperty('severities');
    expect(taxonomy).toHaveProperty('priorities');
    expect(taxonomy).toHaveProperty('statuses');
    expect(taxonomy).toHaveProperty('failureCodePattern');
  });

  it('should include all four failure domains with modes', async () => {
    const result = await taxonomyHandler();
    const text = result.contents[0].text ?? '';
    const taxonomy = JSON.parse(text) as { domains: Array<{ code: string; name: string; modes: unknown[] }> };

    expect(taxonomy.domains).toHaveLength(4);
    const codes = taxonomy.domains.map((d) => d.code);
    expect(codes).toEqual(['STR', 'SEM', 'PRA', 'EPI']);
    expect(taxonomy.domains[0].name).toBe('Structural');
    expect(taxonomy.domains[0].modes.length).toBeGreaterThan(0);
  });

  it('should include all severity levels', async () => {
    const result = await taxonomyHandler();
    const text = result.contents[0].text ?? '';
    const taxonomy = JSON.parse(text) as { severities: Array<{ code: string; name: string; weight: number }> };

    expect(taxonomy.severities).toHaveLength(5);
    expect(taxonomy.severities[0].code).toBe('C');
    expect(taxonomy.severities[0].name).toBe('critical');
  });

  it('should include failure code pattern', async () => {
    const result = await taxonomyHandler();
    const text = result.contents[0].text ?? '';
    const taxonomy = JSON.parse(text) as { failureCodePattern: { pattern: string; format: string; example: string } };

    expect(taxonomy.failureCodePattern.format).toBe('{DOMAIN}-{MODE}/{SEVERITY}');
    expect(taxonomy.failureCodePattern.pattern).toBe('^(STR|SEM|PRA|EPI)-[A-Z]{3}/[CHMLI]$');
    expect(taxonomy.failureCodePattern.example).toBe('SEM-INC/H');
  });
});

describe('registerAllResources', () => {
  it('should register all 3 resources', () => {
    const registeredResources: string[] = [];
    const mockServer: McpServerResourceRegistration = {
      resource: vi.fn((name: string) => {
        registeredResources.push(name);
      }),
    };
    const mockApiClient = {} as unknown as OpsClient;

    registerAllResources(mockServer, mockApiClient);

    expect(registeredResources.length).toBe(3);
    expect(registeredResources).toContain('projects');
    expect(registeredResources).toContain('project-summary');
    expect(registeredResources).toContain('taxonomy');
  });

  it('should call both registration functions', () => {
    const mockServer: McpServerResourceRegistration = {
      resource: vi.fn(),
    };
    const mockApiClient = {} as unknown as OpsClient;

    registerAllResources(mockServer, mockApiClient);

    // registerProjectsResource registers 2 resources (projects, project-summary)
    // registerTaxonomyResource registers 1 resource (taxonomy)
    expect(mockServer.resource).toHaveBeenCalledTimes(3);
  });
});
