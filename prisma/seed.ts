import { PrismaClient } from '@prisma/client';
import { seedStarterTemplates } from './seeds/starter-templates';

const prisma = new PrismaClient();

async function main() {
  // Seed default org if not exists
  const existing = await prisma.org.findUnique({ where: { slug: 'default' } });
  if (!existing) {
    const org = await prisma.org.create({
      data: {
        name: 'Default Organization',
        slug: 'default',
        plan: 'free',
        status: 'active',
      },
    });

    await prisma.workspace.create({
      data: {
        orgId: org.id,
        name: 'Default Workspace',
        slug: 'default',
        tenantId: 'default',
        environment: 'production',
      },
    });

    // Link any existing ApiKeys without orgId
    await prisma.apiKey.updateMany({
      where: { orgId: null },
      data: { orgId: org.id },
    });

    console.log('Seeded default org + workspace:', org.id);
  } else {
    console.log('Default org already exists:', existing.id);
  }

  // Seed starter templates
  await seedStarterTemplates();
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
