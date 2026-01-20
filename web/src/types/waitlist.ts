// types/waitlist.ts
import { z } from 'zod';
import { waitlistSchema } from '@/lib/validations/waitlist';

export type WaitlistType = z.infer<typeof waitlistSchema>;
