import { execSync } from "child_process";

try {
  const tracked = execSync("git ls-files", { encoding: "utf-8" });
  console.log("=== TRACKED FILES ===");
  console.log(tracked.split("\n").filter(f => f.includes("login") || f.includes("page.tsx") || f.includes("middleware")).join("\n"));
  
  const status = execSync("git status --short", { encoding: "utf-8" });
  console.log("=== GIT STATUS SHORT ===");
  console.log(status || "(clean)");

  const log = execSync("git log -n 5 --oneline", { encoding: "utf-8" });
  console.log("=== RECENT COMMITS ===");
  console.log(log);
} catch (e) {
  console.error("Error checking git:", e.message);
}
