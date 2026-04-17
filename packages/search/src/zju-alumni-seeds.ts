export const ZJU_MANUAL_SEED_TAG = "zju_manual_seed";

const BONJOUR_ZJU_ALUMNI_HANDLES = new Set([
  "8py49s", // 朱奕霏Clara
  "t4g2kf", // 殷杏 Bylix
  "hzljf5", // Skylar
  "pcp5dt", // 胜利女神doro-抓青蛙
  "5ztbk6", // Elliottt！
  "zxhq0c", // Aura
]);

export interface SearchSourceHint {
  source: string;
  handle?: string;
  canonicalUrl?: string;
}

export function isKnownZjuAlumniSeed(sourceHints: SearchSourceHint[]): boolean {
  return sourceHints.some((hint) => {
    return hint.source.toLowerCase() === "bonjour"
      && typeof hint.handle === "string"
      && BONJOUR_ZJU_ALUMNI_HANDLES.has(hint.handle.toLowerCase());
  });
}
