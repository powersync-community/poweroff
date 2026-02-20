import { getPendingQueueCount } from "~/lib/sync-activity";
import { setClientRole, type DemoSession } from "~/lib/session";

export function StatusBar(props: {
  session: DemoSession;
  openConflicts: number;
}) {
  const handleRoleSwitch = (role: "tech" | "manager") => {
    if (role === props.session.role) return;
    console.log("[status-bar] switching role", {
      from: props.session.role,
      to: role,
    });
    setClientRole(role);
  };

  return (
    <header class="border-b border-gray-200 bg-white px-4 py-3">
      <div class="flex flex-wrap items-center gap-3 text-sm text-gray-700">
        <span>Pending Queue: {getPendingQueueCount()}</span>
        <span>Open Conflicts: {props.openConflicts}</span>

        <div class="ml-auto flex gap-2">
          <button
            onClick={() => handleRoleSwitch("tech")}
            class={`rounded px-3 py-1 text-xs font-semibold ${
              props.session.role === "tech"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-800"
            }`}
          >
            Tech View
          </button>
          <button
            onClick={() => handleRoleSwitch("manager")}
            class={`rounded px-3 py-1 text-xs font-semibold ${
              props.session.role === "manager"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-800"
            }`}
          >
            Manager View
          </button>
        </div>
      </div>
    </header>
  );
}
