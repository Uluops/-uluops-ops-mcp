/**
 * Resources Tests
 *
 * Tests for MCP resource registration and handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setOrgCallSink, UNTRUSTED_CONTENT_NOTICE, type OrgCallRecord } from '../utils/org-call-log.js';
import type { OpsClient } from '@uluops/ops-sdk';
import { registerProjectsResource } from '../resources/projects.js';
import { registerTaxonomyResource } from '../resources/taxonomy.js';
import { registerAllResources } from '../resources/index.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ResourceResponse,
  ResourceMetadata,
  ResourceHandler,
  ResourceTemplateHandler,
  McpServerResourceRegistration,
} from '../types/index.js';
import type { OpsClient } from '@uluops/ops-sdk';

describe('registerProjectsResource', () => {
  let mockServer: {
    registerResource: ReturnType<typeof vi.fn>;
  };
  let mockApiClient: {
    projects: {
      list: ReturnType<typeof vi.fn>;
    };
  };
  let projectsHandler: () => Promise<ResourceResponse>;
  let projectSummaryHandler: ResourceTemplateHandler;

  beforeEach(() => {
    mockServer = {
      registerResource: vi.fn(),
    };
    mockApiClient = {
      projects: {
        list: vi.fn(),
      },
    };

    // Register resources and capture handlers
    registerProjectsResource(mockServer, mockApiClient as any);

    // Extract registered handlers
    expect(mockServer.registerResource).toHaveBeenCalledTimes(2);

    // First call: projects resource
    const projectsCall = mockServer.registerResource.mock.calls[0];
    expect(projectsCall[0]).toBe('projects');
    expect(projectsCall[1]).toBe('validation://projects');
    projectsHandler = projectsCall[3] as ResourceHandler;

    // Second call: project-summary resource
    const summaryCall = mockServer.registerResource.mock.calls[1];
    expect(summaryCall[0]).toBe('project-summary');
    expect(summaryCall[1]).toBeInstanceOf(ResourceTemplate);
    projectSummaryHandler = summaryCall[3] as ResourceTemplateHandler;
  });

  describe('projects resource: validation://projects', () => {
    it('should register with correct name, uri, and metadata', () => {
      const [name, uri, metadata] = mockServer.registerResource.mock.calls[0];
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

      // contents[0] is the payload byte-for-byte; contents[1] is the D16 notice
      // (0.21.1 — A8: the resource path used to carry neither notice nor record).
      expect(result.contents).toHaveLength(2);
      expect(result.contents[0].uri).toBe('validation://projects');
      expect(result.contents[0].mimeType).toBe('application/json');

      const text = result.contents[0].text;
      const data = JSON.parse(text) as { projects: string[] };
      expect(data.projects).toEqual(['project-a', 'project-b']);
    });

    it('A8: success carries the same D16 untrusted-content notice the tool path appends', async () => {
      mockApiClient.projects.list.mockResolvedValue({ projects: ['a'] });
      const result = await projectsHandler();
      expect(result.contents[1].mimeType).toBe('text/plain');
      expect(result.contents[1].text).toBe(UNTRUSTED_CONTENT_NOTICE);
    });

    it('A8: a resource read emits a provenance record naming the personal org and the URI', async () => {
      const records: OrgCallRecord[] = [];
      setOrgCallSink((r) => records.push(r));
      try {
        mockApiClient.projects.list.mockResolvedValue({ projects: ['a'] });
        await projectsHandler();
      } finally {
        setOrgCallSink(undefined);
      }
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ tool: 'resources/read validation://projects', org: 'personal', orgSource: 'personal' });
    });

    it('control: the error path carries no notice (nothing user-authored comes back) and emits no record', async () => {
      const records: OrgCallRecord[] = [];
      setOrgCallSink((r) => records.push(r));
      try {
        mockApiClient.projects.list.mockRejectedValue(new Error('down'));
        const result = await projectsHandler();
        expect(result.contents).toHaveLength(1);
      } finally {
        setOrgCallSink(undefined);
      }
      expect(records).toHaveLength(0);
    });

    it('should handle API errors gracefully', async () => {
      mockApiClient.projects.list.mockRejectedValue(new Error('Connection failed'));

      const result = await projectsHandler();

      expect(result.contents).toHaveLength(1);
      const text = result.contents[0].text;
      const data = JSON.parse(text) as { error: string };
      expect(data.error).toBe('Connection failed');
    });
  });

  describe('project-summary resource: validation://projects/{project}', () => {
    it('registers a real ResourceTemplate, not the literal placeholder string (run #13)', () => {
      // A literal registration resolved only the placeholder itself; any real
      // project URI got a bare -32602 with none of the guidance.
      const [name, template, metadata] = mockServer.registerResource.mock.calls[1];
      expect(name).toBe('project-summary');
      expect(typeof template).not.toBe('string');
      const t = template as ResourceTemplate;
      expect(t.uriTemplate.toString()).toBe('validation://projects/{project}');
      expect(t.uriTemplate.match('validation://projects/my-project')).toEqual({ project: 'my-project' });
      expect((metadata as ResourceMetadata).description).toContain('project');
    });

    it('lists the placeholder via the template list callback — resources/templates/list is refused by mcp-secure-server', async () => {
      // With list: undefined the pattern disappeared from resources/list and the
      // only other listing method is blocked at the security layer.
      const t = mockServer.registerResource.mock.calls[1][1] as ResourceTemplate;
      const list = t.listCallback;
      if (list === undefined) throw new Error('template has no list callback');
      const listed = await list({} as never);
      expect(listed.resources.map((r) => r.uri)).toEqual(['validation://projects/{project}']);
      expect(mockApiClient.projects.list).not.toHaveBeenCalled();
    });

    it('reading the listed placeholder itself yields a usable example, not the encoded braces', async () => {
      const result = await projectSummaryHandler(new URL('validation://projects/%7Bproject%7D'), { project: '%7Bproject%7D' });
      const data = JSON.parse(result.contents[0].text) as { example: string };
      expect(data.example).toBe('get_project_summary({"project":"my-project"})');
    });

    it('a substituted project URI returns guidance naming that project', async () => {
      const uri = new URL('validation://projects/my-project');
      const result = await projectSummaryHandler(uri, { project: 'my-project' });

      expect(result.contents).toHaveLength(2);
      expect(result.contents[0].uri).toBe(uri.href);
      const data = JSON.parse(result.contents[0].text) as {
        info: string;
        tool: string;
        example: string;
        note: string;
      };
      expect(data.tool).toBe('get_project_summary');
      expect(data.example).toBe('get_project_summary({"project":"my-project"})');
      expect(data.note).toContain('org');
      // Routes only — never calls the API (no data path outside the org seam).
      expect(mockApiClient.projects.list).not.toHaveBeenCalled();
    });
  });
});

describe('registerTaxonomyResource', () => {
  let mockServer: {
    registerResource: ReturnType<typeof vi.fn>;
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
      registerResource: vi.fn(),
    };

    // Register resource and capture handler
    registerTaxonomyResource(mockServer, mockOpsClient);

    // Extract registered handler
    expect(mockServer.registerResource).toHaveBeenCalledTimes(1);
    const call = mockServer.registerResource.mock.calls[0];
    expect(call[0]).toBe('taxonomy');
    expect(call[1]).toBe('validation://taxonomy');
    taxonomyHandler = call[3] as ResourceHandler;
  });

  it('should register with correct name, uri, and metadata', () => {
    const [name, uri, metadata] = mockServer.registerResource.mock.calls[0];
    expect(name).toBe('taxonomy');
    expect(uri).toBe('validation://taxonomy');
    expect(metadata).toEqual({
      description: 'Failure taxonomy schema for classifying validation issues',
      mimeType: 'application/json',
    });
  });

  it('should return taxonomy data from SDK', async () => {
    const result = await taxonomyHandler();

    expect(result.contents).toHaveLength(2);
    expect(result.contents[0].uri).toBe('validation://taxonomy');
    expect(result.contents[0].mimeType).toBe('application/json');

    const text = result.contents[0].text;
    const taxonomy = JSON.parse(text) as Record<string, unknown>;
    expect(taxonomy).toHaveProperty('domains');
    expect(taxonomy).toHaveProperty('severities');
    expect(taxonomy).toHaveProperty('priorities');
    expect(taxonomy).toHaveProperty('statuses');
    expect(taxonomy).toHaveProperty('failureCodePattern');
  });

  it('should include all four failure domains with modes', async () => {
    const result = await taxonomyHandler();
    const text = result.contents[0].text;
    const taxonomy = JSON.parse(text) as { domains: Array<{ code: string; name: string; modes: unknown[] }> };

    expect(taxonomy.domains).toHaveLength(4);
    const codes = taxonomy.domains.map((d) => d.code);
    expect(codes).toEqual(['STR', 'SEM', 'PRA', 'EPI']);
    expect(taxonomy.domains[0].name).toBe('Structural');
    expect(taxonomy.domains[0].modes.length).toBeGreaterThan(0);
  });

  it('should include all severity levels', async () => {
    const result = await taxonomyHandler();
    const text = result.contents[0].text;
    const taxonomy = JSON.parse(text) as { severities: Array<{ code: string; name: string; weight: number }> };

    expect(taxonomy.severities).toHaveLength(5);
    expect(taxonomy.severities[0].code).toBe('C');
    expect(taxonomy.severities[0].name).toBe('critical');
  });

  it('should include failure code pattern', async () => {
    const result = await taxonomyHandler();
    const text = result.contents[0].text;
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
      registerResource: vi.fn((name: string) => {
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
      registerResource: vi.fn(),
    };
    const mockApiClient = {} as unknown as OpsClient;

    registerAllResources(mockServer, mockApiClient);

    // registerProjectsResource registers 2 resources (projects, project-summary)
    // registerTaxonomyResource registers 1 resource (taxonomy)
    expect(mockServer.registerResource).toHaveBeenCalledTimes(3);
  });
});
