// Script pour financer le contrat sur Monad Testnet
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    console.error("❌ Veuillez définir CONTRACT_ADDRESS dans le fichier .env");
    process.exit(1);
  }

  const amount = process.env.FUND_AMOUNT || "0.1";
  
  console.log(`�� Ajout de ${amount} MON au contrat ${contractAddress} sur ${network.name}...`);
  
  // Obtenir le contrat
  const Contract = await ethers.getContractFactory("RockPaperScissors");
  const contract = await Contract.attach(contractAddress);
  
  // Ajouter des fonds
  const tx = await contract.addFunds({
    value: ethers.utils.parseEther(amount),
    gasLimit: 1000000, // Limite de gaz explicite
    gasPrice: ethers.utils.parseUnits("50", "gwei") // 50 Gwei
  });
  
  console.log(`📝 Transaction: ${tx.hash}`);
  console.log("⏱️ En attente de confirmation...");
  
  await tx.wait();
  
  console.log("✅ Fonds ajoutés avec succès!");
  
  // Vérifier le solde du contrat
  const balance = await ethers.provider.getBalance(contractAddress);
  console.log(`💰 Solde actuel du contrat: ${ethers.utils.formatEther(balance)} MON`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 