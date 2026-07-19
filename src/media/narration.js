import { createFliteNarrationAdapter } from "./tts.js";
import { createPiperNarrationAdapter, describePiperAvailability } from "./piper-tts.js";

const FLITE_PROVIDER = "ffmpeg-flite";
const PIPER_PROVIDER = "piper";

export async function selectNarrationAdapter({ language, voice, provider, dependencies = {} } = {}) {
  if (provider !== undefined && provider !== null && provider !== "") {
    if (provider === FLITE_PROVIDER) return createFliteNarrationAdapter(dependencies);
    if (provider !== PIPER_PROVIDER) throw new RangeError(`Unknown narration provider: ${String(provider)}`);
  }
  const availability = await describePiperAvailability({
    language,
    voice,
    env: dependencies.env,
    homeDirectory: dependencies.homeDirectory,
    fileExists: dependencies.fileExists
  });
  if (availability.status === "executable") return createPiperNarrationAdapter(dependencies);
  if (provider === PIPER_PROVIDER) {
    throw new RangeError(`Piper narration is not executable: ${availability.status}`);
  }
  return createFliteNarrationAdapter(dependencies);
}
