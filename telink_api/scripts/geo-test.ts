// Quick test: does the GeoIP DB resolve real public IPs?
import { open } from 'maxmind';
import { resolve } from 'path';

async function main() {
  const path = resolve(process.cwd(), './data/dbip-city-lite.mmdb');
  const reader = await open(path);

  const ips = [
    '8.8.8.8',        // Google DNS, US
    '1.1.1.1',        // Cloudflare, US
    '196.203.0.1',    // Tunisie Telecom (TN)
    '197.27.0.1',     // Ooredoo Tunisia (TN)
    '212.27.48.10',   // Free SAS, France
  ];

  for (const ip of ips) {
    const r = reader.get(ip) as any;
    if (!r) {
      console.log(`${ip.padEnd(16)} -> no data`);
      continue;
    }
    const city = r.city?.names?.en ?? '?';
    const country = r.country?.names?.en ?? '?';
    const lat = r.location?.latitude ?? '?';
    const lng = r.location?.longitude ?? '?';
    console.log(`${ip.padEnd(16)} -> ${city}, ${country} (${lat}, ${lng})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});