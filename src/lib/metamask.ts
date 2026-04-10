// MetaMask integration utilities
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeAllListeners: (event: string) => void;
    };
  }
}

export interface MetaMaskError {
  code: number;
  message: string;
}

export class MetaMaskService {
  private static instance: MetaMaskService;
  private accounts: string[] = [];

  private constructor() {}

  public static getInstance(): MetaMaskService {
    if (!MetaMaskService.instance) {
      MetaMaskService.instance = new MetaMaskService();
    }
    return MetaMaskService.instance;
  }

  // Check if MetaMask is installed
  public isMetaMaskInstalled(): boolean {
    return typeof window.ethereum !== 'undefined';
  }

  // Connect to MetaMask and get accounts
  public async connect(): Promise<string[]> {
    if (!this.isMetaMaskInstalled()) {
      throw new Error('MetaMask is not installed. Please install MetaMask to use this feature.');
    }

    try {
      // Request account access
      this.accounts = await window.ethereum!.request({
        method: 'eth_requestAccounts',
      }) as string[];

      return this.accounts;
    } catch (error: unknown) {
      const err = error as MetaMaskError;
      if (err.code === 4001) {
        throw new Error('Please connect to MetaMask to continue.');
      } else {
        throw new Error('Failed to connect to MetaMask: ' + err.message);
      }
    }
  }

  // Get current connected account
  public async getAccount(): Promise<string | null> {
    if (!this.isMetaMaskInstalled()) {
      return null;
    }

    try {
      const accounts = await window.ethereum!.request({
        method: 'eth_accounts',
      }) as string[];
      return accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      console.error('Error getting account:', error);
      return null;
    }
  }

  // Get network ID
  public async getNetworkId(): Promise<number> {
    if (!this.isMetaMaskInstalled()) {
      throw new Error('MetaMask is not installed');
    }

    try {
      const chainId = await window.ethereum!.request({
        method: 'eth_chainId',
      }) as string;
      return parseInt(chainId, 16);
    } catch (error) {
      throw new Error('Failed to get network ID');
    }
  }

  // Switch to Ganache network (1337)
  public async switchToGanache(): Promise<void> {
    if (!this.isMetaMaskInstalled()) {
      throw new Error('MetaMask is not installed');
    }

    try {
      await window.ethereum!.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x539' }], // 1337 in hex
      });
    } catch (switchError: unknown) {
      const err = switchError as MetaMaskError;
      // This error code indicates that the chain has not been added to MetaMask
      if (err.code === 4902) {
        try {
          await window.ethereum!.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x539',
                chainName: 'Ganache Local',
                rpcUrls: ['http://127.0.0.1:7545'],
                nativeCurrency: {
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                },
                blockExplorerUrls: [],
              },
            ],
          });
        } catch (addError) {
          throw new Error('Failed to add Ganache network to MetaMask');
        }
      } else {
        throw new Error('Failed to switch to Ganache network');
      }
    }
  }

  // Listen for account changes
  public onAccountsChanged(callback: (accounts: string[]) => void): void {
    if (this.isMetaMaskInstalled()) {
      window.ethereum!.on('accountsChanged', callback);
    }
  }

  // Listen for chain changes
  public onChainChanged(callback: (chainId: string) => void): void {
    if (this.isMetaMaskInstalled()) {
      window.ethereum!.on('chainChanged', callback);
    }
  }

  // Remove event listeners
  public removeAllListeners(): void {
    if (this.isMetaMaskInstalled()) {
      window.ethereum!.removeAllListeners('accountsChanged');
      window.ethereum!.removeAllListeners('chainChanged');
    }
  }
}

// Export singleton instance
export const metaMaskService = MetaMaskService.getInstance();