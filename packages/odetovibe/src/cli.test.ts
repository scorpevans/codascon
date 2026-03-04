/**
 * @codascon/odetovibe — CLI Tests
 *
 * Covers:
 *   - printUsage: correct positional argument name and description
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { printUsage } from "./cli.js";

describe("printUsage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function capture(): { lines: string[]; output: string } {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => lines.push(String(args[0])));
    printUsage();
    return { lines, output: lines.join("\n") };
  }

  it("uses code_config.yaml as the positional argument name", () => {
    const { output } = capture();
    expect(output).toContain("<code_config.yaml>");
  });

  it("describes the positional argument as the code's YAML-config file", () => {
    const { output } = capture();
    expect(output).toContain("Path to the code's YAML-config file");
  });
});
