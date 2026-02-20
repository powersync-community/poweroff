// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";
import { ensureTanStackDbReady } from "~/lib/tanstack-db";

function boot() {
  void ensureTanStackDbReady();
  mount(() => <StartClient />, document.getElementById("app")!);
}

boot();

export default boot;
