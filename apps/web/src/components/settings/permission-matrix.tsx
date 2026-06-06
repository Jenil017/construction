"use client";

interface PermissionMatrixProps {
  modules: string[];
  actions: string[];
  /** Selected permission keys, formatted "module:action". */
  selected: Set<string>;
  onToggle: (module: string, action: string) => void;
  onToggleModuleAll: (module: string, on: boolean) => void;
}

/** Module × action checkbox grid that drives a role's permission set. */
export function PermissionMatrix({
  modules,
  actions,
  selected,
  onToggle,
  onToggleModuleAll,
}: PermissionMatrixProps) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="p-2 text-left font-semibold">Module</th>
            {actions.map((a) => (
              <th key={a} className="p-2 text-center font-semibold capitalize">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => {
            const allOn = actions.every((a) => selected.has(`${m}:${a}`));
            return (
              <tr key={m} className="border-b last:border-0">
                <td className="p-2">
                  <label className="flex items-center gap-2 font-medium capitalize">
                    <input
                      type="checkbox"
                      checked={allOn}
                      onChange={(e) => onToggleModuleAll(m, e.target.checked)}
                      className="size-4 accent-[var(--primary)]"
                    />
                    {m}
                  </label>
                </td>
                {actions.map((a) => (
                  <td key={a} className="p-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${m} ${a}`}
                      checked={selected.has(`${m}:${a}`)}
                      onChange={() => onToggle(m, a)}
                      className="size-4 accent-[var(--primary)]"
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
