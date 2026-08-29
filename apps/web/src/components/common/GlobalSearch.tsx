import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, User, Bike } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { Input } from "@/components/ui/input";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { cn } from "@/lib/utils";

export function GlobalSearch() {
  const [value, setValue] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setTerm(value), 300);
    return () => clearTimeout(t);
  }, [value]);

  const { enabled, isLoading, users, vehicles } = useGlobalSearch(term);
  const hasResults = users.length > 0 || vehicles.length > 0;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function go(path: string) {
    navigate(path);
    setOpen(false);
    setValue("");
    setTerm("");
  }

  const showPanel = open && value.trim().length > 0;

  return (
    <div ref={containerRef} className="relative hidden w-56 md:w-64 sm:block">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="Search riders & vehicles…"
        title="Search riders and vehicles — type a name, email, phone number or vehicle registration"
        aria-label="Search riders and vehicles"
        className="h-10 rounded-full border-border/60 bg-card-hover/60 pl-10 focus-visible:bg-background"
      />

      {showPanel && (
        <div className="absolute left-0 right-0 top-12 z-50 max-h-96 overflow-y-auto scrollbar-thin rounded-2xl border border-border bg-card p-2 shadow-card">
          {!enabled && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Keep typing… (2+ characters)</p>
          )}

          {enabled && isLoading && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Spinner className="h-3.5 w-3.5" /> Searching…
            </div>
          )}

          {enabled && !isLoading && !hasResults && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No results for "{term}".</p>
          )}

          {enabled && !isLoading && users.length > 0 && (
            <div className="mb-1">
              <p className="px-3 py-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
                Users
              </p>
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => go(`/users/${u.id}`)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm",
                    "transition-smooth hover:bg-card-hover",
                  )}
                >
                  <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{u.full_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {u.email ?? u.phone ?? "—"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {enabled && !isLoading && vehicles.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
                Vehicles
              </p>
              {vehicles.map((v) => (
                <button
                  key={v.id}
                  onClick={() => go(`/vehicles/${v.id}`)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm",
                    "transition-smooth hover:bg-card-hover",
                  )}
                >
                  <Bike className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{v.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{v.registration_number}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
