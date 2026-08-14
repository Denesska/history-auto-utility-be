import { Injectable, Logger } from '@nestjs/common';

export interface ResolvedLocation {
  name: string | null;
  lat: number | null;
  lon: number | null;
  url: string;
}

// A desktop-ish UA: goo.gl short links answer a bare GET with a 30x to the real maps URL, and
// Google is less likely to serve a consent wall to this than to a scripted client.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * Turns whatever Google Maps put on the phone's share sheet into coordinates (and/or a place
 * name). The messy part of the whole feature, kept server-side on purpose so it can be fixed and
 * redeployed without touching the car or the phone app.
 *
 * A share is usually one of: a `maps.app.goo.gl/…` short link (needs following), a full
 * `…/maps/place/Name/@lat,lng,17z/…!3d..!4d..` URL, or a `?q=`/`?query=` link that carries either
 * coordinates or a bare place name. We follow one redirect chain, then read coordinates out of the
 * final URL (or, failing that, the page), and fall back to the place name for the car to geocode.
 */
@Injectable()
export class NavLinkResolver {
  private readonly logger = new Logger(NavLinkResolver.name);

  async resolve(input: string): Promise<ResolvedLocation> {
    const url = extractFirstUrl(input) ?? input.trim();

    let finalUrl = url;
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT },
      });
      finalUrl = res.url || url;

      let coords = parseCoords(finalUrl);
      let name = parseName(finalUrl);

      // A consent / "sorry" interstitial hides the real target in ?continue=.
      if (!coords && /consent\.google|\/sorry\//i.test(finalUrl)) {
        const cont = safeUrlParam(finalUrl, 'continue');
        if (cont) {
          coords = parseCoords(cont);
          name = name ?? parseName(cont);
        }
      }

      // Last resort: the coordinates are often still in the returned HTML (the map's own
      // og:image / embedded state), even when the URL only carries a place name.
      if (!coords || !name) {
        const html = await res.text();
        coords = coords ?? parseCoords(html);
        name = name ?? parseNameFromHtml(html);
      }

      return { name, lat: coords?.lat ?? null, lon: coords?.lon ?? null, url };
    } catch (error) {
      this.logger.warn(`resolve failed for "${url}": ${String(error)}`);
      // Even if the network call fails, the original text may already contain coordinates.
      const coords = parseCoords(url);
      return { name: parseName(url), lat: coords?.lat ?? null, lon: coords?.lon ?? null, url };
    }
  }
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function safeUrlParam(url: string, key: string): string | null {
  try {
    return new URL(url).searchParams.get(key);
  } catch {
    return null;
  }
}

function isValidCoord(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

function parseCoords(source: string): { lat: number; lon: number } | null {
  const decoded = safeDecode(source);
  // Order matters: `@lat,lng` and the `!3d..!4d..` place marker are the authoritative ones; the
  // query-param and bare `/lat,lng/` forms are looser and tried last.
  const patterns: RegExp[] = [
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query|ll|sll|destination|center|daddr)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /\/(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      if (isValidCoord(lat, lon)) return { lat, lon };
    }
  }
  return null;
}

function looksLikeCoords(value: string): boolean {
  return /^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/.test(value.trim());
}

function cleanName(value: string): string | null {
  const name = safeDecode(value).replace(/\s+/g, ' ').trim();
  return name.length ? name : null;
}

function parseName(source: string): string | null {
  const decoded = safeDecode(source);
  const place = decoded.match(/\/maps\/place\/([^/@]+)/);
  if (place) {
    const name = cleanName(place[1]);
    if (name && !looksLikeCoords(name)) return name;
  }
  const query = decoded.match(/[?&](?:q|query|destination|daddr)=([^&]+)/);
  if (query) {
    const name = cleanName(query[1]);
    if (name && !looksLikeCoords(name)) return name;
  }
  return null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"');
}

function parseNameFromHtml(html: string): string | null {
  const og = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
  );
  if (og) {
    const name = decodeEntities(og[1]).trim();
    if (name) return name;
  }
  const title = html.match(/<title>([^<]+)<\/title>/i);
  if (title) {
    const name = decodeEntities(title[1])
      .replace(/\s*[-–]\s*Google Maps.*$/i, '')
      .trim();
    if (name) return name;
  }
  return null;
}
