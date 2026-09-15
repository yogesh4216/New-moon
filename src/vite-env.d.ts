/// <reference types="vite/client" />
import '@midnight-ntwrk/dapp-connector-api';

interface ImportMetaEnv {
  readonly VITE_NETWORK_ID?: string;
  readonly VITE_CONTRACT_ADDRESS?: string;
  readonly VITE_ZK_CONFIG_BASE_URL?: string;
  readonly VITE_INDEXER_URI?: string;
  readonly VITE_INDEXER_WS_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*/managed/contract/index.js';
