// Usage: npm run hue:pair <bridge-ip>   (press the bridge's link button first)
import { pairHue } from "./hue.ts";

const bridge = process.argv[2];
if (!bridge) {
  console.error("Usage: npm run hue:pair <bridge-ip>");
  process.exit(1);
}

pairHue(bridge)
  .then(() => console.log(`Paired with Hue bridge ${bridge}. Saved to .aura-hue.json. Set GATEWAY=hue in .env and restart.`))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
