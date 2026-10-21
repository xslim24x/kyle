import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const cache = resolve(process.argv[2] ?? "/workspace/.npm-cache");
if (!existsSync(join(cache, "_cacache")))
  throw new Error(
    "Supply an npm cache containing the locked packages. Run npm ci with that cache first.",
  );
const source = readFileSync("Dockerfile", "utf8");
const install = "RUN npm ci --fetch-retries=1 --fetch-timeout=30000";
const productionInstall =
  "RUN npm ci --omit=dev --fetch-retries=1 --fetch-timeout=30000";
if (!source.includes(install) || !source.includes(productionInstall))
  throw new Error(
    "Dockerfile installation commands changed; review the offline build helper.",
  );
const dockerfile = source
  .replace(
    install,
    "COPY --from=package-cache /_cacache /root/.npm/_cacache\nRUN npm ci --offline",
  )
  .replace(
    productionInstall,
    "COPY --from=package-cache /_cacache /root/.npm/_cacache\nRUN npm ci --omit=dev --offline",
  );
const directory = mkdtempSync(join(tmpdir(), "kyle-build-"));
try {
  const path = join(directory, "Dockerfile");
  writeFileSync(path, dockerfile);
  const result = spawnSync(
    "docker",
    [
      "build",
      "--build-context",
      `package-cache=${cache}`,
      "-f",
      path,
      "-t",
      "kyle-app",
      ".",
    ],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true });
}
