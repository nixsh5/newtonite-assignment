"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { ItemSheet } from "@/components/work-items/item-sheet";
import { CreateWorkItemDialog } from "@/components/work-items/create-dialog";
import { Search, Shield, Filter } from "lucide-react";

export default function DashboardPage() {
  const [items, setItems] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const fetchItems = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (selectedTeam) params.set("teamId", selectedTeam);
      if (selectedStatus) params.set("status", selectedStatus);

      const res = await fetch(`/api/work-items?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [search, selectedTeam, selectedStatus]);

  useEffect(() => {
    async function loadMeta() {
      const res = await fetch("/api/meta");
      if (res.ok) {
        const { users: fetchedUsers, teams: fetchedTeams } = await res.json();
        setUsers(fetchedUsers);
        setTeams(fetchedTeams);
        if (fetchedUsers.length > 0 && !currentUser) {
          setCurrentUser(fetchedUsers[0]); // Default to first user (Alice - Admin)
        }
      }
    }
    loadMeta();
  }, [currentUser]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const urgentCount = items.filter((i) => i.priority === "URGENT").length;
  const pendingCount = items.filter((i) => i.status === "PENDING_APPROVAL").length;

  return (
    <div className="min-h-screen bg-slate-50/50 p-8 space-y-6">
      {/* Top Header & Identity Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Operations Console</h1>
          <p className="text-muted-foreground text-sm">Newtonite Engineering Assessment System</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 border rounded-lg shadow-sm">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Identity:</span>
            {users.length > 0 && currentUser && (
              <select
                aria-label="Active identity"
                value={currentUser.id}
                onChange={(e) => {
                  const u = users.find((x) => x.id === e.target.value);
                  if (u) setCurrentUser(u);
                }}
                className="text-xs font-semibold bg-transparent outline-none cursor-pointer"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role}) - {u.team?.name || "General"}
                  </option>
                ))}
              </select>
            )}
          </div>

          {currentUser && (
            <CreateWorkItemDialog
              teams={teams}
              currentUser={currentUser}
              onCreated={fetchItems}
            />
          )}
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium">Total Work Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-destructive">Urgent Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{urgentCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search work items by keyword..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <select
            aria-label="Filter by Team"
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-white outline-none cursor-pointer"
          >
            <option value="">All Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by Status"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-white outline-none cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <Card className="rounded-lg shadow-sm border overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead className="text-right">Version</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No work items match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow
                  key={item.id}
                  onClick={() => setSelectedItemId(item.id)}
                  className="cursor-pointer hover:bg-slate-100/60 transition-colors"
                >
                  <TableCell className="font-medium">{item.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={item.priority === "URGENT" ? "destructive" : "secondary"}
                    >
                      {item.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.team?.name}</TableCell>
                  <TableCell>{item.assignee?.name ?? "Unassigned"}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    v{item.version}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Detail Slide-over Sheet */}
      {currentUser && (
        <ItemSheet
          itemId={selectedItemId}
          currentUser={currentUser}
          onClose={() => setSelectedItemId(null)}
          onRefresh={fetchItems}
        />
      )}

      <Toaster />
    </div>
  );
}