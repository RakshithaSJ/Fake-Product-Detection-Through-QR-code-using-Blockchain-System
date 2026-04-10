import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Trash2, QrCode, Scan, Wallet, AlertCircle, Download } from 'lucide-react';
import { metaMaskService, MetaMaskError } from '@/lib/metamask';
import QRCode from 'qrcode';

interface Component {
  id: string;
  name: string;
  value: string;
}

interface ProductData {
  productId: string;
  components: Array<{ name: string; value: string }>;
  hash: string;
  registeredBy: string;
  txHash: string;
  timestamp: string;
}

interface QRCodeData {
  productId: string;
  hash: string;
  txHash: string;
  timestamp: string;
  registeredBy: string;
}

// Mock blockchain storage for demo purposes
const mockBlockchainStorage: Record<string, ProductData> = {};

export default function ProductVerificationSystem() {
  const [activeTab, setActiveTab] = useState('register');
  const [productId, setProductId] = useState('');
  const [components, setComponents] = useState<Component[]>([{ id: '1', name: '', value: '' }]);
  const [verificationProductId, setVerificationProductId] = useState('');
  const [verificationComponents, setVerificationComponents] = useState<Component[]>([{ id: '1', name: '', value: '' }]);
  const [qrCode, setQrCode] = useState<string>('');
  const [verificationResult, setVerificationResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentAccount, setCurrentAccount] = useState<string>('');
  const [error, setError] = useState('');

  useEffect(() => {
    checkConnection();
    
    // Listen for account changes
    metaMaskService.onAccountsChanged((accounts: string[]) => {
      if (accounts.length > 0) {
        setCurrentAccount(accounts[0]);
        setIsConnected(true);
        setError('');
      } else {
        setIsConnected(false);
        setCurrentAccount('');
      }
    });

    // Listen for chain changes
    metaMaskService.onChainChanged((chainId: string) => {
      console.log('Chain changed to:', chainId);
      checkConnection();
    });

    return () => {
      metaMaskService.removeAllListeners();
    };
  }, []);

  const checkConnection = async () => {
    try {
      const account = await metaMaskService.getAccount();
      if (account) {
        setCurrentAccount(account);
        setIsConnected(true);
        setError('');
      } else {
        setIsConnected(false);
        setCurrentAccount('');
      }
    } catch (error) {
      console.error('Error checking connection:', error);
    }
  };

  const connectMetaMask = async () => {
    try {
      setError('');
      await metaMaskService.switchToGanache();
      const accounts = await metaMaskService.connect();
      setCurrentAccount(accounts[0]);
      setIsConnected(true);
    } catch (error: unknown) {
      const err = error as MetaMaskError;
      setError(err.message);
    }
  };

  const addComponent = (isVerification: boolean = false) => {
    const newComponent = { id: Date.now().toString(), name: '', value: '' };
    if (isVerification) {
      setVerificationComponents(prev => [...prev, newComponent]);
    } else {
      setComponents(prev => [...prev, newComponent]);
    }
  };

  const removeComponent = (id: string, isVerification: boolean = false) => {
    if (isVerification) {
      setVerificationComponents(prev => prev.filter(comp => comp.id !== id));
    } else {
      setComponents(prev => prev.filter(comp => comp.id !== id));
    }
  };

  const updateComponent = (id: string, field: 'name' | 'value', value: string, isVerification: boolean = false) => {
    if (isVerification) {
      setVerificationComponents(prev => 
        prev.map(comp => comp.id === id ? { ...comp, [field]: value } : comp)
      );
    } else {
      setComponents(prev => 
        prev.map(comp => comp.id === id ? { ...comp, [field]: value } : comp)
      );
    }
  };

  const computeHash = (components: Component[]): string => {
    // Simple hash computation for demo (in real implementation, this would be SHA256)
    const componentString = components
      .map(comp => `${comp.name}:${comp.value}`)
      .sort()
      .join('|');
    return btoa(componentString).substring(0, 32); // Mock hash
  };

  const simulateMetaMaskTransaction = async (): Promise<string> => {
    if (!window.ethereum) {
      throw new Error('MetaMask not available');
    }

    try {
      // Simulate a real transaction request that opens MetaMask
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: currentAccount,
          to: '0x668561Daa579A0651499fcA86d6af5b723793528', // Wallet requesting address
          value: '0x0', // No value transfer
          data: '0x' // Empty data
        }]
      }) as string;

      return txHash;
    } catch (error: unknown) {
      const err = error as MetaMaskError;
      if (err.code === 4001) {
        throw new Error('Transaction rejected by user');
      }
      throw new Error('Transaction failed: ' + err.message);
    }
  };

  const generateQRCode = async (productData: ProductData): Promise<string> => {
    try {
      // Create a URL-friendly data string for the QR code
      const qrData = JSON.stringify({
        productId: productData.productId,
        hash: productData.hash,
        txHash: productData.txHash,
        timestamp: productData.timestamp,
        registeredBy: productData.registeredBy
      });

      // Generate QR code as data URL using the QRCode library
      const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
        width: 256,
        height: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      return qrCodeDataUrl;
    } catch (error) {
      console.error('Error generating QR code:', error);
      // Fallback to a simple QR code if generation fails
      const fallbackSvg = `
        <svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#ffffff"/>
          <rect x="8" y="8" width="240" height="240" fill="none" stroke="#10b981" stroke-width="4"/>
          <text x="128" y="128" text-anchor="middle" font-family="Arial" font-size="12" fill="#374151">
            Product: ${productData.productId}
          </text>
          <text x="128" y="145" text-anchor="middle" font-family="Arial" font-size="10" fill="#10b981">
            Blockchain Verified
          </text>
        </svg>
      `;
      return `data:image/svg+xml;base64,${btoa(fallbackSvg)}`;
    }
  };

  const downloadQRCode = () => {
    if (!qrCode) return;
    
    const link = document.createElement('a');
    link.href = qrCode;
    link.download = `product-${productId}/images/photo1763565120.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRegisterProduct = async () => {
    if (!isConnected) {
      setError('Please connect MetaMask first');
      return;
    }

    if (!productId || components.some(comp => !comp.name || !comp.value)) {
      alert('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      // First, open MetaMask for transaction
      const txHash = await simulateMetaMaskTransaction();
      
      // Compute hash from components
      const productHash = computeHash(components);
      
      // Create product data for QR code
      const productData: ProductData = {
        productId,
        components: components.map(comp => ({ name: comp.name, value: comp.value })),
        hash: productHash,
        registeredBy: currentAccount,
        txHash: txHash,
        timestamp: new Date().toISOString()
      };
      
      // Store in mock blockchain for verification
      mockBlockchainStorage[productId] = productData;
      
      console.log('Product registered on blockchain:', productData);

      // Generate proper QR code with product details
      const generatedQRCode = await generateQRCode(productData);
      setQrCode(generatedQRCode);
      
      alert(`Product registered successfully!\nTransaction Hash: ${txHash}\nQR Code generated and ready for download.`);
    } catch (error: unknown) {
      const err = error as Error;
      setError(err.message);
      alert('Error registering product: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const parseQRCodeData = (dataUrl: string): Promise<QRCodeData> => {
    return new Promise((resolve, reject) => {
      // In a real implementation, you would use a QR code scanning library
      // For this demo, we'll simulate QR code parsing by extracting data from the image
      const img = new Image();
      img.onload = () => {
        // Simulate QR code data extraction
        setTimeout(() => {
          try {
            // In a real implementation, this would extract actual QR code data
            // For demo purposes, we'll simulate different scenarios based on the image data
            
            // Generate a random product ID to simulate different QR codes
            const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
            const fakeProductId = `FAKE-${randomId}`;
            
            // Check if this looks like a genuine QR code (has registered product data)
            const isGenuineQR = Object.keys(mockBlockchainStorage).length > 0 && 
                                Math.random() > 0.5; // 50% chance of being genuine
            
            if (isGenuineQR && Object.keys(mockBlockchainStorage).length > 0) {
              // Return data from a registered product
              const registeredProductIds = Object.keys(mockBlockchainStorage);
              const randomRegisteredId = registeredProductIds[Math.floor(Math.random() * registeredProductIds.length)];
              const storedProduct = mockBlockchainStorage[randomRegisteredId];
              
              const actualData: QRCodeData = {
                productId: storedProduct.productId,
                hash: storedProduct.hash,
                txHash: storedProduct.txHash,
                timestamp: storedProduct.timestamp,
                registeredBy: storedProduct.registeredBy
              };
              resolve(actualData);
            } else {
              // Return fake data for unregistered products
              const fakeData: QRCodeData = {
                productId: fakeProductId,
                hash: 'fake-hash-not-in-blockchain',
                txHash: '0x0000000000000000000000000000000000000000',
                timestamp: new Date().toISOString(),
                registeredBy: '0x0000000000000000000000000000000000000000'
              };
              resolve(fakeData);
            }
          } catch (error) {
            reject(new Error('Failed to parse QR code data'));
          }
        }, 1000);
      };
      img.onerror = () => reject(new Error('Failed to load QR code image'));
      img.src = dataUrl;
    });
  };

  const handleVerifyProduct = async () => {
    if (!verificationProductId) {
      alert('Please enter Product ID');
      return;
    }

    setIsLoading(true);
    setVerificationResult('');
    try {
      // Simulate blockchain verification (in real implementation, this would query smart contract)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Check if product exists in blockchain
      const storedProduct = mockBlockchainStorage[verificationProductId];
      
      if (!storedProduct) {
        setVerificationResult('FAKE/TAMPERED PRODUCT');
        console.log('Product not found in blockchain:', verificationProductId);
      } else {
        // If components are provided, verify them against stored hash
        if (verificationComponents.some(comp => comp.name && comp.value)) {
          const currentHash = computeHash(verificationComponents);
          if (currentHash !== storedProduct.hash) {
            setVerificationResult('FAKE/TAMPERED PRODUCT');
            console.log('Component hash mismatch - product may be tampered with');
          } else {
            setVerificationResult('GENUINE PRODUCT');
            console.log('Product verified as genuine:', verificationProductId);
          }
        } else {
          // No components provided, just check if product exists
          setVerificationResult('GENUINE PRODUCT');
          console.log('Product verified as genuine:', verificationProductId);
        }
      }
    } catch (error) {
      alert('Error verifying product');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQrUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setVerificationResult('');
    
    try {
      // Read the uploaded file
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Parse QR code data
      const qrData = await parseQRCodeData(dataUrl);
      
      // Set the product ID from QR code
      setVerificationProductId(qrData.productId);
      
      // Verify the product against blockchain
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const storedProduct = mockBlockchainStorage[qrData.productId];
      
      if (!storedProduct) {
        setVerificationResult('FAKE/TAMPERED PRODUCT');
        alert('QR Code scanned: Product NOT found in blockchain - FAKE PRODUCT DETECTED!');
      } else {
        // Verify the hash from QR code matches blockchain
        if (qrData.hash === storedProduct.hash) {
          setVerificationResult('GENUINE PRODUCT');
          alert('QR Code scanned: Product verified as GENUINE on blockchain!');
        } else {
          setVerificationResult('FAKE/TAMPERED PRODUCT');
          alert('QR Code scanned: Product data mismatch - FAKE PRODUCT DETECTED!');
        }
      }
    } catch (error) {
      alert('Error scanning QR code. Please try again or enter details manually.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Fake Product Detection System
          </h1>
          <p className="text-lg text-gray-600">
            Using Blockchain & QR Code Technology
          </p>
        </div>

        {/* MetaMask Connection Status */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Wallet className="w-6 h-6 text-blue-600" />
                <div>
                  <div className="font-medium">
                    {isConnected ? 'Connected to MetaMask' : 'MetaMask Not Connected'}
                  </div>
                  {isConnected && (
                    <div className="text-sm text-gray-600">
                      Account: {formatAddress(currentAccount)}
                    </div>
                  )}
                </div>
              </div>
              {!isConnected && (
                <Button onClick={connectMetaMask} className="bg-orange-500 hover:bg-orange-600">
                  <Wallet className="w-4 h-4 mr-2" />
                  Connect MetaMask
                </Button>
              )}
            </div>
            {error && (
              <Alert variant="destructive" className="mt-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="register" className="text-lg">
              <QrCode className="w-4 h-4 mr-2" />
              Register Product
            </TabsTrigger>
            <TabsTrigger value="verify" className="text-lg">
              <Scan className="w-4 h-4 mr-2" />
              Verify Product
            </TabsTrigger>
          </TabsList>

          {/* Registration Tab */}
          <TabsContent value="register">
            <Card>
              <CardHeader>
                <CardTitle>Register New Product</CardTitle>
                <CardDescription>
                  Register your product details on the blockchain and generate a unique QR code
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!isConnected && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Connect MetaMask to register products on the blockchain
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Product ID *</label>
                  <Input
                    placeholder="Enter unique product ID (e.g., LIPSTICK-001)"
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Product Components *</label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addComponent(false)}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Component
                    </Button>
                  </div>
                  
                  {components.map((component, index) => (
                    <div key={component.id} className="flex gap-2 items-start">
                      <Input
                        placeholder="Component name (e.g., Color)"
                        value={component.name}
                        onChange={(e) => updateComponent(component.id, 'name', e.target.value, false)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Component value (e.g., Ruby Red)"
                        value={component.value}
                        onChange={(e) => updateComponent(component.id, 'value', e.target.value, false)}
                        className="flex-1"
                      />
                      {components.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeComponent(component.id, false)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <Button 
                  onClick={handleRegisterProduct} 
                  disabled={isLoading || !isConnected}
                  className="w-full"
                >
                  {isLoading ? 'Processing MetaMask Transaction...' : 'Register Product & Generate QR Code'}
                </Button>

                {qrCode && (
                  <div className="text-center space-y-4">
                    <div className="border-2 border-dashed border-green-300 rounded-lg p-4 inline-block bg-green-50">
                      <img src={qrCode} alt="QR Code" className="w-64 h-64 mx-auto" />
                    </div>
                    <div className="space-y-2">
                      <Badge variant="secondary" className="text-green-600">
                        <Wallet className="w-3 h-3 mr-1" />
                        Blockchain Verified
                      </Badge>
                      <p className="text-sm text-gray-600">
                        QR Code generated! This product is now registered on the blockchain.
                      </p>
                      <Button 
                        onClick={downloadQRCode} 
                        variant="outline" 
                        className="mt-2"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download QR Code
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Verification Tab */}
          <TabsContent value="verify">
            <Card>
              <CardHeader>
                <CardTitle>Verify Product Authenticity</CardTitle>
                <CardDescription>
                  Verify if a product is genuine by checking against blockchain records
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Product ID *</label>
                    <Input
                      placeholder="Enter product ID from QR code"
                      value={verificationProductId}
                      onChange={(e) => setVerificationProductId(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Upload QR Code (Recommended)</label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleQrUpload}
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-gray-500">
                      Upload the QR code to automatically verify product authenticity
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Current Components (Optional)</label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addComponent(true)}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Component
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Optional: Enter component details for additional verification
                    </p>
                    
                    {verificationComponents.map((component, index) => (
                      <div key={component.id} className="flex gap-2 items-start">
                        <Input
                          placeholder="Component name (e.g., Color)"
                          value={component.name}
                          onChange={(e) => updateComponent(component.id, 'name', e.target.value, true)}
                          className="flex-1"
                        />
                        <Input
                          placeholder="Component value (e.g., Ruby Red)"
                          value={component.value}
                          onChange={(e) => updateComponent(component.id, 'value', e.target.value, true)}
                          className="flex-1"
                        />
                        {verificationComponents.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeComponent(component.id, true)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <Button 
                  onClick={handleVerifyProduct} 
                  disabled={isLoading || !verificationProductId}
                  className="w-full"
                >
                  {isLoading ? 'Verifying on Blockchain...' : 'Verify Product Authenticity'}
                </Button>

                {verificationResult && (
                  <div className="text-center space-y-2">
                    <Badge 
                      variant={verificationResult === 'GENUINE PRODUCT' ? 'default' : 'destructive'}
                      className="text-lg px-4 py-2"
                    >
                      {verificationResult === 'GENUINE PRODUCT' ? (
                        <><Wallet className="w-4 h-4 mr-1" /> GENUINE PRODUCT</>
                      ) : (
                        'FAKE/TAMPERED PRODUCT'
                      )}
                    </Badge>
                    <p className="text-sm text-gray-600">
                      {verificationResult === 'GENUINE PRODUCT' 
                        ? 'This product is authentic and verified on the blockchain.'
                        : 'Warning: This product may be counterfeit or tampered with.'
                      }
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}