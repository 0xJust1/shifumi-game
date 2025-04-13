#!/bin/bash

# Script de déploiement optimisé pour Monad Testnet

echo "🚀 Déploiement optimisé sur Monad Testnet"

# Compilation du contrat
echo "🔧 Compilation du contrat..."
npx hardhat compile

# Déploiement sur Monad Testnet
echo "📦 Déploiement du contrat sur Monad Testnet..."
npx hardhat run scripts/deploy.js --network monadTestnet

# Copie du fichier .env.monad vers .env dans le dossier frontend
echo "⚙️ Configuration du frontend pour Monad Testnet..."
cp frontend/.env.monad frontend/.env

echo "✅ Déploiement terminé!"
echo "🌐 Pour lancer le frontend: cd frontend && npm run dev"
echo ""
echo "⚠️ NOTE: Si vous rencontrez toujours des erreurs 'out of gas', modifiez votre wallet pour augmenter la limite de gaz."
echo "   Metamask: Settings > Advanced > Advanced gas controls > ON"
echo "   Puis lors de la soumission d'une transaction, augmentez manuellement la limite de gaz à 10,000,000." 