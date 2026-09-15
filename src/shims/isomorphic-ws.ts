// isomorphic-ws' browser build only has a default export, so the indexer
// provider's `import { WebSocket } from 'isomorphic-ws'` resolves to undefined
// under a bundler. Alias the package to this shim so both shapes work.
const NativeWebSocket = globalThis.WebSocket;
export { NativeWebSocket as WebSocket };
export default NativeWebSocket;
