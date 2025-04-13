# ShiFUmi - Rock Paper Scissors Game

A modern and elegant Rock Paper Scissors blockchain game built with React, wagmi, RainbowKit, Framer Motion, and TailwindCSS.

## Features

- 🎮 **Interactive Game Interface**
  - Animated Rock/Paper/Scissors buttons
  - Tiered betting system
  - Real-time result animations
  - Cooldown timer display

- 📦 **Player Management**
  - Wallet connection via RainbowKit
  - Pending rewards management
  - Individual and batch reward claiming
  - Player statistics

- 🏆 **Leaderboard**
  - Top players ranking
  - Animated with Framer Motion

- ⚙️ **Admin Panel**
  - Withdraw creator fees
  - Pause/unpause the game
  - View game metrics

## Technology Stack

- **React** with TypeScript
- **wagmi** for Ethereum interactions
- **RainbowKit** for wallet connection
- **Framer Motion** for animations
- **TailwindCSS** for styling
- **Vite** for fast development

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on the `.env.example` file
4. Run the development server:
   ```bash
   npm run dev
   ```

## Environment Variables

- `VITE_CONTRACT_ADDRESS`: The ShiFUmi contract address
- `VITE_ALCHEMY_ID`: Your Alchemy API key
- `VITE_WALLETCONNECT_PROJECT_ID`: Your WalletConnect Project ID

## Contract Interface

The frontend interacts with the ShiFUmi smart contract, which implements the following core functionalities:

- Game play mechanics (Rock, Paper, Scissors)
- Tiered betting system
- Reward distribution and claiming
- Admin controls

## License

MIT
