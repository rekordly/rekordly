// lib/validations/waitlist.ts
import { z } from 'zod';

export const waitlistSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name is too long')
    .trim(),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  phoneNumber: z.string().regex(/^0(70|71|80|81|90|91)[0-9]{8}$/, {
    message:
      'Please enter a valid Nigerian phone number (11 digits starting with 070, 071, 080, 081, 090, or 091)',
  }),
});
