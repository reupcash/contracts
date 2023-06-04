import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { TestREBacking } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"

describe("REBacking", function () {
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let factories: ContractFactories
    let backing: TestREBacking

    beforeEach(async function () {
        ; ([owner, user1] = await ethers.getSigners());
        factories = createContractFactories(owner)
        upgrades.silenceWarnings()
        backing = await upgrades.deployProxy(factories.REBacking, { unsafeAllow: ["delegatecall"], kind: "uups" }) as TestREBacking
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.REBacking, { unsafeAllow: ["delegatecall"], kind: "uups" })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.REBacking, { unsafeAllow: ["delegatecall"], kind: "uups" })
        expect(c.address).to.equal(c2.address)
    })

    it("initializes as expected", async function () {
        expect(await backing.owner()).to.equal(owner.address)
        expect(await backing.isREBacking()).to.equal(true)
        expect(await backing.propertyAcquisitionCost()).to.equal(0)
    })

    it("owner functions fail for non-owner", async function () {
        await expect(backing.connect(user1).setPropertyAcquisitionCost(0)).to.be.revertedWithCustomError(backing, "NotOwner")
    })

    it("property acquisition cost", async function () {
        await backing.connect(owner).setPropertyAcquisitionCost(123)
        expect(await backing.propertyAcquisitionCost()).to.equal(123)
    })
})