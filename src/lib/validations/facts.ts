import { z } from "zod";
import { factSchema } from "@/lib/ai/extract-facts";

export const updateFactsBodySchema = z.object({
  data: factSchema,
  fieldStatus: z.record(
    z.string(),
    z.enum(["pending", "approved", "rejected"])
  ),
  confirm: z.boolean().optional(),
});
