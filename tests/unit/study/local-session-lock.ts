import { spawn, spawnSync } from "node:child_process";
import { vi } from "vitest";

/** Test-only interactive transaction against the fixed LOCAL container, no credentials. */
export async function holdLocalSessionRow(ownerId: string, statement: string) {
  if (!/^[a-f0-9-]{36}$/.test(ownerId)) throw new Error("Invalid synthetic owner");
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_lexora",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { stdio: "pipe" },
  );
  let stdout = "";
  let stderr = "";
  child.stdin.on("error", (error) => {
    stderr += error.message;
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const exited = new Promise<number | null>((resolve) => child.once("close", resolve));
  const pid = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.stdin.end("rollback;\n");
      reject(new Error("Local lock barrier timed out"));
    }, 5000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", () => {
      clearTimeout(timer);
      reject(new Error(`Local transaction exited before barrier: ${stderr}`));
    });
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      const match = stdout.match(/LOCKED:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.stdin.write(
      `begin; set local lock_timeout = '3s'; set local statement_timeout = '4s'; set local idle_in_transaction_session_timeout = '15s'; set local request.jwt.claims = '{"sub":"${ownerId}","role":"authenticated"}'; set local role authenticated; ${statement}; select 'LOCKED:' || pg_backend_pid();\n`,
    );
  });
  return {
    async waitForBlocked(count: number) {
      await vi.waitFor(
        () => {
          const result = spawnSync(
            "docker",
            [
              "exec",
              "supabase_db_lexora",
              "psql",
              "-X",
              "-qAt",
              "-U",
              "postgres",
              "-d",
              "postgres",
              "-v",
              "ON_ERROR_STOP=1",
              "-c",
              `with recursive blocked(pid) as (select pid from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid)) union select a.pid from pg_stat_activity a join blocked b on b.pid = any(pg_blocking_pids(a.pid))) select count(*) from blocked`,
            ],
            { encoding: "utf8", timeout: 5000 },
          );
          if (result.status !== 0) throw new Error("Local lock inspection failed");
          if (Number(result.stdout.trim()) < count)
            throw new Error("Transaction has not reached the database lock barrier");
        },
        { timeout: 5000, interval: 50 },
      );
    },
    async release() {
      if (!child.stdin.writableEnded) child.stdin.end("commit;\n");
      if ((await exited) !== 0) throw new Error(`Local transaction failed: ${stderr}`);
    },
  };
}
