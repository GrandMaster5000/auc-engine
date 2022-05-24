import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect, use } from "chai";
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";

// eslint-disable-next-line node/no-missing-import
import type { AucEngine as AucEngineType } from "../typechain/AucEngine";
use(solidity);

describe("AucEngine", function () {
  let owner: SignerWithAddress;
  let seller: SignerWithAddress;
  let buyer: SignerWithAddress;
  let auct: AucEngineType;

  beforeEach(async function () {
    [owner, seller, buyer] = await ethers.getSigners();

    const AucEngine = await ethers.getContractFactory("AucEngine", owner);
    auct = (await AucEngine.deploy()) as AucEngineType;
    await auct.deployed();
  });

  it("sets owner", async () => {
    const currentOwner = await auct.owner();

    expect(currentOwner).to.eq(owner.address);
  });

  async function getTimestamp(blockNumber: number) {
    return await (
      await ethers.provider.getBlock(blockNumber)
    ).timestamp;
  }

  describe("createAuction", () => {
    it("creates auction correctly", async () => {
      const duration = 60;
      const tx = await auct.createAuction(
        ethers.utils.parseEther("0.0001"),
        3,
        "my leg",
        duration
      );
      await tx.wait();

      const cAuction = await auct.auctions(0);
      expect(cAuction.item).to.eq("my leg");
      const ts = await getTimestamp(tx.blockNumber ?? 0);
      expect(cAuction.endsAt).to.eq(ts + duration);
    });
  });

  function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  describe("buy", () => {
    it("allows to buy", async () => {
      const tx = await auct
        .connect(seller)
        .createAuction(ethers.utils.parseEther("0.0001"), 3, "my leg", 60);
      await tx.wait();

      this.timeout(5000);
      await delay(1000);

      const buyTx = await auct
        .connect(buyer)
        .buy(0, { value: ethers.utils.parseEther("0.0001") });

      const cAuction = await auct.auctions(0);
      const finalPrice = cAuction.finalPrice;
      await expect(() => buyTx).to.changeEtherBalance(
        seller,
        Math.floor(finalPrice.sub(finalPrice.mul(10).div(100)).toNumber())
      );

      await expect(buyTx)
        .to.emit(auct, "AuctionEnded")
        .withArgs(0, finalPrice, buyer.address);

      await expect(
        auct.connect(buyer).buy(0, { value: ethers.utils.parseEther("0.0001") })
      ).to.be.revertedWith("stopped!");

      const contractBalance = (
        await ethers.provider.getBalance(auct.address)
      ).toNumber();
      const txW = await auct.withdrawTo(owner.address);
      txW.wait();

      await expect(() => txW).to.changeEtherBalance(owner, contractBalance);
    });
  });
});
