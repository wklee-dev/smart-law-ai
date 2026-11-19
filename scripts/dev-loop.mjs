import { spawn } from "node:child_process";

function runDev() {
  console.log("[dev-loop] starting npm run dev …");
  const child = spawn("npm run dev", {
    stdio: "inherit",
    shell: true,
    cwd: process.cwd(),
  });
  child.on("exit", (code, signal) => {
    console.log(
      `[dev-loop] dev exited (code=${code ?? "null"}, signal=${signal ?? "null"}). Restart in 3s…`,
    );
    setTimeout(runDev, 3000);
  });
}

runDev();
