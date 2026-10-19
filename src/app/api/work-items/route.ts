import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const teamId = searchParams.get("teamId");
    const status = searchParams.get("status");

    const items = await db.workItem.findMany({
      where: {
        AND: [
          search
            ? {
                OR: [
                  { title: { contains: search, mode: "insensitive" } },
                  { description: { contains: search, mode: "insensitive" } },
                ],
              }
            : {},
          teamId ? { teamId } : {},
          status ? { status: status as any } : {},
        ],
      },
      include: { assignee: true, team: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch work items" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description, priority, teamId, actorId, idempotencyKey } = body;

    if (!title || !description || !teamId || !actorId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Critical Requirement: Preventing duplicate submissions via Idempotency Key
    if (idempotencyKey) {
      const existing = await db.idempotencyRecord.findUnique({
        where: { key: idempotencyKey },
      });
      if (existing) {
        return NextResponse.json(existing.response, { status: 200 });
      }
    }

    const created = await db.$transaction(async (tx) => {
      const item = await tx.workItem.create({
        data: {
          title,
          description,
          priority: priority || "MEDIUM",
          teamId,
          version: 1,
        },
        include: { team: true, assignee: true },
      });

      await tx.auditLog.create({
        data: {
          workItemId: item.id,
          actorId,
          action: "CREATED",
          details: { title: item.title, priority: item.priority },
        },
      });

      if (idempotencyKey) {
        await tx.idempotencyRecord.create({
          data: {
            key: idempotencyKey,
            response: item as any,
          },
        });
      }

      return item;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create work item" }, { status: 500 });
  }
}