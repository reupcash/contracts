import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { TestUUPSUpgradeableVersion } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"


describe("UUPSUpgradeableVersion", function () {
    let factories: ContractFactories
    let owner: SignerWithAddress
    let version: TestUUPSUpgradeableVersion


    beforeEach(async function () {
        ; ([owner] = await ethers.getSigners());
        factories = createContractFactories(owner)
        upgrades.silenceWarnings()
        version = await upgrades.deployProxy(factories.UUPSUpgradeableVersion, { unsafeAllow: ["delegatecall"], kind: "uups" }) as TestUUPSUpgradeableVersion
    })

    it("initializes as expected", async function() {
        expect(await version.contractVersion()).to.equal(123)
    })

    it("can't upgrade to same version", async function() {
        await version.setCanUpgrade(true)
        await expect(upgrades.upgradeProxy(version, factories.UUPSUpgradeableVersion, { unsafeAllow: ["delegatecall"], kind: "uups" })).to.be.revertedWithCustomError(version, "UpgradeToSameVersion")
    })

    describe("new version", function() {
        beforeEach(async function() {
            await version.setContractVersion(999)
        })

        it("can't upgrade if beforeUpgrade fails", async function () {
            await expect(upgrades.upgradeProxy(version, factories.UUPSUpgradeableVersion, { unsafeAllow: ["delegatecall"], kind: "uups" })).to.be.revertedWithCustomError(version, "Nope")
        })
    
        describe("can upgrade", function () {
            beforeEach(async function () {
                await version.setCanUpgrade(true)
            })
    
            it("upgrade works", async function () {
                await upgrades.upgradeProxy(version, factories.UUPSUpgradeableVersion, { unsafeAllow: ["delegatecall"], kind: "uups" })
            })
        })
    })
})