import { z } from 'zod';

/**
 * Native date inputs in the shared TextInput currently emit Date objects,
 * while API-facing form values are represented as strings. Normalize both
 * shapes before applying string validation so the resolver has one output
 * contract.
 */
export const dateStringSchema = (requiredMessage: string) =>
  z.preprocess(
    value => (value instanceof Date ? value.toISOString() : value),
    z
      .string()
      .min(1, requiredMessage)
      .refine(value => !Number.isNaN(new Date(value).getTime()), {
        message: 'Please provide a valid date',
      })
  );
