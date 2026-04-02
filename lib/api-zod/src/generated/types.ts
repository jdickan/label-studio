import { z } from "zod";

export const HealthCheckResponse = z.object({
  status: z.string(),
  timestamp: z.string().optional(),
});

export type HealthCheckResponseType = z.infer<typeof HealthCheckResponse>;
