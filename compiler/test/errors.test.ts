import { describe, it, expect } from "vitest";
import { AdxError, formatError, adxError, adxFileError } from "../src/errors.js";

describe("formatError", () => {
  it("includes the line for located errors", () => {
    expect(formatError({ file: "structure.adx", line: 5, message: "boom" })).toBe(
      "[ADX] structure.adx:5 - boom",
    );
  });

  it("omits the line for whole-file errors (manifest)", () => {
    expect(
      formatError({ file: "manifest.json", message: 'Missing required field "name"' }),
    ).toBe('[ADX] manifest.json - Missing required field "name"');
  });
});

describe("AdxError", () => {
  it("formats its message and carries location data", () => {
    const err = adxError("structure.adx", 3, "nope");
    expect(err).toBeInstanceOf(AdxError);
    expect(err.message).toBe("[ADX] structure.adx:3 - nope");
    expect(err.file).toBe("structure.adx");
    expect(err.adxLine).toBe(3);
  });

  it("supports line-less construction", () => {
    const err = adxFileError("manifest.json", "bad");
    expect(err.message).toBe("[ADX] manifest.json - bad");
    expect(err.adxLine).toBeUndefined();
  });
});
