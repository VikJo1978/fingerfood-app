import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// React 18 warns "the current testing environment is not configured to
// support act(...)" unless this flag is set before any component renders.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});
