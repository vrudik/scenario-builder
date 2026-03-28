import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STARTER_TEMPLATES = [
  {
    name: 'Customer Support Triage',
    description: 'Classify incoming support tickets, check order status, and generate a response.',
    category: 'crm',
    difficulty: 'beginner',
    version: '1.0.0',
    isPublished: true,
    tags: JSON.stringify(['support', 'triage', 'starter']),
    spec: JSON.stringify({
      id: 'tpl-support-triage',
      name: 'Customer Support Triage',
      trigger: { type: 'api', endpoint: '/run' },
      nodes: [
        { id: 'classify', type: 'agent', config: { goal: 'Classify the customer message into: billing, shipping, technical, general' } },
        { id: 'lookup', type: 'tool', toolId: 'order-lookup', config: {} },
        { id: 'respond', type: 'agent', config: { goal: 'Generate a helpful response based on classification and order data' } },
      ],
      edges: [
        { from: 'classify', to: 'lookup' },
        { from: 'lookup', to: 'respond' },
      ],
    }),
    mockConfig: JSON.stringify({
      'order-lookup': { response: { orderId: 'ORD-1234', status: 'shipped', eta: '2 days' } },
    }),
    guide: '## Customer Support Triage\n\nThis template classifies incoming messages and generates responses.\n\n### How it works\n1. Agent classifies the message\n2. Tool looks up order data\n3. Agent generates a response',
  },
  {
    name: 'Document Processing Pipeline',
    description: 'Extract data from documents, validate, and store in database.',
    category: 'async_callbacks',
    difficulty: 'intermediate',
    version: '1.0.0',
    isPublished: true,
    tags: JSON.stringify(['documents', 'extraction', 'starter']),
    spec: JSON.stringify({
      id: 'tpl-doc-processing',
      name: 'Document Processing Pipeline',
      trigger: { type: 'api', endpoint: '/run' },
      nodes: [
        { id: 'extract', type: 'agent', config: { goal: 'Extract key fields from the document text' } },
        { id: 'validate', type: 'tool', toolId: 'data-validator', config: {} },
        { id: 'store', type: 'tool', toolId: 'db-store', config: {} },
      ],
      edges: [
        { from: 'extract', to: 'validate' },
        { from: 'validate', to: 'store' },
      ],
    }),
    mockConfig: JSON.stringify({
      'data-validator': { response: { valid: true, errors: [] } },
      'db-store': { response: { stored: true, recordId: 'REC-5678' } },
    }),
    guide: '## Document Processing\n\nExtract structured data from unstructured documents.\n\n### How it works\n1. Agent extracts key fields\n2. Validator checks data quality\n3. Store saves to database',
  },
  {
    name: 'Approval Workflow',
    description: 'Multi-step approval process with escalation and notification.',
    category: 'approval',
    difficulty: 'intermediate',
    version: '1.0.0',
    isPublished: true,
    tags: JSON.stringify(['approval', 'workflow', 'starter']),
    spec: JSON.stringify({
      id: 'tpl-approval',
      name: 'Approval Workflow',
      trigger: { type: 'api', endpoint: '/run' },
      nodes: [
        { id: 'review', type: 'agent', config: { goal: 'Review the request and determine if it needs manager approval' } },
        { id: 'notify', type: 'tool', toolId: 'email-sender', config: {} },
        { id: 'approve', type: 'tool', toolId: 'approval-gate', config: { requiresApproval: true } },
      ],
      edges: [
        { from: 'review', to: 'notify' },
        { from: 'notify', to: 'approve' },
      ],
    }),
    mockConfig: JSON.stringify({
      'email-sender': { response: { sent: true, messageId: 'MSG-9012' } },
      'approval-gate': { response: { approved: true, approver: 'manager@example.com' } },
    }),
    guide: '## Approval Workflow\n\nAutomate multi-step approval processes.\n\n### How it works\n1. Agent reviews the request\n2. Notification sent to approver\n3. Approval gate waits for decision',
  },
];

export async function seedStarterTemplates() {
  for (const tpl of STARTER_TEMPLATES) {
    const existing = await prisma.template.findFirst({ where: { name: tpl.name, tenantId: 'default' } });
    if (!existing) {
      await prisma.template.create({ data: { ...tpl, tenantId: 'default' } });
      console.log(`Seeded template: ${tpl.name}`);
    }
  }
}
