import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { TestREUP } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"

describe("REUP", function () {
    let factories: ContractFactories
    let REUP: TestREUP
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress

    beforeEach(async function () {
        ; ([owner, user1, user2] = await ethers.getSigners());
        factories = await createContractFactories(owner)
        upgrades.silenceWarnings()
        REUP = await upgrades.deployProxy(factories.REUP, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: ["Real Estate Rewards", "REUP"] }) as TestREUP
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.REUP, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: ["Real Estate Rewards", "REUP"] })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.REUP, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: ["Real Estate Rewards", "REUP"] })
        expect(c.address).to.equal(c2.address)
    })

    it("upgrade to same version fails", async function () {
        const c = await upgrades.deployProxy(factories.REUP, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: ["Real Estate Rewards", "REUP"] })
        await expect(upgrades.upgradeProxy(c, factories.REUP, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: ["Real Estate Rewards", "REUP"] })).to.be.revertedWithCustomError(REUP, "UpgradeToSameVersion")
    })

    it("initializes as expected", async function () {
        expect(await REUP.isREUP()).to.equal(true)
        expect(await REUP.owner()).to.equal(owner.address)
        expect(await REUP.isMinter(owner.address)).to.equal(false)
        expect(await REUP.name()).to.equal("Real Estate Rewards")
        expect(await REUP.symbol()).to.equal("REUP")
        expect(await REUP.decimals()).to.equal(18)
        expect(await REUP.totalSupply()).to.equal(0)
        expect(await REUP.url()).to.equal("https://reup.cash")
    })

    it("MinterOwner functions fail for non-owner", async function() {
        await expect(REUP.connect(user2).setMinter(user2.address, true)).to.be.revertedWithCustomError(REUP, "NotMinterOwner")
    })

    it("Minter functions don't work for non-minter", async function() {
        await expect(REUP.connect(user2).mint(user2.address, 123)).to.be.revertedWithCustomError(REUP, "NotMinter")
    })

    it("Mint works", async function() {
        await REUP.connect(owner).setMinter(user2.address, true)
        await REUP.connect(user2).mint(user2.address, 123)
        expect(await REUP.balanceOf(user2.address)).to.equal(123)
    })
})