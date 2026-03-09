// Configure React act() environment for vitest jsdom
// This removes the "not configured to support act(...)" warnings
// when using React's createRoot and act() in tests.
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
