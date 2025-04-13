const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Fonction utilitaire pour attendre
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fonction pour tenter une opération avec retries
async function withRetry(operation, maxRetries = 5, initialDelay = 2000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries}...`);
      return await operation();
    } catch (error) {
      lastError = error;
      if (error.message && error.message.includes("concurrent requests limit")) {
        const delay = initialDelay * Math.pow(2, attempt - 1); // Backoff exponentiel
        console.log(`Rate limit hit. Waiting ${delay/1000} seconds before retry...`);
        await sleep(delay);
      } else {
        throw error; // Si ce n'est pas une erreur de rate limit, on arrête
      }
    }
  }
  throw lastError; // Si on arrive ici, toutes les tentatives ont échoué
}

async function main() {
  console.log(`🚀 Starting deployment on network: ${network.name}`);

  // Récupérer le compte déployeur
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  
  // Afficher le solde avant déploiement
  const deployerBalance = await deployer.getBalance();
  console.log(`Account balance: ${ethers.utils.formatEther(deployerBalance)} ETH`);
  
  // 1. Déployer le contrat RockPaperScissors avec retry
  console.log(`🏗️ Deploying the ShiFUmi (RockPaperScissors) contract...`);
  const RockPaperScissors = await ethers.getContractFactory("RockPaperScissors");
  
  const shifumi = await withRetry(async () => {
    // Ajuster les options de déploiement pour résoudre le problème de gaz
    return await RockPaperScissors.deploy({
      gasLimit: 6000000, // Augmenter la limite de gaz
      gasPrice: ethers.utils.parseUnits("50", "gwei") // Prix fixe (ajuster selon le réseau)
    });
  });
  
  // Attendre la confirmation
  console.log("Waiting for deployment confirmation...");
  await shifumi.deployed();
  console.log(`✅ RockPaperScissors deployed to: ${shifumi.address}`);
  
  // Attendre pour éviter les problèmes de rate limit
  console.log("Waiting 10 seconds to avoid rate limiting...");
  await sleep(10000);
  
  // Vérifier le déploiement
  console.log("Verifying contract settings...");
  const ownerAddress = await withRetry(async () => shifumi.owner());
  console.log(`Contract owner set to: ${ownerAddress}`);
  
  // Vérifier que le contrat est bien déployé
  const isPaused = await withRetry(async () => shifumi.isPaused());
  console.log(`Game initially paused: ${isPaused}`);
  
  console.log("🎮 ShiFUmi is ready to play!");
  
  // Enregistrer l'adresse du contrat pour référence future
  console.log("\n📝 Contract Information:");
  console.log(`- Network: ${network.name}`);
  console.log(`- Contract Address: ${shifumi.address}`);
  console.log(`- Owner: ${ownerAddress}`);

  // Write contract address to a file for the frontend
  const envPath = path.join(__dirname, "../frontend/.env");
  
  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
  }
  
  // Update or add the contract address
  const envLines = envContent.split("\n");
  const addressRegex = /^VITE_CONTRACT_ADDRESS=.*/;
  const addressLine = `VITE_CONTRACT_ADDRESS=${shifumi.address}`;
  
  let updated = false;
  for (let i = 0; i < envLines.length; i++) {
    if (addressRegex.test(envLines[i])) {
      envLines[i] = addressLine;
      updated = true;
      break;
    }
  }
  
  if (!updated) {
    envLines.push(addressLine);
  }

  // Add/update network information
  const networkRegex = /^VITE_NETWORK_NAME=.*/;
  const networkLine = `VITE_NETWORK_NAME=${network.name}`;
  const chainRegex = /^VITE_CHAIN_ID=.*/;
  const chainLine = `VITE_CHAIN_ID=${network.config.chainId}`;

  updated = false;
  for (let i = 0; i < envLines.length; i++) {
    if (networkRegex.test(envLines[i])) {
      envLines[i] = networkLine;
      updated = true;
    }
    if (chainRegex.test(envLines[i])) {
      envLines[i] = chainLine;
    }
  }
  
  if (!updated) {
    envLines.push(networkLine);
    envLines.push(chainLine);
  }
  
  fs.writeFileSync(envPath, envLines.join("\n"));
  console.log(`📝 Contract address and network info written to ${envPath}`);

  // Wait for etherscan to index the transaction
  console.log("⏱️ Waiting for block confirmation...");
  await shifumi.deployTransaction.wait(5);
  
  // Verify the contract on Etherscan/Basescan/etc
  if (network.name !== "hardhat" && network.name !== "localhost") {
    // Déterminer le service d'exploration approprié
    let explorerName = "Etherscan";
    if (network.name === "baseGoerli" || network.name === "baseSepolia") {
      explorerName = "Basescan";
    } else if (network.name === "monadTestnet") {
      explorerName = "Monad Explorer";
    }
    
    console.log(`🔍 Contrat déployé à l'adresse: ${shifumi.address}`);
    
    // Pour Monad Testnet, afficher des instructions manuelles de vérification
    if (network.name === "monadTestnet") {
      console.log("\n⚠️ La vérification automatique sur Monad Testnet n'est pas encore prise en charge");
      console.log("🔍 Pour vérifier manuellement votre contrat:");
      console.log(`  1. Attendez quelques minutes que la transaction soit confirmée`);
      console.log(`  2. Rendez-vous sur https://explorer-testnet.monad.xyz/address/${shifumi.address}`);
      console.log(`  3. Dans l'onglet "Contract", cliquez sur "Verify & Publish"`);
      console.log(`  4. Soumettez le code source du contrat avec les paramètres appropriés`);
    } else {
      // Pour les autres réseaux, essayer la vérification automatique
      console.log(`🔍 Verification du contrat sur ${explorerName}...`);
      try {
        await run("verify:verify", {
          address: shifumi.address,
          constructorArguments: [],
        });
        console.log("✨ Contrat vérifié avec succès");
      } catch (e) {
        console.log("❌ Échec de la vérification du contrat:", e.message);
      }
    }
  } else {
    console.log("🏠 Vérification ignorée sur le réseau local");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }); 