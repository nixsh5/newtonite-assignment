import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const item = await db.workItem.findUnique({
      where: { id: params.id },
      include: {
        assignee: true,
        team: true,
        auditLogs: {
          include: { actor: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Work item not found" }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { expectedVersion, status, assigneeId, priority, actorId } = body;

    if (expectedVersion === undefined || !actorId) {
      return NextResponse.json(
        { error: "expectedVersion and actorId are mandatory" },
        { status: 400 }
      );
    }

    // Fetch actor to enforce authorization rules
    const actor = await db.user.findUnique({ where: { id: actorId } });
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized: Invalid actor" }, { status: 403 });
    }

    // Atomic transaction for concurrency check + mutation + audit log
    const updated = await db.$transaction(async (tx) => {
      const current = await tx.workItem.findUnique({
        where: { id: params.id },
      });

      if (!current) {
        throw new Error("NOT_FOUND");
      }

      // 1. Concurrency Check: Stale Version Guard
      if (current.version !== expectedVersion) {
        throw new Error("VERSION_CONFLICT");
      }

      // 2. Business Rule: Resolving or Approving requires LEAD or ADMIN
      if (
        (status === "RESOLVED" || status === "CLOSED") &&
        actor.role === "MEMBER" &&
        current.priority === "URGENT"
      ) {
        throw new Error("FORBIDDEN_ROLE");
      }

      // 3. Apply Update and increment version counter atomically
      const result = await tx.workItem.update({
        where: { id: params.id },
        data: {
          status: status ?? current.status,
          priority: priority ?? current.priority,
          assigneeId: assigneeId !== undefined ? assigneeId : current.assigneeId,
          version: { increment: 1 },
        },
        include: { assignee: true, team: true },
      });

      // 4. Create Audit Log entry
      await tx.auditLog.create({
        data: {
          workItemId: params.id,
          actorId,
          action: assigneeId && assigneeId === actorId ? "CLAIMED_OWNERSHIP" : "UPDATED_STATE",
          details: {
            previous: { status: current.status, assigneeId: current.assigneeId, priority: current.priority },
            current: { status: result.status, assigneeId: result.assigneeId, priority: result.priority },
          },
        },
      });

      return result;
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.message === "VERSION_CONFLICT") {
      return NextResponse.json(
        {
          error: "Conflict: This record was modified by another user while you were viewing it. Refreshing current data...",
        },
        { status: 409 }
      );
    }
    if (error.message === "FORBIDDEN_ROLE") {
      return NextResponse.json(
        { error: "Permission Denied: Only Leads or Admins can resolve Urgent operational items." },
        { status: 403 }
      );
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Work item not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}