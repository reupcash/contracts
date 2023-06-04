import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { TestERC20, TestSelfStakingERC20 } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"
import getPermitSignature from "./helpers/getPermitSignature"
import { nextBlockTimestamp, setBlockTimestamp } from "./helpers/time"
const { utils, constants } = ethers

describe("SelfStakingERC20", function () {
    let erc20: TestSelfStakingERC20
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress
    let user4: SignerWithAddress
    let rewardToken: TestERC20
    let factories: ContractFactories
    let start: number
    let end: number

    beforeEach(async function () {
        ; ([owner, user1, user2, user3, user4] = await ethers.getSigners());
        factories = createContractFactories(owner)
        upgrades.silenceWarnings()
        rewardToken = await factories.ERC20.deploy()
        erc20 = await upgrades.deployProxy(factories.SelfStakingERC20, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address] }) as TestSelfStakingERC20
        await erc20.connect(user1).mint(utils.parseEther("100"))
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.SelfStakingERC20, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address] })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.SelfStakingERC20, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address] })
        expect(c.address).to.equal(c2.address)
    })

    it("upgrade to same version fails", async function () {
        const c = await upgrades.deployProxy(factories.SelfStakingERC20, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address] })
        await expect(upgrades.upgradeProxy(c, factories.SelfStakingERC20, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address] })).to.be.revertedWithCustomError(erc20, "UpgradeToSameVersion")
    })

    it("upgrade with different reward token fails", async function () {
        const c = await upgrades.deployProxy(factories.SelfStakingERC20, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [rewardToken.address] })
        await c.setContractVersion(2e9)
        await expect(upgrades.upgradeProxy(c, factories.SelfStakingERC20, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [user1.address] })).to.be.revertedWithCustomError(erc20, "WrongRewardToken")
    })

    it("upgrade check fails for non-owner", async function() {
        await expect(erc20.connect(user1)._checkUpgrade(erc20.address)).to.be.revertedWithCustomError(erc20, "NotSelfStakingERC20Owner")
    })

    it("init params as expected", async function () {
        expect(await erc20.name()).to.equal("Test Token")
        expect(await erc20.symbol()).to.equal("TST")
        expect(await erc20.decimals()).to.equal(18)
        expect(await erc20.isRERC20()).to.equal(true)
        expect(await erc20.isSelfStakingERC20()).to.equal(true)
        expect(await erc20.totalSupply()).to.equal(utils.parseEther("100"))
        expect(await erc20.balanceOf(user1.address)).to.equal(utils.parseEther("100"))
        expect(await erc20.balanceOf(user2.address)).to.equal(0)
        expect(await erc20.allowance(user1.address, user2.address)).to.equal(0)
        expect(await erc20.allowance(user2.address, user1.address)).to.equal(0)
        expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
        expect(await erc20.isExcluded(user1.address)).to.equal(false)
        expect(await erc20.rewardToken()).to.equal(rewardToken.address)
        expect(await erc20.pendingReward(user1.address)).to.equal(0)
        expect(await erc20.owner()).to.equal(owner.address)
        expect(await erc20.isDelegatedClaimer(user1.address)).to.equal(false)
        expect(await erc20.isRewardManager(user1.address)).to.equal(false)
        const data = await erc20.rewardData()
        expect(data.lastRewardTimestamp).to.equal(0)
        expect(data.startTimestamp).to.equal(0)
        expect(data.endTimestamp).to.equal(0)
        expect(data.amountToDistribute).to.equal(0)
    })

    describe("transfer", function () {
        it("fails with insufficient balance", async function () {
            await expect(erc20.connect(user1).transfer(user2.address, utils.parseEther("1000000001"))).to.be.revertedWithCustomError(erc20, "InsufficientBalance")
        })

        it("transfer(0) works", async function() {
            await erc20.connect(owner).transfer(user1.address, 0)
        })

        it("works as expected", async function () {
            await erc20.connect(user1).transfer(user2.address, utils.parseEther("5"))

            expect(await erc20.totalSupply()).to.equal(utils.parseEther("100"))
            expect(await erc20.balanceOf(user1.address)).to.equal(utils.parseEther("95"))
            expect(await erc20.balanceOf(user2.address)).to.equal(utils.parseEther("5"))
            expect(await erc20.allowance(user1.address, user2.address)).to.equal(0)
            expect(await erc20.allowance(user2.address, user1.address)).to.equal(0)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
            expect(await erc20.pendingReward(user1.address)).to.equal(0)
        })

        it("to address(0) burns", async function () {
            await erc20.connect(user1).transfer(constants.AddressZero, utils.parseEther("5"))

            expect(await erc20.totalSupply()).to.equal(utils.parseEther("95"))
            expect(await erc20.balanceOf(user1.address)).to.equal(utils.parseEther("95"))
            expect(await erc20.balanceOf(constants.AddressZero)).to.equal(0)
            expect(await erc20.allowance(user1.address, user2.address)).to.equal(0)
            expect(await erc20.allowance(user2.address, user1.address)).to.equal(0)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("95"))
            expect(await erc20.pendingReward(user1.address)).to.equal(0)
        })
    })

    it("approve works as expected", async function () {
        await erc20.connect(user1).approve(user2.address, utils.parseEther("5000"))

        expect(await erc20.balanceOf(user1.address)).to.equal(utils.parseEther("100"))
        expect(await erc20.balanceOf(user2.address)).to.equal(0)
        expect(await erc20.allowance(user1.address, user2.address)).to.equal(utils.parseEther("5000"))
        expect(await erc20.allowance(user2.address, user1.address)).to.equal(0)
        expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
        expect(await erc20.pendingReward(user1.address)).to.equal(0)
    })

    describe("transferFrom", function () {
        it("Fails with insufficient approval", async function () {
            await expect(erc20.transferFrom(user1.address, user2.address, 1)).to.be.revertedWithCustomError(erc20, "InsufficientAllowance")
        })

        it("works as expected", async function () {
            await erc20.connect(user1).approve(user2.address, utils.parseEther("5"))
            await erc20.connect(user2).transferFrom(user1.address, user2.address, utils.parseEther("5"))

            expect(await erc20.totalSupply()).to.equal(utils.parseEther("100"))
            expect(await erc20.balanceOf(user1.address)).to.equal(utils.parseEther("95"))
            expect(await erc20.balanceOf(user2.address)).to.equal(utils.parseEther("5"))
            expect(await erc20.allowance(user1.address, user2.address)).to.equal(0)
            expect(await erc20.allowance(user2.address, user1.address)).to.equal(0)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
            expect(await erc20.pendingReward(user1.address)).to.equal(0)
        })

        it("doesn't adjust allowance if allowance is max", async function () {
            await erc20.connect(user1).approve(user2.address, constants.MaxUint256)
            await erc20.connect(user2).transferFrom(user1.address, user2.address, utils.parseEther("5"))

            expect(await erc20.totalSupply()).to.equal(utils.parseEther("100"))
            expect(await erc20.balanceOf(user1.address)).to.equal(utils.parseEther("95"))
            expect(await erc20.balanceOf(user2.address)).to.equal(utils.parseEther("5"))
            expect(await erc20.allowance(user1.address, user2.address)).to.equal(constants.MaxUint256)
            expect(await erc20.allowance(user2.address, user1.address)).to.equal(0)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
            expect(await erc20.pendingReward(user1.address)).to.equal(0)
        })

        it("to address(0) burns", async function () {
            await erc20.connect(user1).approve(user2.address, utils.parseEther("5"))
            await erc20.connect(user2).transferFrom(user1.address, constants.AddressZero, utils.parseEther("5"))

            expect(await erc20.totalSupply()).to.equal(utils.parseEther("95"))
            expect(await erc20.balanceOf(user1.address)).to.equal(utils.parseEther("95"))
            expect(await erc20.balanceOf(constants.AddressZero)).to.equal(0)
            expect(await erc20.allowance(user1.address, user2.address)).to.equal(0)
            expect(await erc20.allowance(user2.address, user1.address)).to.equal(0)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("95"))
            expect(await erc20.pendingReward(user1.address)).to.equal(0)
        })
    })

    describe("permit", function () {
        it("works as expected", async function () {
            const { v, r, s } = await getPermitSignature(erc20, user1, user2.address, 1234, 2e9)
            await erc20.connect(user2).permit(user1.address, user2.address, 1234, 2e9, v, r, s)

            expect(await erc20.allowance(user1.address, user2.address)).to.equal(1234)
            expect(await erc20.nonces(user1.address)).to.equal(1)
            expect(await erc20.nonces(user2.address)).to.equal(0)
        })

        it("fails if deadline is changed", async function () {
            const { v, r, s } = await getPermitSignature(erc20, user1, user2.address, 1234, 2e9)
            await expect(erc20.connect(user2).permit(user1.address, user2.address, 1234, 2e9 + 1, v, r, s)).to.be.revertedWithCustomError(erc20, "InvalidPermitSignature")
        })

        it("fails if amount is changed", async function () {
            const { v, r, s } = await getPermitSignature(erc20, user1, user2.address, 1234, 2e9)
            await expect(erc20.connect(user2).permit(user1.address, user2.address, 1235, 2e9, v, r, s)).to.be.revertedWithCustomError(erc20, "InvalidPermitSignature")
        })

        it("fails if spender is changed", async function () {
            const { v, r, s } = await getPermitSignature(erc20, user1, user2.address, 1234, 2e9)
            await expect(erc20.connect(user2).permit(user1.address, user1.address, 1234, 2e9, v, r, s)).to.be.revertedWithCustomError(erc20, "InvalidPermitSignature")
        })

        it("fails if owner is changed", async function () {
            const { v, r, s } = await getPermitSignature(erc20, user1, user2.address, 1234, 2e9)
            await expect(erc20.connect(user2).permit(user2.address, user2.address, 1234, 2e9, v, r, s)).to.be.revertedWithCustomError(erc20, "InvalidPermitSignature")
        })

        it("fails if v is changed", async function () {
            const { v, r, s } = await getPermitSignature(erc20, user1, user2.address, 1234, 2e9)
            await expect(erc20.connect(user2).permit(user1.address, user2.address, 1234, 2e9, v + 1, r, s)).to.be.revertedWithCustomError(erc20, "InvalidPermitSignature")
            await expect(erc20.connect(user2).permit(user1.address, user2.address, 1234, 2e9, v - 1, r, s)).to.be.revertedWithCustomError(erc20, "InvalidPermitSignature")
        })

        it("fails if deadline has expired", async function () {
            const { v, r, s } = await getPermitSignature(erc20, user1, user2.address, 1234, 1)
            await expect(erc20.connect(user2).permit(user1.address, user2.address, 1234, 1, v, r, s)).to.be.revertedWithCustomError(erc20, "DeadlineExpired")
        })
    })

    describe("user2 and user3 are excluded", function () {
        beforeEach(async function () {
            await erc20.setExcluded(user2.address, true);
            await erc20.setExcluded(user3.address, true);
            await erc20.connect(user1).approve(user4.address, constants.MaxUint256)
            await erc20.connect(user2).approve(user4.address, constants.MaxUint256)
            await erc20.connect(user3).approve(user4.address, constants.MaxUint256)
        })

        it("initialized as expected", async function () {
            expect(await erc20.isExcluded(user1.address)).to.equal(false)
            expect(await erc20.isExcluded(user2.address)).to.equal(true)
            expect(await erc20.isExcluded(user3.address)).to.equal(true)
        })

        it("transfer works as expected", async function () {
            await erc20.connect(user1).transfer(user2.address, utils.parseEther("2"))

            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("98"))

            await erc20.connect(user2).transfer(user3.address, utils.parseEther("2"))

            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("98"))

            await erc20.connect(user3).transfer(user1.address, utils.parseEther("2"))

            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
        })

        it("transferFrom works as expected", async function () {
            await erc20.connect(user4).transferFrom(user1.address, user2.address, utils.parseEther("2"))

            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("98"))

            await erc20.connect(user4).transferFrom(user2.address, user3.address, utils.parseEther("2"))

            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("98"))

            await erc20.connect(user4).transferFrom(user3.address, user1.address, utils.parseEther("2"))

            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
        })

        it("mint & burn works as expected", async function () {
            await erc20.connect(user1).mint(utils.parseEther("2"))

            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("102"))

            await erc20.connect(user2).mint(utils.parseEther("2"))

            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("102"))

            await erc20.connect(user3).mint(utils.parseEther("2"))

            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("102"))

            await erc20.connect(user1).burn(utils.parseEther("2"))

            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))

            await erc20.connect(user2).burn(utils.parseEther("2"))

            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))

            await erc20.connect(user3).burn(utils.parseEther("2"))

            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
        })

    })

    it("claim does nothing", async function () {
        await erc20.claim()
    })

    it("owner functions fail for non-owner", async function () {
        await expect(erc20.connect(user1).setDelegatedClaimer(user1.address, false)).to.be.revertedWithCustomError(erc20, "NotSelfStakingERC20Owner")
        await expect(erc20.connect(user1).setRewardManager(user1.address, false)).to.be.revertedWithCustomError(erc20, "NotSelfStakingERC20Owner")
        await expect(erc20.connect(user1).setExcluded(user1.address, false)).to.be.revertedWithCustomError(erc20, "NotSelfStakingERC20Owner")
    })

    it("reward manager functions fail for non-manager", async function () {
        await expect(erc20.connect(user1).addReward(1, 2, 3)).to.be.revertedWithCustomError(erc20, "NotRewardManager")
    })

    it("delegated claimer functions fail for non-delegated", async function () {
        await expect(erc20.connect(user1).claimFor(user1.address)).to.be.revertedWithCustomError(erc20, "NotDelegatedClaimer")
    })

    it("addReward fails when endTimestamp <= startTimestamp", async function () {
        await expect(erc20.addReward(1, 2e9 + 1, 2e9 - 1)).to.be.revertedWithCustomError(erc20, "InvalidParameters")
    })

    it("addReward fails when endTimestamp > 2^32", async function () {
        await expect(erc20.addReward(1, 1, 3e10)).to.be.revertedWithCustomError(erc20, "InvalidParameters")
    })

    it("setDelegatedClaimer works as expected", async function () {
        await erc20.connect(owner).setDelegatedClaimer(user1.address, true)
        expect(await erc20.isDelegatedClaimer(user1.address)).to.equal(true)
        await erc20.connect(user1).claimFor(user2.address)
        await erc20.connect(owner).setDelegatedClaimer(user1.address, false)
        expect(await erc20.isDelegatedClaimer(user1.address)).to.equal(false)
    })

    it("add reward with permit", async function () {
        start = await nextBlockTimestamp()
        end = start + 1000

        const { v, r, s } = await getPermitSignature(rewardToken, owner, erc20.address, utils.parseEther("1"), 2e9)
        await erc20.connect(owner).addRewardPermit(100, 1, end, utils.parseEther("1"), 2e9, v, r, s)

        const data = await erc20.rewardData()
        expect(data.lastRewardTimestamp).to.equal(start)
        expect(data.startTimestamp).to.equal(start)
        expect(data.endTimestamp).to.equal(end)
        expect(data.amountToDistribute).to.equal(100)

        expect(await erc20.pendingReward(user1.address)).to.equal(0)
    })

    it("add reward with permit fails for non-manager", async function () {
        const { v, r, s } = await getPermitSignature(rewardToken, user1, erc20.address, utils.parseEther("1"), 2e9)
        await expect(erc20.connect(user1).addRewardPermit(100, 0, 2e9, utils.parseEther("1"), 2e9, v, r, s)).to.be.revertedWithCustomError(erc20, "NotRewardManager")
    })

    it("addReward fails if too much", async function() {        
        await rewardToken.connect(owner).approve(erc20.address, constants.MaxUint256)
        await rewardToken.connect(owner).mint(owner.address, constants.MaxUint256.div(10000))
        await expect(erc20.connect(owner).addReward(constants.MaxUint256.div(10000), 1, 2e9)).to.be.revertedWithCustomError(erc20, "TooMuch")
    })

    it("excluded claim does nothing", async function() {
        await erc20.connect(owner).setExcluded(owner.address, true)
        await erc20.connect(owner).claim()
    })

    describe("reward added", async function () {
        beforeEach(async function () {
            await rewardToken.connect(owner).approve(erc20.address, constants.MaxUint256)
            start = await nextBlockTimestamp()
            end = start + 1000
            await erc20.connect(owner).addReward(100, 1, end)
        })

        it("initialized as expected", async function () {
            const data = await erc20.rewardData()
            expect(data.lastRewardTimestamp).to.equal(start)
            expect(data.startTimestamp).to.equal(start)
            expect(data.endTimestamp).to.equal(end)
            expect(data.amountToDistribute).to.equal(100)
            expect(await erc20.pendingReward(user1.address)).to.equal(0)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
            expect(await rewardToken.balanceOf(erc20.address)).to.equal(100)
        })

        it("half way through, half is payable", async function () {
            await setBlockTimestamp(start + 500)
            expect(await erc20.pendingReward(user1.address)).to.equal(50)
        })

        it("when done, all is payable", async function () {
            await setBlockTimestamp(end)
            expect(await erc20.pendingReward(user1.address)).to.equal(100)
        })

        it("after done, all is payable", async function () {
            await setBlockTimestamp(end + 100)
            expect(await erc20.pendingReward(user1.address)).to.equal(100)
        })

        it("after done, claim sends 100", async function () {
            await setBlockTimestamp(end)
            await erc20.connect(user1).claim()

            expect(await rewardToken.balanceOf(user1.address)).to.equal(100)
            expect(await erc20.pendingReward(user1.address)).to.equal(0)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
        })

        it("claim half way, then after done, same result", async function () {
            await setBlockTimestamp(start + 500)
            await erc20.connect(user1).claim()

            expect(await rewardToken.balanceOf(user1.address)).to.equal(50)
            expect(await erc20.pendingReward(user1.address)).to.equal(0)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))

            await setBlockTimestamp(end)
            await erc20.connect(user1).claim()

            expect(await rewardToken.balanceOf(user1.address)).to.equal(99) // rounding, will get rolled into next cycle
            expect(await erc20.pendingReward(user1.address)).to.equal(0)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
        })

        it("send half to user2 half way, claim", async function () {
            await setBlockTimestamp(start + 500)
            await erc20.connect(user1).transfer(user2.address, utils.parseEther("50"))

            expect(await rewardToken.balanceOf(user1.address)).to.equal(0)
            expect(await rewardToken.balanceOf(user2.address)).to.equal(0)
            expect(await erc20.pendingReward(user1.address)).to.equal(50)
            expect(await erc20.pendingReward(user2.address)).to.equal(0)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))

            await setBlockTimestamp(end)
            await erc20.connect(user1).claim()

            expect(await rewardToken.balanceOf(user1.address)).to.equal(74) // rounding, will get rolled into next cycle
            expect(await rewardToken.balanceOf(user2.address)).to.equal(0)
            expect(await erc20.pendingReward(user1.address)).to.equal(0)
            expect(await erc20.pendingReward(user2.address)).to.equal(24)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))

            await erc20.connect(user2).claim()

            expect(await rewardToken.balanceOf(user2.address)).to.equal(24) // rounding, will get rolled into next cycle
            expect(await erc20.pendingReward(user2.address)).to.equal(0)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
        })

        it("burn half, half way thru, then after done, same result", async function () {
            await setBlockTimestamp(start + 500)
            await erc20.connect(user1).burn(utils.parseEther("50"))

            expect(await rewardToken.balanceOf(user1.address)).to.equal(0)
            expect(await erc20.pendingReward(user1.address)).to.equal(50)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("50"))

            await setBlockTimestamp(end)
            await erc20.connect(user1).claim()

            expect(await rewardToken.balanceOf(user1.address)).to.equal(99) // rounding, will get rolled into next cycle
            expect(await erc20.pendingReward(user1.address)).to.equal(0)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("50"))
        })
    })

    describe("user1, user2, user3, user4 all have 25, and reward added", async function () {

        beforeEach(async function () {
            await erc20.connect(user1).transfer(user2.address, utils.parseEther("25"))
            await erc20.connect(user1).transfer(user3.address, utils.parseEther("25"))
            await erc20.connect(user1).transfer(user4.address, utils.parseEther("25"))
            await rewardToken.connect(owner).approve(erc20.address, constants.MaxUint256)
            start = await nextBlockTimestamp()
            end = start + 1000
            await erc20.connect(owner).addReward(100, 1, end)
        })

        it("initialized as expected", async function () {
            const data = await erc20.rewardData()
            expect(data.lastRewardTimestamp).to.equal(start)
            expect(data.startTimestamp).to.equal(start)
            expect(data.endTimestamp).to.equal(end)
            expect(data.amountToDistribute).to.equal(100)
            expect(await erc20.pendingReward(user1.address)).to.equal(0)
            expect(await erc20.pendingReward(user2.address)).to.equal(0)
            expect(await erc20.pendingReward(user3.address)).to.equal(0)
            expect(await erc20.pendingReward(user4.address)).to.equal(0)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
            expect(await rewardToken.balanceOf(erc20.address)).to.equal(100)
        })

        it("half way through, half is payable", async function () {
            await setBlockTimestamp(start + 500)
            expect(await erc20.pendingReward(user1.address)).to.equal(12)
            expect(await erc20.pendingReward(user2.address)).to.equal(12)
            expect(await erc20.pendingReward(user3.address)).to.equal(12)
            expect(await erc20.pendingReward(user4.address)).to.equal(12)
        })

        it("when done, all is payable", async function () {
            await setBlockTimestamp(end)
            expect(await erc20.pendingReward(user1.address)).to.equal(25)
            expect(await erc20.pendingReward(user2.address)).to.equal(25)
            expect(await erc20.pendingReward(user3.address)).to.equal(25)
            expect(await erc20.pendingReward(user4.address)).to.equal(25)
        })

        it("after done, all is payable", async function () {
            await setBlockTimestamp(end + 500)
            expect(await erc20.pendingReward(user1.address)).to.equal(25)
            expect(await erc20.pendingReward(user2.address)).to.equal(25)
            expect(await erc20.pendingReward(user3.address)).to.equal(25)
            expect(await erc20.pendingReward(user4.address)).to.equal(25)
        })

        it("after done, everyone transfers to user1, but rewards remain unchanged", async function () {
            await setBlockTimestamp(end + 500)
            await erc20.connect(user2).transfer(user1.address, utils.parseEther("25"))
            await erc20.connect(user3).transfer(user1.address, utils.parseEther("25"))
            await erc20.connect(user4).transfer(user1.address, utils.parseEther("25"))
            expect(await erc20.pendingReward(user1.address)).to.equal(25)
            expect(await erc20.pendingReward(user2.address)).to.equal(25)
            expect(await erc20.pendingReward(user3.address)).to.equal(25)
            expect(await erc20.pendingReward(user4.address)).to.equal(25)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))

            await erc20.connect(user1).claim()
            await erc20.connect(user2).claim()
            await erc20.connect(user3).claim()
            await erc20.connect(user4).claim()

            expect(await erc20.pendingReward(user1.address)).to.equal(0)
            expect(await erc20.pendingReward(user2.address)).to.equal(0)
            expect(await erc20.pendingReward(user3.address)).to.equal(0)
            expect(await erc20.pendingReward(user4.address)).to.equal(0)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
            expect(await rewardToken.balanceOf(user1.address)).to.equal(25)
            expect(await rewardToken.balanceOf(user2.address)).to.equal(25)
            expect(await rewardToken.balanceOf(user3.address)).to.equal(25)
            expect(await rewardToken.balanceOf(user4.address)).to.equal(25)
        })

        it("half way thru, user3 and user4 burn", async function () {
            await setBlockTimestamp(start + 500)
            await erc20.connect(user3).burn(utils.parseEther("25"))
            await erc20.connect(user4).burn(utils.parseEther("25"))
            expect(await erc20.pendingReward(user1.address)).to.equal(12)
            expect(await erc20.pendingReward(user2.address)).to.equal(12)
            expect(await erc20.pendingReward(user3.address)).to.equal(12)
            expect(await erc20.pendingReward(user4.address)).to.equal(12)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("50"))

            await erc20.connect(user1).claim()
            await erc20.connect(user4).claim()

            expect(await erc20.pendingReward(user1.address)).to.equal(0)
            expect(await erc20.pendingReward(user2.address)).to.equal(12)
            expect(await erc20.pendingReward(user3.address)).to.equal(12)
            expect(await erc20.pendingReward(user4.address)).to.equal(0)
            expect(await rewardToken.balanceOf(user1.address)).to.equal(12)
            expect(await rewardToken.balanceOf(user4.address)).to.equal(12)

            await setBlockTimestamp(end)
            expect(await erc20.pendingReward(user1.address)).to.equal(25)
            expect(await erc20.pendingReward(user2.address)).to.equal(37)
            expect(await erc20.pendingReward(user3.address)).to.equal(12)
            expect(await erc20.pendingReward(user4.address)).to.equal(0)

            await erc20.connect(user1).claim()
            await erc20.connect(user2).claim()
            await erc20.connect(user3).claim()
            await erc20.connect(user4).claim()

            expect(await erc20.pendingReward(user1.address)).to.equal(0)
            expect(await erc20.pendingReward(user2.address)).to.equal(0)
            expect(await erc20.pendingReward(user3.address)).to.equal(0)
            expect(await erc20.pendingReward(user4.address)).to.equal(0)

            expect(await rewardToken.balanceOf(user1.address)).to.equal(37)
            expect(await rewardToken.balanceOf(user2.address)).to.equal(37)
            expect(await rewardToken.balanceOf(user3.address)).to.equal(12)
            expect(await rewardToken.balanceOf(user4.address)).to.equal(12)
        })

        it("addReward uses leftovers", async function () {
            await setBlockTimestamp(start + 500)
            await erc20.connect(user3).burn(utils.parseEther("25"))
            await erc20.connect(user4).burn(utils.parseEther("25"))
            await erc20.connect(user1).claim()
            await erc20.connect(user4).claim()
            await setBlockTimestamp(end)
            await erc20.connect(user1).claim()
            await erc20.connect(user2).claim()
            await erc20.connect(user3).claim()
            await erc20.connect(user4).claim()

            expect(await rewardToken.balanceOf(erc20.address)).to.equal(2)
            await erc20.connect(owner).addReward(100, end + 100, end + 200)
            expect(await rewardToken.balanceOf(erc20.address)).to.equal(102)
            const data = await erc20.rewardData()
            expect(data.startTimestamp).to.equal(end + 100)
            expect(data.endTimestamp).to.equal(end + 200)
            expect(data.amountToDistribute).to.equal(102)
        })

        it("addReward uses leftovers when not fully claimed", async function () {
            await setBlockTimestamp(start + 500)
            await erc20.connect(user3).burn(utils.parseEther("25"))
            await erc20.connect(user4).burn(utils.parseEther("25"))
            await erc20.connect(user1).claim()
            await erc20.connect(user4).claim()
            await setBlockTimestamp(end)

            expect(await rewardToken.balanceOf(erc20.address)).to.equal(76)
            await erc20.connect(owner).addReward(100, end + 100, end + 200)
            expect(await rewardToken.balanceOf(erc20.address)).to.equal(176)
            const data = await erc20.rewardData()
            expect(data.startTimestamp).to.equal(end + 100)
            expect(data.endTimestamp).to.equal(end + 200)
            expect(data.amountToDistribute).to.equal(102)

            await setBlockTimestamp(end + 200)
            await erc20.connect(user1).claim()
            await erc20.connect(user2).claim()
            await erc20.connect(user3).claim()
            await erc20.connect(user4).claim()

            expect(await rewardToken.balanceOf(user1.address)).to.equal(88)
            expect(await rewardToken.balanceOf(user2.address)).to.equal(88)
            expect(await rewardToken.balanceOf(user3.address)).to.equal(12)
            expect(await rewardToken.balanceOf(user4.address)).to.equal(12)
        })

        it("a bunch of transfers, but all rewards still paid out", async function () {
            await setBlockTimestamp(start + 100)
            await erc20.connect(user3).burn(utils.parseEther("25"))
            await setBlockTimestamp(start + 200)
            await erc20.connect(user3).mint(utils.parseEther("25"))
            await setBlockTimestamp(start + 300)
            await erc20.connect(user1).transfer(user4.address, utils.parseEther("25"))
            await setBlockTimestamp(start + 500)
            await erc20.connect(user2).transfer(user4.address, utils.parseEther("25"))
            await erc20.connect(user4).claim()
            await setBlockTimestamp(start + 600)
            await erc20.connect(user4).transfer(user2.address, utils.parseEther("25"))
            await erc20.connect(user2).claim()
            await erc20.connect(user4).claim()
            await setBlockTimestamp(start + 700)
            await erc20.connect(user3).transfer(user1.address, utils.parseEther("25"))
            await setBlockTimestamp(start + 800)
            await erc20.connect(user1).claim()
            await erc20.connect(user2).claim()
            await erc20.connect(user3).claim()
            await erc20.connect(user4).claim()
            await erc20.connect(user4).transfer(user1.address, utils.parseEther("25"))
            await setBlockTimestamp(end)
            await erc20.connect(user1).claim()
            await erc20.connect(user2).claim()
            await erc20.connect(user3).claim()
            await erc20.connect(user4).claim()
            const balance1 = await rewardToken.balanceOf(user1.address)
            const balance2 = await rewardToken.balanceOf(user2.address)
            const balance3 = await rewardToken.balanceOf(user3.address)
            const balance4 = await rewardToken.balanceOf(user4.address)
            expect(balance1.add(balance2).add(balance3).add(balance4)).to.equal(99)
        })

        it("a bunch of transfers, but all rewards still queued", async function () {
            await setBlockTimestamp(start + 100)
            await erc20.connect(user3).burn(utils.parseEther("25"))
            await setBlockTimestamp(start + 200)
            await erc20.connect(user3).mint(utils.parseEther("25"))
            await setBlockTimestamp(start + 300)
            await erc20.connect(user1).transfer(user4.address, utils.parseEther("25"))
            await setBlockTimestamp(start + 500)
            await erc20.connect(user2).transfer(user4.address, utils.parseEther("25"))
            await setBlockTimestamp(start + 600)
            await erc20.connect(user4).transfer(user2.address, utils.parseEther("25"))
            await setBlockTimestamp(start + 700)
            await erc20.connect(user3).transfer(user1.address, utils.parseEther("25"))
            await setBlockTimestamp(start + 800)
            await erc20.connect(user4).transfer(user1.address, utils.parseEther("25"))
            await setBlockTimestamp(end)
            const pending1 = await erc20.pendingReward(user1.address)
            const pending2 = await erc20.pendingReward(user2.address)
            const pending3 = await erc20.pendingReward(user3.address)
            const pending4 = await erc20.pendingReward(user4.address)
            expect(pending1.add(pending2).add(pending3).add(pending4)).to.equal(99)
        })

        it("excluding at the end cancels reward", async function () {
            await setBlockTimestamp(end)
            expect(await erc20.pendingReward(user1.address)).to.equal(25)
            expect(await erc20.pendingReward(user2.address)).to.equal(25)
            expect(await erc20.pendingReward(user3.address)).to.equal(25)
            expect(await erc20.pendingReward(user4.address)).to.equal(25)
            await erc20.connect(user1).claim()
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
            await erc20.connect(owner).setExcluded(user4.address, false)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
            await erc20.connect(owner).setExcluded(user4.address, true)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("75"))
            await erc20.connect(owner).setExcluded(user4.address, true)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("75"))
            await erc20.connect(owner).setExcluded(user4.address, false)
            expect(await erc20.totalStakingSupply()).to.equal(utils.parseEther("100"))
            expect(await erc20.pendingReward(user1.address)).to.equal(0)
            expect(await erc20.pendingReward(user2.address)).to.equal(25)
            expect(await erc20.pendingReward(user3.address)).to.equal(25)
            expect(await erc20.pendingReward(user4.address)).to.equal(0)
            await erc20.connect(user4).claim()
            expect(await erc20.pendingReward(user1.address)).to.equal(0)
            expect(await erc20.pendingReward(user2.address)).to.equal(25)
            expect(await erc20.pendingReward(user3.address)).to.equal(25)
            expect(await erc20.pendingReward(user4.address)).to.equal(0)
            await erc20.connect(user2).claim()
            await erc20.connect(user3).claim()
            expect(await erc20.pendingReward(user1.address)).to.equal(0)
            expect(await erc20.pendingReward(user2.address)).to.equal(0)
            expect(await erc20.pendingReward(user3.address)).to.equal(0)
            expect(await erc20.pendingReward(user4.address)).to.equal(0)

            expect(await rewardToken.balanceOf(user1.address)).to.equal(25)
            expect(await rewardToken.balanceOf(user2.address)).to.equal(25)
            expect(await rewardToken.balanceOf(user3.address)).to.equal(25)
            expect(await rewardToken.balanceOf(user4.address)).to.equal(0)

            await erc20.connect(owner).addReward(100, end + 100, end + 200)

            const data = await erc20.rewardData()
            expect(data.startTimestamp).to.equal(end + 100)
            expect(data.endTimestamp).to.equal(end + 200)
            expect(data.amountToDistribute).to.equal(125)

            await erc20.connect(owner).setExcluded(user4.address, true)
            await setBlockTimestamp(end + 200)
            expect(await erc20.pendingReward(user1.address)).to.equal(41)
            expect(await erc20.pendingReward(user2.address)).to.equal(41)
            expect(await erc20.pendingReward(user3.address)).to.equal(41)
            expect(await erc20.pendingReward(user4.address)).to.equal(0)
        })
    })
})