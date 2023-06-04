import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers } from "hardhat"
import { TestRECoverable, TestERC20 } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories from "./helpers/createContractFactories"
const { utils } = ethers

describe("RECoverable", function () {
    let rec: TestRECoverable
    let erc20: TestERC20
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress

    beforeEach(async function () {
        ; ([owner, user1, user2] = await ethers.getSigners());
        const factories = createContractFactories(owner)
        rec = await factories.RECoverable.deploy()
        erc20 = await factories.ERC20.deploy()
    })

    it("recoverERC20 fails for non-owner", async function () {
        await expect(rec.connect(user1).recoverERC20(erc20.address)).to.be.revertedWithCustomError(rec, "NotRECoverableOwner")
        await expect(rec.connect(user1).recoverNative()).to.be.revertedWithCustomError(rec, "NotRECoverableOwner")
    })

    it("recoverERC20 works for owner", async function () {
        await rec.connect(owner).recoverERC20(erc20.address)
        await rec.connect(owner).recoverNative()
    })

    describe("contract has value", function () {
        beforeEach(async function () {
            await erc20.connect(owner).transfer(rec.address, 123)
            await owner.sendTransaction({ value: utils.parseEther("1"), to: rec.address })
        })

        it("recoverERC20 sends everything back", async function () {
            const before = await erc20.balanceOf(owner.address)
            await rec.connect(owner).recoverERC20(erc20.address)
            const after = await erc20.balanceOf(owner.address)
            expect(after.sub(before).toNumber()).to.equal(123)
        })

        it("recoverNative sends everything back", async function () {
            const before = await ethers.provider.getBalance(owner.address)
            await rec.connect(owner).recoverNative()
            const after = await ethers.provider.getBalance(owner.address)
            expect(after.sub(before).lte(utils.parseEther("1"))).to.equal(true)
            expect(after.sub(before).gt(utils.parseEther("0.99"))).to.equal(true)
        })

        describe("before*** functions disallow", function () {
            beforeEach(async function () {
                await rec.setAllow(false)
            })

            it("recoverERC20 fails", async function () {
                await expect(rec.connect(owner).recoverERC20(erc20.address)).to.be.revertedWithCustomError(rec, "Nope")
            })

            it("recoverNative fails", async function () {
                await expect(rec.connect(owner).recoverNative()).to.be.revertedWithCustomError(rec, "Nope")
            })
        })
    })
})