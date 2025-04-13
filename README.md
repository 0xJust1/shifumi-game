# ShiFUmi - Rock Paper Scissors DApp

A blockchain-based Rock Paper Scissors game with betting tiers, implemented with Solidity, Hardhat, and React.

## Project Structure

- `contracts/`: Contains the Solidity smart contract for the game
- `scripts/`: Contains the deployment script
- `frontend/`: Contains the React frontend application

## Smart Contract Deployment

### Prerequisites

- Node.js and npm installed
- An Ethereum wallet with private key
- Alchemy API key for network access
- Etherscan API key for contract verification

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory based on `.env.example`:
   ```
   PRIVATE_KEY=your_private_key_here
   ALCHEMY_API_KEY=your_alchemy_api_key_here
   ETHERSCAN_API_KEY=your_etherscan_api_key_here
   ```

### Deployment

To deploy to the Sepolia testnet:

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

To deploy to the Ethereum mainnet:

```bash
npx hardhat run scripts/deploy.js --network mainnet
```

The deployment script will:
1. Deploy the contract
2. Write the contract address to the frontend's `.env` file
3. Verify the contract on Etherscan

## Frontend Application

### Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

### Building for Production

```bash
npm run build
```

## Game Features

- 🎮 Rock Paper Scissors gameplay with betting
- 💰 Five betting tiers with different ETH values
- 🏆 Rewards system for winning games
- 📊 Player statistics and leaderboard
- 👑 Admin controls for contract owner

## Game Rules

- Win: Player gets 192% of their bet (92% profit)
- Draw: Player gets 98% of their bet refunded (2% fee)
- Lose: Player loses their bet

## Contract Address

- Sepolia Testnet: TBD
- Ethereum Mainnet: TBD

## License

MIT # shifumi-game
