import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { TestERC20, TestREYIELD } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"

describe("REYIELD", function () {
    let factories: ContractFactories
    let REYIELD: TestREYIELD
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let rewardToken: TestERC20

    beforeEach(async function () {
        ; ([owner, user1, user2] = await ethers.getSigners());
        factories = await createContractFactories(owner)
        rewardToken = await factories.ERC20.deploy()
        upgrades.silenceWarnings()
        REYIELD = await upgrades.deployProxy(factories.REYIELD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address, "Real Estate Yield", "REYIELD"] }) as TestREYIELD
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.REYIELD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address, "Real Estate Yield", "REYIELD"] })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.REYIELD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address, "Real Estate Yield", "REYIELD"] })
        expect(c.address).to.equal(c2.address)
    })

    it("upgrade to same version fails", async function () {
        const c = await upgrades.deployProxy(factories.REYIELD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address, "Real Estate Yield", "REYIELD"] })
        await expect(upgrades.upgradeProxy(c, factories.REYIELD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address, "Real Estate Yield", "REYIELD"] })).to.be.revertedWithCustomError(REYIELD, "UpgradeToSameVersion")
    })

    it("initializes as expected", async function () {
        expect(await REYIELD.isREYIELD()).to.equal(true)
        expect(await REYIELD.owner()).to.equal(owner.address)
        expect(await REYIELD.isMinter(owner.address)).to.equal(false)
        expect(await REYIELD.name()).to.equal("Real Estate Yield")
        expect(await REYIELD.symbol()).to.equal("REYIELD")
        expect(await REYIELD.decimals()).to.equal(18)
        expect(await REYIELD.totalSupply()).to.equal(0)
        expect(await REYIELD.url()).to.equal("https://reup.cash")
        expect(await REYIELD.rewardToken()).to.equal(rewardToken.address)
    })

    it("MinterOwner functions fail for non-owner", async function() {
        await expect(REYIELD.connect(user2).setMinter(user2.address, true)).to.be.revertedWithCustomError(REYIELD, "NotMinterOwner")
    })

    it("Minter functions don't work for non-minter", async function() {
        await expect(REYIELD.connect(user2).mint(user2.address, 123)).to.be.revertedWithCustomError(REYIELD, "NotMinter")
    })

    it("Mint works", async function() {
        await REYIELD.connect(owner).setMinter(user2.address, true)
        await REYIELD.connect(user2).mint(user2.address, 123)
        expect(await REYIELD.balanceOf(user2.address)).to.equal(123)
    })
})