import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { TestUUPSUpgradeable } from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"


describe("UUPSUpgradeable", function () {
    let factories: ContractFactories
    let owner: SignerWithAddress
    let upgradeable: TestUUPSUpgradeable


    beforeEach(async function () {
        ; ([owner] = await ethers.getSigners());
        factories = createContractFactories(owner)
        upgrades.silenceWarnings()
        upgradeable = await upgrades.deployProxy(factories.UUPSUpgradeable, { unsafeAllow: ["delegatecall"], kind: "uups" }) as TestUUPSUpgradeable
    })

    it("can't upgrade if beforeUpgrade fails", async function () {
        await expect(upgrades.upgradeProxy(upgradeable, factories.UUPSUpgradeable, { unsafeAllow: ["delegatecall"], kind: "uups" })).to.be.revertedWithCustomError(upgradeable, "Nope")
    })

    it("deploy works with initializer", async function () {
        await upgrades.deployProxy(factories.UUPSUpgradeable, [false], { unsafeAllow: ["delegatecall"], kind: "uups", initializer: "yayInitializer" })
        await expect(upgrades.deployProxy(factories.UUPSUpgradeable, [true], { unsafeAllow: ["delegatecall"], kind: "uups", initializer: "yayInitializer" })).to.be.revertedWithCustomError(upgradeable, "Exploded")
    })

    describe("can upgrade", function () {
        beforeEach(async function () {
            await upgradeable.setCanUpgrade(true)
        })

        it("upgrade works", async function () {
            await upgrades.upgradeProxy(upgradeable, factories.UUPSUpgradeable, { unsafeAllow: ["delegatecall"], kind: "uups" })
        })

        it("upgrade directly works", async function() {
            const impl = await factories.UUPSUpgradeable.deploy()
            await upgradeable.upgradeTo(impl.address)
            expect(await upgradeable.self()).to.equal(impl.address)
        })

        it("upgrade and call nothing directly fails", async function() {
            const impl = await factories.UUPSUpgradeable.deploy()
            await expect(upgradeable.upgradeToAndCall(impl.address, "0x")).to.be.revertedWithCustomError(upgradeable, "UpgradeCallFailed")
        })

        it("upgrade and call works directly", async function() {
            const impl = await factories.UUPSUpgradeable.deploy()
            await upgradeable.upgradeToAndCall(impl.address, "0xb7ba4583")
            expect(await upgradeable.self()).to.equal(impl.address)
        })
    })
})