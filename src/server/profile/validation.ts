import { z } from "zod";

const MAX_GRADUATION_YEAR =
  new Date().getUTCFullYear() + 10;

function optionalText(maxLength: number) {
  return z
    .preprocess(
      (value) =>
        typeof value === "string"
          ? value.trim()
          : value,
      z.union([
        z.string().max(maxLength),
        z.null(),
        z.undefined(),
      ]),
    )
    .transform((value) => {
      if (
        typeof value !== "string" ||
        value.length === 0
      ) {
        return null;
      }

      return value;
    });
}

const graduationYearSchema = z.preprocess(
  (value) => {
    if (
      value === "" ||
      value === null ||
      value === undefined
    ) {
      return null;
    }

    if (typeof value === "string") {
      return Number(value);
    }

    return value;
  },
  z.union([
    z
      .number()
      .int()
      .min(1950)
      .max(MAX_GRADUATION_YEAR),
    z.null(),
  ]),
);

export const profileUpdateSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2)
    .max(80),

  program: optionalText(120),

  graduationYear: graduationYearSchema,

  bio: optionalText(1000),
});

export type ProfileUpdateInput =
  z.infer<typeof profileUpdateSchema>;
