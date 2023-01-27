import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers } from "hardhat"
import { TestERC20, TestCheapSafeERC20, TestGrumpyERC20 } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories from "./helpers/createContractFactories"


describe("CheapSafeERC20", function () {
    let cheap: TestCheapSafeERC20
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let erc20: TestERC20
    let grumpy: TestGrumpyERC20

    beforeEach(async function () {
        ; ([owner, user1, user2] = await ethers.getSigners());
        const factories = createContractFactories(owner)
        erc20 = await factories.ERC20.deploy()
        cheap = await factories.CheapSafeERC20.deploy()
        grumpy = await factories.GrumpyERC20.deploy()
    })

    it("safeTransfer fails", async function () {
        await expect(cheap.safeTransfer(erc20.address, user2.address, 123)).to.be.revertedWith("ERC20: transfer amount exceeds balance")
    })

    it("safeTransferFrom fails", async function () {
        await expect(cheap.safeTransferFrom(erc20.address, owner.address, user2.address, 123)).to.be.revertedWith("ERC20: insufficient allowance")
    })

    it("safeApprove works", async function () {
        await cheap.safeApprove(erc20.address, owner.address, 123)
        expect(await erc20.allowance(cheap.address, owner.address)).to.equal(123)
    })

    it("safeTransfer works", async function () {
        await erc20.connect(owner).transfer(cheap.address, 124)
        await cheap.safeTransfer(erc20.address, user2.address, 123)
        expect(await erc20.balanceOf(cheap.address)).to.equal(1)
    })

    it("safeTransferFrom works", async function () {
        await erc20.connect(user1).approve(cheap.address, 124)
        await erc20.connect(owner).transfer(user1.address, 124)
        await cheap.safeTransferFrom(erc20.address, user1.address, user2.address, 123)
        expect(await erc20.balanceOf(user1.address)).to.equal(1)
        expect(await erc20.balanceOf(user2.address)).to.equal(123)
    })

    it("safeTransfer revert passes through", async function() {
        await expect(cheap.safeTransfer(grumpy.address, user1.address, 1)).to.be.revertedWith("Blarg")
    })

    it("safeTransferFrom revert passes through", async function() {
        await expect(cheap.safeTransferFrom(grumpy.address, user1.address, user2.address, 1)).to.be.revertedWith("Blarg")
    })

    it("safeApprove backup plan works", async function() {
        await cheap.connect(owner).safeApprove(grumpy.address, user1.address, 1)
        await cheap.connect(owner).safeApprove(grumpy.address, user1.address, 2)
    })
})