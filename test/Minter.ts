import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers } from "hardhat"
import { TestMinter } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories from "./helpers/createContractFactories"


describe("Minter", function () {
    let minter: TestMinter
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress

    beforeEach(async function () {
        ; ([owner, user1, user2] = await ethers.getSigners());
        const factories = createContractFactories(owner)
        minter = await factories.Minter.deploy()
    })

    it("initializes as expected", async function () {
        expect(await minter.owner()).to.equal(owner.address)
        expect(await minter.isMinter(owner.address)).to.equal(false)
        expect(await minter.isMinter(user1.address)).to.equal(false)
        expect(await minter.isMinter(user2.address)).to.equal(false)
    })

    it("minter functions fail", async function () {
        await expect(minter.connect(owner).test()).to.be.revertedWithCustomError(minter, "NotMinter")
    })

    it("owner functions fail for non-owner", async function () {
        await expect(minter.connect(user1).setMinter(user1.address, true)).to.be.revertedWithCustomError(minter, "NotMinterOwner")
    })

    describe("setMinter(user1, false)", function () {
        beforeEach(async function () {
            await minter.connect(owner).setMinter(user1.address, false)
        })

        it("initializes as expected", async function () {
            expect(await minter.isMinter(owner.address)).to.equal(false)
            expect(await minter.isMinter(user1.address)).to.equal(false)
            expect(await minter.isMinter(user2.address)).to.equal(false)
        })

        it("minter functions fail", async function () {
            await expect(minter.connect(owner).test()).to.be.revertedWithCustomError(minter, "NotMinter")
            await expect(minter.connect(user1).test()).to.be.revertedWithCustomError(minter, "NotMinter")
        })
    })

    describe("setMinter(user1, true)", function () {
        beforeEach(async function () {
            await minter.connect(owner).setMinter(user1.address, true)
        })

        it("initializes as expected", async function () {
            expect(await minter.isMinter(owner.address)).to.equal(false)
            expect(await minter.isMinter(user1.address)).to.equal(true)
            expect(await minter.isMinter(user2.address)).to.equal(false)
        })

        it("minter functions fail for non-minter", async function () {
            await expect(minter.connect(owner).test()).to.be.revertedWithCustomError(minter, "NotMinter")
        })

        it("minter functions work for minter", async function () {
            await minter.connect(user1).test()
        })

        describe("setMinter(user2, true)", function () {
            beforeEach(async function () {
                await minter.connect(owner).setMinter(user2.address, true)
            })

            it("initializes as expected", async function () {
                expect(await minter.isMinter(owner.address)).to.equal(false)
                expect(await minter.isMinter(user1.address)).to.equal(true)
                expect(await minter.isMinter(user2.address)).to.equal(true)
            })

            it("minter functions fail for non-minter", async function () {
                await expect(minter.connect(owner).test()).to.be.revertedWithCustomError(minter, "NotMinter")
            })

            it("minter functions work for minter", async function () {
                await minter.connect(user1).test()
                await minter.connect(user2).test()
            })

            describe("setMinter(user1, false)", function () {
                beforeEach(async function () {
                    await minter.connect(owner).setMinter(user1.address, false)
                })

                it("initializes as expected", async function () {
                    expect(await minter.isMinter(owner.address)).to.equal(false)
                    expect(await minter.isMinter(user1.address)).to.equal(false)
                    expect(await minter.isMinter(user2.address)).to.equal(true)
                })

                it("minter functions fail for non-minter", async function () {
                    await expect(minter.connect(owner).test()).to.be.revertedWithCustomError(minter, "NotMinter")
                    await expect(minter.connect(user1).test()).to.be.revertedWithCustomError(minter, "NotMinter")
                })

                it("minter functions work for minter", async function () {
                    await minter.connect(user2).test()
                })

                describe("setMinter(user2, false)", function () {
                    beforeEach(async function () {
                        await minter.connect(owner).setMinter(user2.address, false)
                    })

                    it("initializes as expected", async function () {
                        expect(await minter.isMinter(owner.address)).to.equal(false)
                        expect(await minter.isMinter(user1.address)).to.equal(false)
                        expect(await minter.isMinter(user2.address)).to.equal(false)
                    })

                    it("minter functions fail for non-minter", async function () {
                        await expect(minter.connect(owner).test()).to.be.revertedWithCustomError(minter, "NotMinter")
                        await expect(minter.connect(user1).test()).to.be.revertedWithCustomError(minter, "NotMinter")
                        await expect(minter.connect(user2).test()).to.be.revertedWithCustomError(minter, "NotMinter")
                    })
                })
            })
        })
    })
})