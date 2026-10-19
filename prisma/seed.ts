import { PrismaClient, Priority, Status, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clean existing data
  await prisma.auditLog.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();

  // Create Teams
  const engTeam = await prisma.team.create({ data: { name: "Core Engineering" } });
  const opsTeam = await prisma.team.create({ data: { name: "Operations & Support" } });
  const finTeam = await prisma.team.create({ data: { name: "Finance & Compliance" } });

  // Create Users with distinct roles
  const alice = await prisma.user.create({
    data: { name: "Alice Zhang", email: "alice@company.internal", role: Role.ADMIN, teamId: engTeam.id },
  });

  const bob = await prisma.user.create({
    data: { name: "Bob Smith", email: "bob@company.internal", role: Role.LEAD, teamId: opsTeam.id },
  });

  const charlie = await prisma.user.create({
    data: { name: "Charlie Davis", email: "charlie@company.internal", role: Role.MEMBER, teamId: opsTeam.id },
  });

  // Create Work Items representing different pressure scenarios
  const item1 = await prisma.workItem.create({
    data: {
      title: "Production DB Connection Spike in us-east",
      description: "Connection pool saturation detected on primary replica. Investigate active queries and lock contention.",
      priority: Priority.URGENT,
      status: Status.IN_PROGRESS,
      teamId: engTeam.id,
      assigneeId: alice.id,
      version: 1,
    },
  });

  const item2 = await prisma.workItem.create({
    data: {
      title: "Suspicious High-Value Refund Batch",
      description: "Batch #9824 exceeds standard operational threshold ($50,000). Needs compliance review before clearing.",
      priority: Priority.HIGH,
      status: Status.PENDING_APPROVAL,
      teamId: finTeam.id,
      assigneeId: null,
      version: 1,
    },
  });

  const item3 = await prisma.workItem.create({
    data: {
      title: "Customer Onboarding Webhook Failure",
      description: "Tenant 'Acme Corp' did not receive lifecycle activation payload.",
      priority: Priority.MEDIUM,
      status: Status.OPEN,
      teamId: opsTeam.id,
      assigneeId: charlie.id,
      version: 1,
    },
  });

  // Add Initial Audit Logs
  await prisma.auditLog.createMany({
    data: [
      {
        workItemId: item1.id,
        actorId: alice.id,
        action: "STATUS_CHANGE",
        details: { previous: "OPEN", current: "IN_PROGRESS" },
      },
      {
        workItemId: item2.id,
        actorId: bob.id,
        action: "REQUEST_APPROVAL",
        details: { thresholdExceeded: "$50,000", assignedTo: null },
      },
    ],
  });

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });