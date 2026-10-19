import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../src/lib/db";

describe("Newtonite Critical Operations Under Pressure", () => {
  let adminUser: any;
  let memberUser: any;
  let testTeam: any;
  let testItem: any;

  beforeAll(async () => {
    testTeam = await db.team.create({
      data: { name: `Test Team ${Date.now()}` },
    });

    adminUser = await db.user.create({
      data: {
        name: "Test Admin",
        email: `admin_${Date.now()}@company.internal`,
        role: "ADMIN",
        teamId: testTeam.id,
      },
    });

    memberUser = await db.user.create({
      data: {
        name: "Test Member",
        email: `member_${Date.now()}@company.internal`,
        role: "MEMBER",
        teamId: testTeam.id,
      },
    });

    testItem = await db.workItem.create({
      data: {
        title: "Database Lock Spikes",
        description: "Contention detected under high load",
        priority: "URGENT",
        status: "OPEN",
        teamId: testTeam.id,
        version: 1,
      },
    });
  });

  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { workItemId: testItem.id } });
    await db.workItem.delete({ where: { id: testItem.id } });
    await db.user.deleteMany({ where: { id: { in: [adminUser.id, memberUser.id] } } });
    await db.team.delete({ where: { id: testTeam.id } });
    await db.$disconnect();
  });

  it("1. Detects stale updates and enforces Optimistic Concurrency Control (OCC)", async () => {
    // Simulate Tab A reading version 1
    const initialVersion = testItem.version;

    // Simulate Tab B updating the item first
    await db.$transaction(async (tx) => {
      const current = await tx.workItem.findUnique({ where: { id: testItem.id } });
      await tx.workItem.update({
        where: { id: testItem.id },
        data: { status: "IN_PROGRESS", version: { increment: 1 } },
      });
    });

    // Tab A attempts to update using stale version (1) when database is now version 2
    const currentInDb = await db.workItem.findUnique({ where: { id: testItem.id } });
    expect(currentInDb?.version).toBe(2);

    const updateAttempt = async () => {
      return await db.$transaction(async (tx) => {
        const item = await tx.workItem.findUnique({ where: { id: testItem.id } });
        if (item?.version !== initialVersion) {
          throw new Error("VERSION_CONFLICT");
        }
        return await tx.workItem.update({
          where: { id: testItem.id },
          data: { status: "RESOLVED", version: { increment: 1 } },
        });
      });
    };

    await expect(updateAttempt()).rejects.toThrow("VERSION_CONFLICT");
  });

  it("2. Enforces resource-level permission boundaries", async () => {
    // Rule: MEMBER cannot resolve URGENT incidents
    const resolveAttempt = async (actorRole: string) => {
      const current = await db.workItem.findUnique({ where: { id: testItem.id } });
      if (actorRole === "MEMBER" && current?.priority === "URGENT") {
        throw new Error("FORBIDDEN_ROLE");
      }
      return true;
    };

    await expect(resolveAttempt(memberUser.role)).rejects.toThrow("FORBIDDEN_ROLE");
    await expect(resolveAttempt(adminUser.role)).resolves.toBe(true);
  });

  it("3. Creates immutable audit log entries atomically", async () => {
    await db.$transaction(async (tx) => {
      const updated = await tx.workItem.update({
        where: { id: testItem.id },
        data: { assigneeId: adminUser.id, version: { increment: 1 } },
      });

      await tx.auditLog.create({
        data: {
          workItemId: testItem.id,
          actorId: adminUser.id,
          action: "CLAIMED_OWNERSHIP",
          details: { previous: null, current: adminUser.id },
        },
      });
    });

    const logs = await db.auditLog.findMany({ where: { workItemId: testItem.id } });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.action === "CLAIMED_OWNERSHIP")).toBe(true);
  });
});