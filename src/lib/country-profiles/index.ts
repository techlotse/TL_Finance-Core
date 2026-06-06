import { genericProfile } from "./generic";
import { swissProfile } from "./swiss";
import type { CountryProfile } from "./types";

export * from "./types";
export { swissProfile, genericProfile };

const PROFILES: Record<string, CountryProfile> = {
  swiss: swissProfile,
  generic: genericProfile
};

/** Resolve a profile by key, defaulting to Swiss (the shipped preset). */
export function getCountryProfile(key?: string | null): CountryProfile {
  if (key && PROFILES[key]) return PROFILES[key];
  return swissProfile;
}
