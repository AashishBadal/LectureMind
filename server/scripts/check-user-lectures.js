import { prisma } from '../src/config/prisma.js';

async function check() {
  const users = await prisma.user.findMany({
    include: {
      lectures: {
        include: {
          concepts: true,
          transcript: true,
          relationships: true
        }
      }
    }
  });

  console.log(`Found ${users.length} users in DB:`);
  users.forEach((u) => {
    console.log(`User: ${u.email} (${u.lectures.length} lectures)`);
    u.lectures.forEach((l) => {
      console.log(`  - [${l.id}] "${l.title}" (Concepts: ${l.concepts.length}, Relations: ${l.relationships.length})`);
    });
  });

  await prisma.$disconnect();
}

check();
