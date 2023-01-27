import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { ERC20, TestDummyGauge, TestDummyStableswap, TestMinter, TestRECurveMintedRewards, TestREWardSplitter, TestREYIELD } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"
import { BigNumber } from "ethers"
import getPermitSignature from "./helpers/getPermitSignature"
const { constants } = ethers

type SplitType = {
    selfStakingERC20Amount: BigNumber
    gaugeAmounts: BigNumber[]
}

describe("REWardSplitter", function () {
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let factories: ContractFactories
    let rewardToken: ERC20
    let REWardSplitter: TestREWardSplitter
    let REYIELD: TestREYIELD
    let RECurveMintedRewards: TestRECurveMintedRewards
    let dummyStableswap: TestDummyStableswap
    let dummyGauge: TestDummyGauge

    beforeEach(async function () {
        ; ([owner, user1] = await ethers.getSigners());
        factories = createContractFactories(owner)
        rewardToken = await factories.ERC20.deploy()
        upgrades.silenceWarnings()
        REYIELD = await upgrades.deployProxy(factories.REYIELD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address, "Real Estate Yield", "REYIELD"] }) as TestREYIELD
        dummyStableswap = await factories.DummyStableswap.deploy(REYIELD.address, rewardToken.address)
        dummyGauge = await factories.DummyGauge.deploy(dummyStableswap.address)
        RECurveMintedRewards = await upgrades.deployProxy(factories.RECurveMintedRewards, [], { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [REYIELD.address, dummyGauge.address] }) as TestRECurveMintedRewards
        await REYIELD.connect(owner).setMinter(RECurveMintedRewards.address, true)
        REWardSplitter = await upgrades.deployProxy(factories.REWardSplitter, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [] }) as TestREWardSplitter
        await REYIELD.connect(owner).setRewardManager(REWardSplitter.address, true)
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.REWardSplitter, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [] })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.REWardSplitter, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [] })
        expect(c.address).to.equal(c2.address)
    })

    it("upgrade to same version fails", async function () {
        const c = await upgrades.deployProxy(factories.REWardSplitter, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [] })
        await expect(upgrades.upgradeProxy(c, factories.REWardSplitter, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [] })).to.be.revertedWithCustomError(REWardSplitter, "UpgradeToSameVersion")
    })

    it("initialized as expected", async function () {
        expect(await REWardSplitter.isREWardSplitter()).to.equal(true)
    })

    it("owner functions fail for non-owner", async function () {
        await expect(REWardSplitter.connect(user1).addReward(0, REYIELD.address, [dummyGauge.address])).to.be.revertedWithCustomError(REWardSplitter, "NotOwner")
        await expect(REWardSplitter.connect(user1).approve(rewardToken.address, [dummyGauge.address])).to.be.revertedWithCustomError(REWardSplitter, "NotOwner")
    })

    it("approve works", async function () {
        await REWardSplitter.connect(owner).approve(rewardToken.address, [dummyGauge.address, user1.address, owner.address])
        expect(await rewardToken.allowance(REWardSplitter.address, dummyGauge.address)).to.equal(constants.MaxUint256)
        expect(await rewardToken.allowance(REWardSplitter.address, user1.address)).to.equal(constants.MaxUint256)
        expect(await rewardToken.allowance(REWardSplitter.address, owner.address)).to.equal(constants.MaxUint256)
    })

    it("splitRewards(0, ..., [])", async function () {
        const { selfStakingERC20Amount, gaugeAmounts } = await REWardSplitter.splitRewards(0, REYIELD.address, []) as SplitType
        expect(selfStakingERC20Amount).to.equal(0)
        expect(gaugeAmounts.length).to.equal(0)
    })

    it("splitRewards(10000, ..., [])", async function () {
        const { selfStakingERC20Amount, gaugeAmounts } = await REWardSplitter.splitRewards(10000, REYIELD.address, []) as SplitType
        expect(selfStakingERC20Amount).to.equal(10000)
        expect(gaugeAmounts.length).to.equal(0)
    })

    it("splitRewards(0, ..., [gauge]) fails if gauge not excluded", async function () {
        await expect(REWardSplitter.splitRewards(0, REYIELD.address, [dummyGauge.address])).to.be.revertedWithCustomError(REWardSplitter, "GaugeNotExcluded")
    })

    it("addReward(0, ..., []) does nothing", async function () {
        await REWardSplitter.connect(owner).addReward(0, REYIELD.address, [])
    })

    it("addReward(0, ..., []) fails if gauge not excluded", async function () {
        await expect(REWardSplitter.connect(owner).addReward(0, REYIELD.address, [dummyGauge.address])).to.be.revertedWithCustomError(REWardSplitter, "GaugeNotExcluded")
    })

    describe("gauge excluded", function () {
        beforeEach(async function () {
            await REYIELD.setExcluded(dummyGauge.address, true)
        })

        it("splitRewards(0, ..., [gauge])", async function () {
            const { selfStakingERC20Amount, gaugeAmounts } = await REWardSplitter.splitRewards(0, REYIELD.address, [dummyGauge.address]) as SplitType
            expect(selfStakingERC20Amount).to.equal(0)
            expect(gaugeAmounts.length).to.equal(1)
            expect(gaugeAmounts[0]).to.equal(0)
        })

        it("splitRewards(10000, ..., [gauge]) when no supply", async function () {
            const { selfStakingERC20Amount, gaugeAmounts } = await REWardSplitter.splitRewards(10000, REYIELD.address, [dummyGauge.address]) as SplitType
            expect(selfStakingERC20Amount).to.equal(10000)
            expect(gaugeAmounts.length).to.equal(1)
            expect(gaugeAmounts[0]).to.equal(0)
        })

        describe("10000 supply exists", function () {
            beforeEach(async function () {
                await REYIELD.connect(owner).setMinter(owner.address, true)
                await REYIELD.connect(owner).mint(user1.address, 10000)
            })

            it("splitRewards(10000, ..., [gauge]) when no supply on gauge", async function () {
                const { selfStakingERC20Amount, gaugeAmounts } = await REWardSplitter.splitRewards(10000, REYIELD.address, [dummyGauge.address]) as SplitType
                expect(selfStakingERC20Amount).to.equal(10000)
                expect(gaugeAmounts.length).to.equal(1)
                expect(gaugeAmounts[0]).to.equal(0)
            })

            it("addRewards(10000, ..., [gauge]) works", async function () {
                await REWardSplitter.connect(owner).approve(rewardToken.address, [dummyGauge.address, REYIELD.address])
                await rewardToken.connect(owner).approve(REWardSplitter.address, constants.MaxUint256)
                await REWardSplitter.connect(owner).addReward(10000, REYIELD.address, [dummyGauge.address])
                expect(await rewardToken.balanceOf(REYIELD.address)).to.equal(10000)
                expect(await rewardToken.balanceOf(dummyGauge.address)).to.equal(0)
            })

            describe("10000 supply also on gauge", function () {
                beforeEach(async function () {
                    await REYIELD.connect(owner).mint(dummyGauge.address, 10000)
                })

                it("splitRewards(10000, ..., [gauge]) when 10000 supply on gauge", async function () {
                    const { selfStakingERC20Amount, gaugeAmounts } = await REWardSplitter.splitRewards(10000, REYIELD.address, [dummyGauge.address]) as SplitType
                    expect(selfStakingERC20Amount).to.equal(5000)
                    expect(gaugeAmounts.length).to.equal(1)
                    expect(gaugeAmounts[0]).to.equal(5000)
                })

                it("addRewards(10000, ..., [gauge]) fails without approval", async function () {
                    await expect(REWardSplitter.connect(owner).addReward(10000, REYIELD.address, [dummyGauge.address])).to.be.revertedWith("ERC20: insufficient allowance")
                })

                it("addRewards(10000, ..., [gauge]) works", async function () {
                    await REWardSplitter.connect(owner).approve(rewardToken.address, [dummyGauge.address, REYIELD.address])
                    await rewardToken.connect(owner).approve(REWardSplitter.address, constants.MaxUint256)
                    await REWardSplitter.connect(owner).addReward(10000, REYIELD.address, [dummyGauge.address])
                    expect(await rewardToken.balanceOf(REYIELD.address)).to.equal(5000)
                    expect(await rewardToken.balanceOf(dummyGauge.address)).to.equal(5000)
                })

                it("addRewardsPermit(10000, ..., [gauge]) works", async function () {
                    await REWardSplitter.connect(owner).approve(rewardToken.address, [dummyGauge.address, REYIELD.address])
                    const { v, r, s } = await getPermitSignature(rewardToken, owner, REWardSplitter.address, constants.MaxUint256, 2e9)
                    await REWardSplitter.connect(owner).addRewardPermit(10000, REYIELD.address, [dummyGauge.address], constants.MaxUint256, 2e9, v, r, s)
                    expect(await rewardToken.balanceOf(REYIELD.address)).to.equal(5000)
                    expect(await rewardToken.balanceOf(dummyGauge.address)).to.equal(5000)
                })

                it("addRewardsPermit(10000, ..., [gauge]) fails for non-owner", async function () {
                    const { v, r, s } = await getPermitSignature(rewardToken, user1, REWardSplitter.address, constants.MaxUint256, 2e9)
                    await expect(REWardSplitter.connect(user1).addRewardPermit(10000, REYIELD.address, [dummyGauge.address], constants.MaxUint256, 2e9, v, r, s)).to.be.revertedWithCustomError(REWardSplitter, "NotOwner")
                })
            })
        })
    })
})