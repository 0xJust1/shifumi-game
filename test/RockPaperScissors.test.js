const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RockPaperScissors", function () {
  let rockPaperScissors;
  let owner;
  let addr1;
  let addr2;
  
  // Enum values
  const Move = {
    Rock: 0,
    Paper: 1,
    Scissors: 2
  };
  
  const BetTier = {
    TIER_1: 0,
    TIER_2: 1,
    TIER_3: 2,
    TIER_4: 3,
    TIER_5: 4
  };
  
  // Expected tier amounts
  const tierAmounts = {
    [BetTier.TIER_1]: ethers.utils.parseEther("0.005"),
    [BetTier.TIER_2]: ethers.utils.parseEther("0.01"),
    [BetTier.TIER_3]: ethers.utils.parseEther("0.025"),
    [BetTier.TIER_4]: ethers.utils.parseEther("0.05"),
    [BetTier.TIER_5]: ethers.utils.parseEther("0.1")
  };

  beforeEach(async function () {
    // Get signers
    [owner, addr1, addr2] = await ethers.getSigners();
    
    // Deploy contract
    const RockPaperScissors = await ethers.getContractFactory("RockPaperScissors");
    rockPaperScissors = await RockPaperScissors.deploy();
    await rockPaperScissors.deployed();
    
    // Add some funds to the contract for tests
    await owner.sendTransaction({
      to: rockPaperScissors.address,
      value: ethers.utils.parseEther("10")
    });
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await rockPaperScissors.owner()).to.equal(owner.address);
    });

    it("Should initialize tier amounts correctly", async function () {
      for (const tier in BetTier) {
        const amount = await rockPaperScissors.tierToAmount(BetTier[tier]);
        expect(amount).to.equal(tierAmounts[BetTier[tier]]);
      }
    });
  });

  describe("Game mechanics", function () {
    it("Should allow playing a game with correct bet amount", async function () {
      const tier = BetTier.TIER_1;
      const move = Move.Rock;
      const betAmount = await rockPaperScissors.tierToAmount(tier);
      
      // Play the game
      await expect(rockPaperScissors.connect(addr1).play(tier, move, {
        value: betAmount
      }))
        .to.emit(rockPaperScissors, "GamePlayed")
        .withArgs(addr1.address, move, ethers.utils.isAddress, ethers.utils.isString, ethers.utils.isBigNumber);
    });

    it("Should reject playing with incorrect bet amount", async function () {
      const tier = BetTier.TIER_1;
      const move = Move.Rock;
      const betAmount = await rockPaperScissors.tierToAmount(tier);
      
      // Play with incorrect amount
      await expect(
        rockPaperScissors.connect(addr1).play(tier, move, {
          value: betAmount.add(1) // Wrong amount
        })
      ).to.be.revertedWith("Incorrect ETH amount sent");
    });

    it("Should enforce cooldown period", async function () {
      const tier = BetTier.TIER_1;
      const move = Move.Rock;
      const betAmount = await rockPaperScissors.tierToAmount(tier);
      
      // Play first game
      await rockPaperScissors.connect(addr1).play(tier, move, {
        value: betAmount
      });
      
      // Try to play again immediately
      await expect(
        rockPaperScissors.connect(addr1).play(tier, move, {
          value: betAmount
        })
      ).to.be.revertedWith("Wait before playing again");
    });
  });

  describe("Admin functions", function () {
    it("Should allow owner to withdraw creator fees", async function () {
      // Play a game to generate some fees
      const tier = BetTier.TIER_1;
      const move = Move.Rock;
      const betAmount = await rockPaperScissors.tierToAmount(tier);
      
      await rockPaperScissors.connect(addr1).play(tier, move, {
        value: betAmount
      });
      
      // Check that there are some fees
      const fees = await rockPaperScissors.creatorFees();
      expect(fees).to.be.gt(0);
      
      // Withdraw fees
      await expect(
        rockPaperScissors.connect(owner).withdrawCreatorFees()
      ).to.emit(rockPaperScissors, "CreatorFeesWithdrawn");
      
      // Check that fees were reset
      expect(await rockPaperScissors.creatorFees()).to.equal(0);
    });

    it("Should prevent non-owners from withdrawing fees", async function () {
      await expect(
        rockPaperScissors.connect(addr1).withdrawCreatorFees()
      ).to.be.revertedWith("Not owner");
    });

    it("Should allow owner to pause the game", async function () {
      // Pause the game
      await rockPaperScissors.connect(owner).setPaused(true);
      expect(await rockPaperScissors.isPaused()).to.equal(true);
      
      // Try to play while paused
      const tier = BetTier.TIER_1;
      const move = Move.Rock;
      const betAmount = await rockPaperScissors.tierToAmount(tier);
      
      await expect(
        rockPaperScissors.connect(addr1).play(tier, move, {
          value: betAmount
        })
      ).to.be.revertedWith("Game is paused");
      
      // Unpause
      await rockPaperScissors.connect(owner).setPaused(false);
      expect(await rockPaperScissors.isPaused()).to.equal(false);
    });
  });
}); 