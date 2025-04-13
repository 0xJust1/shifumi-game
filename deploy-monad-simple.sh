#!/bin/bash

# Script de déploiement ultra-simplifié pour Monad Testnet

echo "🚀 Déploiement ultra-simplifié pour Monad Testnet"

# Compilation du contrat
echo "🔧 Compilation du contrat..."
npx hardhat compile

# Configuration des variables d'environnement pour augmenter les limites de gaz
export HARDHAT_NETWORK="monadTestnet"
export HARDHAT_MAX_GAS=30000000
export HARDHAT_GAS_PRICE=100000000000

# Déploiement sur Monad Testnet
echo "📦 Déploiement du contrat sur Monad Testnet..."
npx hardhat run scripts/deploy.js --network monadTestnet

# Copie du fichier .env.monad vers .env dans le dossier frontend
echo "⚙️ Configuration du frontend pour Monad Testnet..."
cp frontend/.env.monad frontend/.env

echo "✅ Déploiement terminé!"
echo "🌐 Pour lancer le frontend: cd frontend && npm run dev"
echo ""
echo "⚠️ NOTE IMPORTANTE: Sur Monad Testnet"
echo "  1. Pour ajouter des fonds au contrat, utilisez la fonction addFunds() plutôt que d'envoyer des MON directement"
echo "  2. Ne jouez qu'avec le tier 1 (0.005 MON) pour minimiser les risques de out-of-gas"
echo "  3. Dans MetaMask: Settings > Advanced > Advanced gas controls > ON"
echo "     - Puis augmentez la limite de gaz à 15,000,000 au minimum"
echo "     - Réglez le prix du gaz à au moins 50 Gwei"
echo ""
echo "Pour dépanner en cas d'échec, utilisez ces commandes pour financer le contrat:"
echo "npx hardhat --network monadTestnet console"
echo "const Contract = await ethers.getContractFactory(\"RockPaperScissors\");"
echo "const contract = await Contract.attach(\"ADRESSE_DU_CONTRAT\");"
echo "await contract.addFunds({value: ethers.utils.parseEther(\"0.1\")});" 