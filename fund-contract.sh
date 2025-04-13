#!/bin/bash

# Script pour financer le contrat sur Monad Testnet

# Vérifier si l'adresse du contrat est passée en argument
if [ -z "$1" ]; then
  echo "❌ Usage: ./fund-contract.sh <adresse_du_contrat> [montant]"
  exit 1
fi

# Définir l'adresse du contrat
export CONTRACT_ADDRESS=$1

# Définir le montant si fourni
if [ ! -z "$2" ]; then
  export FUND_AMOUNT=$2
else
  export FUND_AMOUNT="0.1"
fi

echo "🚀 Financement du contrat ${CONTRACT_ADDRESS} avec ${FUND_AMOUNT} MON sur Monad Testnet"

# Exécuter le script
npx hardhat run fund-contract-monad.js --network monadTestnet

echo "✅ Terminé!" 