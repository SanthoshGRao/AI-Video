import { z } from "zod";

export const waveformPatchSchema = z.object({
  waveformData: z.array(z.number().finite()).min(8).max(4096),
});
