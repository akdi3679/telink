import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { open, Reader } from 'maxmind';

export interface GeoLocation {
  city: string | null;
  country: string | null;
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
}

const EMPTY: GeoLocation = {
  city: null,
  country: null,
  countryCode: null,
  lat: null,
  lng: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyReader = Reader<any>;

@Injectable()
export class GeoService implements OnModuleInit {
  private readonly logger = new Logger(GeoService.name);
  private reader: AnyReader | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const configured =
      this.config.get<string>('GEOIP_DB_PATH') ?? './data/dbip-city-lite.mmdb';
    const path = resolve(process.cwd(), configured);

    if (!existsSync(path)) {
      this.logger.warn(
        `GeoIP database not found at ${path}. IP geolocation disabled.`,
      );
      return;
    }

    try {
      this.reader = (await open(path)) as AnyReader;
      this.logger.log(`GeoIP database loaded from ${path}`);
    } catch (e) {
      this.logger.error(
        `Failed to load GeoIP database: ${(e as Error).message}`,
      );
      this.reader = null;
    }
  }

  lookup(ip: string | null | undefined): GeoLocation {
    if (!this.reader || !ip) return EMPTY;
    if (this.isPrivate(ip)) return EMPTY;

    try {
      const result = this.reader.get(ip) as {
        city?: { names?: Record<string, string> };
        country?: { names?: Record<string, string>; iso_code?: string };
        location?: { latitude?: number; longitude?: number };
      } | null;
      if (!result) return EMPTY;

      return {
        city: result.city?.names?.en ?? null,
        country: result.country?.names?.en ?? null,
        countryCode: result.country?.iso_code ?? null,
        lat: result.location?.latitude ?? null,
        lng: result.location?.longitude ?? null,
      };
    } catch (e) {
      this.logger.warn(
        `GeoIP lookup failed for ${ip}: ${(e as Error).message}`,
      );
      return EMPTY;
    }
  }

  private isPrivate(ip: string): boolean {
    if (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('169.254.') ||
      ip.startsWith('fc') ||
      ip.startsWith('fd') ||
      ip.startsWith('fe80:')
    ) {
      return true;
    }
    const m = /^172\.(\d+)\./.exec(ip);
    if (m) {
      const second = parseInt(m[1], 10);
      if (second >= 16 && second <= 31) return true;
    }
    return false;
  }
}