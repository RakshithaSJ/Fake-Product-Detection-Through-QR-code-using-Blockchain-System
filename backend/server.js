const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { Web3 } = require('web3'); // <-- web3@4.x requires this destructuring
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Web3 configuration (update with your Ganache RPC URL)
const web3 = new Web3('HTTP://127.0.0.1:7545');

// Load the contract ABI from the build artifacts
const contractJSON = require('./build/contracts/ProductVerification.json');
const contractABI = contractJSON.abi;

// Get the deployed contract address from the network
const networkId = '5777'; // Ganache default network ID
const deployedNetwork = contractJSON.networks[networkId];

if (!deployedNetwork) {
    console.error('Contract not deployed on network 5777. Please run: truffle migrate --reset');
    process.exit(1);
}

const contractAddress = deployedNetwork.address;
console.log('Using contract at address:', contractAddress);

const contract = new web3.eth.Contract(contractABI, contractAddress);

// Utility function to compute SHA256 hash
function computeFinalHash(components) {
    let combinedHash = crypto.createHash('sha256').update('').digest('hex');
    components.forEach(component => {
        const hash = crypto.createHash('sha256');
        hash.update(combinedHash + component);
        combinedHash = hash.digest('hex');
    });
    return '0x' + combinedHash;
}

// API Routes

// Basic landing endpoint so hitting port 3001 is informative
app.get('/', (req, res) => {
    res.json({
        message: 'Fake Product Detection backend is running',
        health: '/api/health',
        registerProduct: '/api/register-product',
        verifyProduct: '/api/verify-product',
        contractAddress
    });
});

// Generate QR Code for product
app.post('/api/generate-qr', async (req, res) => {
    try {
        const { productId } = req.body;
        if (!productId) {
            return res.status(400).json({ error: 'Product ID is required' });
        }
        const qrCodeData = JSON.stringify({ productId });
        const qrCodeUrl = await QRCode.toDataURL(qrCodeData);
        res.json({ qrCodeUrl, productId });
    } catch (error) {
        console.error('QR Code generation error:', error);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});


// Explicit 404 handler so missing routes respond with JSON instead of generic HTML
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        message: 'Refer to / for available endpoints'
    });
});
// Register product (manufacturer side)
app.post('/api/register-product', async (req, res) => {
    try {
        const { productId, components, manufacturerAddress } = req.body;
        if (!productId || !components || !manufacturerAddress) {
            return res.status(400).json({ error: 'Product ID, components, and manufacturer address are required' });
        }
        
        // Compute final hash from components using smart contract method
        const finalHash = await contract.methods.computeComponentHash(components).call();
        console.log('Computed hash:', finalHash);
        console.log('Registering product:', productId, 'from address:', manufacturerAddress);

        // Get all accounts from Ganache
        const accounts = await web3.eth.getAccounts();
        const fromAddress = accounts[0]; // Use first account for gas

        // Send transaction to register product on blockchain
        try {
            const receipt = await contract.methods
                .registerProduct(productId, finalHash)
                .send({ from: fromAddress, gas: 3000000 });

            console.log('Product registered on blockchain. Transaction:', receipt.transactionHash);

            res.json({
                productId,
                finalHash,
                components,
                transactionHash: receipt.transactionHash,
                blockNumber: receipt.blockNumber,
                message: 'Product successfully registered on blockchain'
            });
        } catch (txError) {
            console.error('Blockchain transaction error:', txError);
            res.status(500).json({ 
                error: 'Failed to register product on blockchain',
                details: txError.message 
            });
        }
    } catch (error) {
        console.error('Product registration error:', error);
        res.status(500).json({ error: 'Failed to register product', details: error.message });
    }
});

// Verify product (customer side)
app.post('/api/verify-product', async (req, res) => {
    try {
        const { productId, components } = req.body;
        if (!productId || !components) {
            return res.status(400).json({ error: 'Product ID and components are required' });
        }
        
        // Compute hash from provided components using smart contract method
        const computedHash = await contract.methods.computeComponentHash(components).call();
        console.log('Computed hash for verification:', computedHash);

        // Verify product on blockchain
        try {
            const isGenuine = await contract.methods.verifyProduct(productId, computedHash).call();
            console.log('Verification result for', productId, ':', isGenuine);

            // Get product details if genuine
            let productDetails = null;
            if (isGenuine) {
                try {
                    productDetails = await contract.methods.getProduct(productId).call();
                } catch (err) {
                    console.log('Could not fetch product details:', err.message);
                }
            }

            res.json({
                productId,
                computedHash,
                isGenuine,
                productDetails,
                message: isGenuine ? 'GENUINE PRODUCT' : 'FAKE/TAMPERED PRODUCT'
            });
        } catch (verifyError) {
            console.error('Blockchain verification error:', verifyError);
            res.status(500).json({ 
                error: 'Failed to verify product on blockchain',
                details: verifyError.message 
            });
        }
    } catch (error) {
        console.error('Product verification error:', error);
        res.status(500).json({ error: 'Failed to verify product', details: error.message });
    }
});

// Get product info from blockchain
app.get('/api/product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        
        // Get product from blockchain
        try {
            const product = await contract.methods.getProduct(productId).call();
            
            // Check if product exists (timestamp will be 0 if not found)
            if (product.timestamp === '0') {
                return res.status(404).json({ 
                    error: 'Product not found',
                    productId,
                    exists: false 
                });
            }

            res.json({
                productId: product.productId,
                finalHash: product.finalHash,
                manufacturer: product.manufacturer,
                timestamp: product.timestamp,
                exists: true,
                message: 'Product information retrieved from blockchain'
            });
        } catch (getError) {
            console.error('Blockchain get product error:', getError);
            res.status(500).json({ 
                error: 'Failed to get product from blockchain',
                details: getError.message 
            });
        }
    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({ error: 'Failed to get product information', details: error.message });
    }
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        // Test Web3 connection
        const isConnected = await web3.eth.net.isListening();
        const accounts = await web3.eth.getAccounts();
        const networkId = await web3.eth.net.getId();
        
        res.json({ 
            status: 'Backend server is running', 
            timestamp: new Date().toISOString(),
            blockchain: {
                connected: isConnected,
                networkId: networkId.toString(),
                accountsAvailable: accounts.length,
                contractAddress: contractAddress
            }
        });
    } catch (error) {
        res.json({ 
            status: 'Backend server is running (blockchain connection issue)', 
            timestamp: new Date().toISOString(),
            blockchain: {
                connected: false,
                error: error.message
            }
        });
    }
});

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
    console.log('Make sure Ganache is running on http://localhost:7545');
});
