"use client";

import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Clock, User as UserIcon, ShieldAlert, CheckCircle2 } from "lucide-react";

interface ItemSheetProps {
  itemId: string | null;
  currentUser: { id: string; name: string; role: string };
  onClose: () => void;
  onRefresh: () => void;
}

export function ItemSheet({ itemId, currentUser, onClose, onRefresh }: ItemSheetProps) {
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (itemId) {
      loadDetails(itemId);
    } else {
      setItem(null);
    }
  }, [itemId]);

  async function loadDetails(id: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/work-items/${id}`);
      if (res.ok) {
        const data = await res.json();
        setItem(data);
      }
    } catch {
      toast.error("Failed to load details");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(updates: { status?: string; assigneeId?: string | null }) {
    if (!item) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/work-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: item.version,
          actorId: currentUser.id,
          ...updates,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        toast.error("Stale View Detected", {
          description: data.error,
        });
        // Reload fresh version
        loadDetails(item.id);
        onRefresh();
        return;
      }

      if (!res.ok) {
        toast.error("Operation Failed", { description: data.error });
        return;
      }

      toast.success("Work item updated successfully");
      loadDetails(item.id);
      onRefresh();
    } catch {
      toast.error("Unexpected error submitting update");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={!!itemId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        {loading || !item ? (
          <div className="p-6 text-sm text-muted-foreground">Loading details...</div>
        ) : (
          <div className="space-y-6">
            <SheetHeader className="text-left">
              <div className="flex items-center gap-2">
                <Badge variant={item.priority === "URGENT" ? "destructive" : "secondary"}>
                  {item.priority}
                </Badge>
                <Badge variant="outline">{item.status}</Badge>
                <span className="text-xs font-mono text-muted-foreground ml-auto">
                  v{item.version}
                </span>
              </div>
              <SheetTitle className="text-xl pt-2">{item.title}</SheetTitle>
              <SheetDescription className="text-slate-600 dark:text-slate-400">
                {item.description}
              </SheetDescription>
            </SheetHeader>

            {/* Actions Section */}
            <div className="p-4 bg-muted/40 rounded-lg space-y-3 border">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Work Item Actions
              </h4>
              <div className="flex flex-wrap gap-2">
                {item.assigneeId !== currentUser.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => handleUpdate({ assigneeId: currentUser.id })}
                  >
                    <UserIcon className="w-3.5 h-3.5 mr-1.5" /> Claim Ownership
                  </Button>
                )}

                {item.status !== "IN_PROGRESS" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => handleUpdate({ status: "IN_PROGRESS" })}
                  >
                    Start Working
                  </Button>
                )}

                {item.status !== "RESOLVED" && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={submitting}
                    onClick={() => handleUpdate({ status: "RESOLVED" })}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Mark Resolved
                  </Button>
                )}
              </div>
            </div>

            {/* Audit Log / Evolution Timeline */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Activity History ({item.auditLogs?.length || 0})
              </h4>
              <div className="space-y-2 border-l-2 border-muted pl-4">
                {item.auditLogs?.map((log: any) => (
                  <div key={log.id} className="text-xs space-y-1">
                    <div className="font-medium flex items-center justify-between">
                      <span>{log.actor?.name ?? "System"}</span>
                      <span className="text-muted-foreground">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      Action: <code className="text-foreground">{log.action}</code>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}