import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers } from "hardhat"
import { TestOwned } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories from "./helpers/createContractFactories"

describe("Owned", function () {
    let owned: TestOwned
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress

    beforeEach(async function () {
        ; ([owner, user1, user2] = await ethers.getSigners());
        const factories = createContractFactories(owner)
        owned = await factories.Owned.deploy()
    })

    it("initializes as expected", async function () {
        expect(await owned.owner()).to.equal(owner.address)
    })

    it("owner functions fail for non-owner", async function () {
        await expect(owned.connect(user1).test()).to.be.revertedWithCustomError(owned, "NotOwner")
        await expect(owned.connect(user1).transferOwnership(user1.address)).to.be.revertedWithCustomError(owned, "NotOwner")
        await expect(owned.connect(user1).claimOwnership()).to.be.revertedWithCustomError(owned, "NotOwner")
    })

    it("owner functions work for owner", async function () {
        await owned.connect(owner).test()
        await owned.connect(owner).transferOwnership(user1.address)
    })

    describe("initialized", function () {
        it("initializes as expected", async function () {
            expect(await owned.owner()).to.equal(owner.address)
        })

        it("owner functions fail for non-owner", async function () {
            await expect(owned.connect(user1).test()).to.be.revertedWithCustomError(owned, "NotOwner")
            await expect(owned.connect(user1).transferOwnership(user1.address)).to.be.revertedWithCustomError(owned, "NotOwner")
            await expect(owned.connect(user1).claimOwnership()).to.be.revertedWithCustomError(owned, "NotOwner")
        })

        it("owner functions work for owner", async function () {
            await owned.connect(owner).test()
            await owned.connect(owner).transferOwnership(user1.address)
        })

        describe("transferring to user1", function () {
            beforeEach(async function () {
                await owned.connect(owner).transferOwnership(user1.address)
            })

            it("owner functions fail for non-owner", async function () {
                await expect(owned.connect(user1).test()).to.be.revertedWithCustomError(owned, "NotOwner")
                await expect(owned.connect(user1).transferOwnership(user1.address)).to.be.revertedWithCustomError(owned, "NotOwner")
            })

            it("user2 can't claim", async function () {
                await expect(owned.connect(user2).claimOwnership()).to.be.revertedWithCustomError(owned, "NotOwner")
            })

            describe("user1 claimed ownership", function () {
                beforeEach(async function () {
                    await owned.connect(user1).claimOwnership()
                })

                it("initializes as expected", async function () {
                    expect(await owned.owner()).to.equal(user1.address)
                })

                it("owner functions fail for non-owner", async function () {
                    await expect(owned.connect(owner).test()).to.be.revertedWithCustomError(owned, "NotOwner")
                    await expect(owned.connect(owner).transferOwnership(user1.address)).to.be.revertedWithCustomError(owned, "NotOwner")
                    await expect(owned.connect(owner).claimOwnership()).to.be.revertedWithCustomError(owned, "NotOwner")
                })

                it("owner functions work for owner", async function () {
                    await owned.connect(user1).test()
                    await owned.connect(user1).transferOwnership(user2.address)
                })

                it("multi-transfer works as expected", async function () {
                    await owned.connect(user1).transferOwnership(owner.address)
                    await owned.connect(user1).transferOwnership(user2.address)
                    await expect(owned.connect(owner).claimOwnership()).to.be.revertedWithCustomError(owned, "NotOwner")
                    await owned.connect(user2).claimOwnership()
                    expect(await owned.owner()).to.equal(user2.address)
                })
            })
        })
    })
})