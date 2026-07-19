import { createFliteNarrationAdapter } from "./tts.js";
import { createPiperNarrationAdapter, describePiperAvailability } from "./piper-tts.js";
import { createElevenLabsNarrationAdapter, describeElevenLabsAvailability } from "./elevenlabs-tts.js";

const FLITE_PROVIDER = "ffmpeg-flite";
const PIPER_PROVIDER = "piper";
const ELEVENLABS_PROVIDER = "elevenlabs";

export async function selectNarrationAdapter({ language, voice, provider, dependencies = {} } = {}) {
  if (provider !== undefined && provider !== null && provider !== "") {
    if (provider === FLITE_PROVIDER) return createFliteNarrationAdapter(dependencies);
    if (provider === ELEVENLABS_PROVIDER) {
      const availability = describeElevenLabsAvailability({ env: dependencies.env });
      if (availability.status !== "executable") {
        throw new RangeError(`ElevenLabs narration is not executable: ${availability.status}`);
      }
      return createElevenLabsNarrationAdapter(dependencies);
    }
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
