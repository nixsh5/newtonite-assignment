import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const [users, teams] = await Promise.all([
    db.user.findMany({ include: { team: true } }),
    db.team.findMany(),
  ]);
  return NextResponse.json({ users, teams });
}