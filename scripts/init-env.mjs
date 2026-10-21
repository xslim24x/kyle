import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const token = () => randomBytes(24).toString("hex");
writeFileSync(
  ".env",
  `APP_ORIGIN=http://localhost:3000\nAPP_PORT=3000\nAPP_PASSWORD=${token()}\nPOSTGRES_PASSWORD=${token()}\nCALENDAR_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\n`,
  { flag: "wx", mode: 0o600 },
);
console.log(
  "Created .env without printing credentials. Set APP_ORIGIN and choose APP_PASSWORD before deployment.",
);
