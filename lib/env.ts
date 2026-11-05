import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
for (const filename of ['.env.local','.env']) {
 const path = resolve(process.cwd(),filename);
 if (existsSync(path)) process.loadEnvFile(path);
}
