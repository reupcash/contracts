import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { TestDummyGauge, TestDummyStableswap, TestRECurveMintedRewards, TestREYIELD } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"
import { lastBlockTimestamp, setBlockTimestamp } from "./helpers/time"


describe("RECurveMintedRewards", function () {
    let minter: TestRECurveMintedRewards
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress
    let REYIELD: TestREYIELD
    let RECurveMintedRewards: TestRECurveMintedRewards
    let factories: ContractFactories
    let dummyGauge: TestDummyGauge
    let dummyStableswap: TestDummyStableswap

    beforeEach(async function () {
        ; ([owner, user1, user2, user3] = await ethers.getSigners());
        factories = await createContractFactories(owner)
        const rewardToken = await factories.ERC20.deploy()
        upgrades.silenceWarnings()
        REYIELD = await upgrades.deployProxy(factories.REYIELD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address, "Real Estate Yield", "REYIELD"] }) as TestREYIELD
        dummyStableswap = await factories.DummyStableswap.deploy(REYIELD.address, rewardToken.address)
        dummyGauge = await factories.DummyGauge.deploy(dummyStableswap.address)
        RECurveMintedRewards = await upgrades.deployProxy(factories.RECurveMintedRewards, [], { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [REYIELD.address, dummyGauge.address] }) as TestRECurveMintedRewards
        await REYIELD.connect(owner).setMinter(RECurveMintedRewards.address, true)
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.RECurveMintedRewards, [], { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [REYIELD.address, dummyGauge.address] })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.RECurveMintedRewards, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [REYIELD.address, dummyGauge.address] })
        expect(c.address).to.equal(c2.address)
    })

    it("upgrade to same version fails", async function () {
        const c = await upgrades.deployProxy(factories.RECurveMintedRewards, [], { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [REYIELD.address, dummyGauge.address] })
        await expect(upgrades.upgradeProxy(c, factories.RECurveMintedRewards, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [REYIELD.address, dummyGauge.address] })).to.be.revertedWithCustomError(RECurveMintedRewards, "UpgradeToSameVersion")
    })

    it("initializes as expected", async function () {
        expect(await RECurveMintedRewards.isRECurveMintedRewards()).to.equal(true)
        expect(await RECurveMintedRewards.owner()).to.equal(owner.address)
        expect(await RECurveMintedRewards.gauge()).to.equal(dummyGauge.address)
        expect(await RECurveMintedRewards.lastRewardTimestamp()).to.equal(0)
        expect(await RECurveMintedRewards.perDay()).to.equal(0)
        expect(await RECurveMintedRewards.perDayPerUnit()).to.equal(0)
    })

    it("reward manager functions fail for non-manager", async function () {
        await expect(RECurveMintedRewards.connect(user1).sendRewards(0)).to.be.revertedWithCustomError(RECurveMintedRewards, "NotRewardManager")
        await expect(RECurveMintedRewards.connect(user1).sendAndSetRewardRate(0, 0, 0)).to.be.revertedWithCustomError(RECurveMintedRewards, "NotRewardManager")
    })

    it("owner functions fail for non-owner", async function () {
        await expect(RECurveMintedRewards.connect(user1).setRewardManager(user1.address, true)).to.be.revertedWithCustomError(RECurveMintedRewards, "NotOwner")
    })

    it("sendAndSetRewardRate works", async function () {
        await RECurveMintedRewards.connect(owner).sendAndSetRewardRate(1, 2, 1234)
        expect(await RECurveMintedRewards.lastRewardTimestamp()).not.to.equal(0)
        expect(await RECurveMintedRewards.perDay()).to.equal(1)
        expect(await RECurveMintedRewards.perDayPerUnit()).to.equal(2)
    })

    it("sendRewards does nothing", async function () {
        await RECurveMintedRewards.connect(owner).sendRewards(1234)
        expect(await REYIELD.balanceOf(dummyGauge.address)).to.equal(0)
    })

    it("setRewardManager works as expected", async function () {
        await RECurveMintedRewards.connect(owner).setRewardManager(user1.address, true)
        expect(await RECurveMintedRewards.isRewardManager(user1.address)).to.equal(true)
        await RECurveMintedRewards.connect(user1).sendRewards(0);
        await RECurveMintedRewards.connect(user1).sendAndSetRewardRate(0, 0, 0);
        await RECurveMintedRewards.connect(owner).setRewardManager(user1.address, false)
        expect(await RECurveMintedRewards.isRewardManager(user1.address)).to.equal(false)
    })

    describe("reward 1 per second, 10 per second per unit", function () {
        beforeEach(async function () {
            await RECurveMintedRewards.connect(owner).sendAndSetRewardRate(86400, 864000, 0)
        })

        it("initialized as expected", async function () {
            expect(await RECurveMintedRewards.lastRewardTimestamp()).not.to.equal(0)
            expect(await RECurveMintedRewards.perDay()).to.equal(86400)
            expect(await RECurveMintedRewards.perDayPerUnit()).to.equal(864000)
        })

        it("sendRewards(0) works", async function () {
            await RECurveMintedRewards.sendRewards(0)
            expect(await REYIELD.balanceOf(dummyGauge.address)).to.equal(1)
        })

        it("sendRewardsTwice(0) works", async function () {
            await RECurveMintedRewards.sendRewardsTwice(0)
            expect(await REYIELD.balanceOf(dummyGauge.address)).to.equal(1)
        })

        it("sendRewards(1) works", async function () {
            await RECurveMintedRewards.sendRewards(1)
            expect(await REYIELD.balanceOf(dummyGauge.address)).to.equal(11)
        })

        it("sendRewardsTwice(1) works", async function () {
            await RECurveMintedRewards.sendRewardsTwice(1)
            expect(await REYIELD.balanceOf(dummyGauge.address)).to.equal(11)
        })

        describe("15 minutes has passed", function () {
            beforeEach(async function () {
                await setBlockTimestamp(await lastBlockTimestamp() + 60 * 15 - 1)
            })

            it("sendRewards(0) works", async function () {
                await RECurveMintedRewards.sendRewards(0)
                expect(await REYIELD.balanceOf(dummyGauge.address)).to.equal(86400 / 4 / 24)
            })

            it("sendRewards(123) works", async function () {
                await RECurveMintedRewards.sendRewards(123)
                expect(await REYIELD.balanceOf(dummyGauge.address)).to.equal(86400 / 4 / 24 + 864000 * 123 / 4 / 24)
            })
        })
    })
})