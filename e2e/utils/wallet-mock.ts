import { Page } from '@playwright/test';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { CHAIN_CONFIG } from '../fixtures/test-accounts';

interface KeplrKey {
  name: string;
  algo: string;
  pubKey: Uint8Array;
  address: Uint8Array;
  bech32Address: string;
}

export async function mockKeplrWallet(page: Page, mnemonic: string): Promise<string> {
  // Generate the actual address from the mnemonic
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: CHAIN_CONFIG.prefix,
  });
  const [account] = await wallet.getAccounts();
  const bech32Address = account.address;

  // Inject mock Keplr into page
  await page.addInitScript(
    ({ address, chainId }) => {
      const mockKeplr = {
        enable: async (_chainId: string) => {
          console.log('[Mock Keplr] enable called for chain:', _chainId);
        },

        getKey: async (_chainId: string): Promise<KeplrKey> => {
          console.log('[Mock Keplr] getKey called for chain:', _chainId);
          return {
            name: 'Test User',
            algo: 'secp256k1',
            pubKey: new Uint8Array(33),
            address: new Uint8Array(20),
            bech32Address: address,
          };
        },

        getOfflineSigner: (_chainId: string) => {
          console.log('[Mock Keplr] getOfflineSigner called for chain:', _chainId);
          return {
            getAccounts: async () => [
              {
                address: address,
                algo: 'secp256k1',
                pubKey: new Uint8Array(33),
              },
            ],
            signDirect: async (signerAddress: string, signDoc: unknown) => {
              console.log('[Mock Keplr] signDirect called for:', signerAddress);
              // Return a mock signature - actual signing would need the private key
              return {
                signed: signDoc,
                signature: {
                  pub_key: {
                    type: 'tendermint/PubKeySecp256k1',
                    value: 'mock_pubkey',
                  },
                  signature: 'mock_signature',
                },
              };
            },
          };
        },

        getOfflineSignerOnlyAmino: (_chainId: string) => {
          return mockKeplr.getOfflineSigner(_chainId);
        },

        getOfflineSignerAuto: async (_chainId: string) => {
          return mockKeplr.getOfflineSigner(_chainId);
        },

        experimentalSuggestChain: async (chainInfo: unknown) => {
          console.log('[Mock Keplr] experimentalSuggestChain called:', chainInfo);
        },

        signArbitrary: async (_chainId: string, signer: string, data: string) => {
          console.log('[Mock Keplr] signArbitrary called:', signer, data);
          return {
            pub_key: { type: 'tendermint/PubKeySecp256k1', value: 'mock' },
            signature: 'mock_signature',
          };
        },
      };

      // Set both keplr and getOfflineSigner on window
      (window as { keplr?: typeof mockKeplr }).keplr = mockKeplr;

      // Dispatch event to notify app that Keplr is available
      window.dispatchEvent(new Event('keplr_keystorechange'));

      console.log('[Mock Keplr] Injected successfully for address:', address);
    },
    { address: bech32Address, chainId: CHAIN_CONFIG.chainId }
  );

  return bech32Address;
}

// Helper to wait for wallet connection in the UI
export async function waitForWalletConnected(page: Page, expectedAddress: string): Promise<void> {
  // Wait for the address to appear somewhere on the page
  // This selector should match your frontend's wallet display
  await page.waitForFunction(
    (addr) => {
      const truncatedAddr = `${addr.slice(0, 10)}...${addr.slice(-6)}`;
      return document.body.innerText.includes(addr) || document.body.innerText.includes(truncatedAddr);
    },
    expectedAddress,
    { timeout: 10000 }
  );
}

// Helper to connect wallet via UI
export async function connectWalletViaUI(page: Page): Promise<void> {
  // Click the connect wallet button - adjust selector to match your UI
  const connectButton = page.getByRole('button', { name: /connect.*wallet/i });
  if (await connectButton.isVisible()) {
    await connectButton.click();
  }

  // If there's a Keplr option in a modal, click it
  const keplrOption = page.getByText(/keplr/i);
  if (await keplrOption.isVisible({ timeout: 2000 }).catch(() => false)) {
    await keplrOption.click();
  }
}
