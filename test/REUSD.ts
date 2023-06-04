import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { TestREUSD } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"

describe("REUSD", function () {
    let factories: ContractFactories
    let REUSD: TestREUSD
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress

    beforeEach(async function () {
        ; ([owner, user1, user2] = await ethers.getSigners());
        factories = await createContractFactories(owner)
        upgrades.silenceWarnings()
        REUSD = await upgrades.deployProxy(factories.REUSD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: ["Real Estate USD", "REUSD"] }) as TestREUSD
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.REUSD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: ["Real Estate USD", "REUSD"] })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.REUSD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: ["Real Estate USD", "REUSD"] })
        expect(c.address).to.equal(c2.address)
    })

    it("upgrade to same version fails", async function () {
        const c = await upgrades.deployProxy(factories.REUSD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: ["Real Estate USD", "REUSD"] })
        await expect(upgrades.upgradeProxy(c, factories.REUSD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: ["Real Estate USD", "REUSD"] })).to.be.revertedWithCustomError(REUSD, "UpgradeToSameVersion")
    })

    it("initializes as expected", async function () {
        expect(await REUSD.isREUSD()).to.equal(true)
        expect(await REUSD.owner()).to.equal(owner.address)
        expect(await REUSD.isMinter(owner.address)).to.equal(false)
        expect(await REUSD.name()).to.equal("Real Estate USD")
        expect(await REUSD.symbol()).to.equal("REUSD")
        expect(await REUSD.decimals()).to.equal(18)
        expect(await REUSD.totalSupply()).to.equal(0)
        expect(await REUSD.url()).to.equal("https://reup.cash")
    })

    it("MinterOwner functions fail for non-owner", async function() {
        await expect(REUSD.connect(user2).setMinter(user2.address, true)).to.be.revertedWithCustomError(REUSD, "NotMinterOwner")
    })

    it("Minter functions don't work for non-minter", async function() {
        await expect(REUSD.connect(user2).mint(user2.address, 123)).to.be.revertedWithCustomError(REUSD, "NotMinter")
    })

    it("Mint works", async function() {
        await REUSD.connect(owner).setMinter(user2.address, true)
        await REUSD.connect(user2).mint(user2.address, 123)
        expect(await REUSD.balanceOf(user2.address)).to.equal(123)
    })
})