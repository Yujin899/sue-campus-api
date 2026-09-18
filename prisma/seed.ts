import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Role } from '../src/generated/prisma/enums';
import { createPrismaClient } from '../src/prisma/prisma-client';

async function main(): Promise<void> {
  const prisma = createPrismaClient();

  const email = process.env.SEED_ADMIN_EMAIL;
  if (!email) {
    console.log('SEED_ADMIN_EMAIL is not set - skipping admin promotion.');
    await prisma.$disconnect();
    return;
  }

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      id: randomUUID(),
      email,
      name: email.split('@')[0],
      role: Role.ADMIN,
    },
    update: { role: Role.ADMIN },
  });

  console.log(`Ensured ${user.email} is ${user.role}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
