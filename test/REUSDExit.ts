import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import * as t from "../typechain-types"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories, { ContractFactories } from "./helpers/createContractFactories"
import deployStablecoins from "./helpers/deployStablecoins"
import getPermitSignature from "./helpers/getPermitSignature"
const { utils, constants } = ethers

describe("REUSDExit", function () {
    let factories: ContractFactories
    let REUSD: t.TestREUSD
    let REUSDExit: t.TestREUSDExit
    let DAI: t.ERC20
    let USDC: t.ERC20
    let USDT: t.ERC20
    let Stablecoins: t.TestREStablecoins
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress

    beforeEach(async function () {
        ; ([owner, user1, user2] = await ethers.getSigners());
        ; ({ DAI, USDC, USDT } = await deployStablecoins(owner));
        factories = await createContractFactories(owner)
        upgrades.silenceWarnings()
        REUSD = await upgrades.deployProxy(factories.REUSD, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: ["Real Estate USD", "REUSD"] }) as t.TestREUSD
        Stablecoins = await upgrades.deployProxy(factories.REStablecoins, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [USDC.address, USDT.address, DAI.address] }) as t.TestREStablecoins
        REUSDExit = await upgrades.deployProxy(factories.REUSDExit, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [REUSD.address, Stablecoins.address] }) as t.TestREUSDExit
        await USDC.connect(owner).approve(REUSDExit.address, constants.MaxUint256)
        await USDT.connect(owner).approve(REUSDExit.address, constants.MaxUint256)
        await DAI.connect(owner).approve(REUSDExit.address, constants.MaxUint256)
        await REUSD.connect(owner).setMinter(owner.address, true)
        await REUSD.connect(owner).mint(owner.address, utils.parseEther("1000000"))
        await REUSD.connect(owner).mint(user1.address, utils.parseEther("1000000"))
        await REUSD.connect(owner).mint(user2.address, utils.parseEther("1000000"))
        await REUSD.connect(owner).approve(REUSDExit.address, constants.MaxUint256)
        await REUSD.connect(user1).approve(REUSDExit.address, constants.MaxUint256)
        await REUSD.connect(user2).approve(REUSDExit.address, constants.MaxUint256)
    })

    it("upgrade pattern", async function () {
        const c = await upgrades.deployProxy(factories.REUSDExit, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [REUSD.address, Stablecoins.address] })
        await c.setContractVersion(2e9)
        const c2 = await upgrades.upgradeProxy(c, factories.REUSDExit, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [REUSD.address, Stablecoins.address] })
        expect(c.address).to.equal(c2.address)
    })

    it("upgrade to same version fails", async function () {
        const c = await upgrades.deployProxy(factories.REUSDExit, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [REUSD.address, Stablecoins.address] })
        await expect(upgrades.upgradeProxy(c, factories.REUSDExit, { unsafeAllow: ["delegatecall"], kind: "uups", constructorArgs: [REUSD.address, Stablecoins.address] })).to.be.revertedWithCustomError(Stablecoins, "UpgradeToSameVersion")
    })

    it("initializes as expected", async function () {
        expect(await REUSDExit.isREUSDExit());
        expect(await REUSDExit.queuedExitStart()).to.equal(0)
        expect(await REUSDExit.queuedExitEnd()).to.equal(0)
        expect(await REUSDExit.totalQueued()).to.equal(0)
        expect((await REUSDExit.queuedExitAt(0)).user).to.equal(constants.AddressZero)
        expect((await REUSDExit.queuedExitAt(0)).amount).to.equal(0)
    })

    it("queueExit(0) fails", async function () {
        await expect(REUSDExit.queueExit(0)).to.be.revertedWithCustomError(REUSDExit, "ZeroAmount")
    })

    it("fund(0) fails", async function () {
        await expect(REUSDExit.fund(USDC.address, 0)).to.be.revertedWithCustomError(REUSDExit, "ZeroAmount")
    })

    it("fund() fails for unsupported stablecoin", async function () {
        await expect(REUSDExit.fund(user1.address, 1)).to.be.revertedWithCustomError(Stablecoins, "TokenNotSupported")
    })

    it("queueExit fails if insufficient balance", async function () {
        await expect(REUSDExit.connect(owner).queueExit(utils.parseEther("1000000000000"))).to.be.revertedWithCustomError(REUSD, "InsufficientBalance")
    })

    it("fund does nothing", async function () {
        await REUSDExit.connect(owner).fund(USDC.address, 1)
    })

    it("queueExit works as expected", async function () {
        await REUSDExit.connect(owner).queueExit(1)

        expect(await REUSD.balanceOf(REUSDExit.address)).to.equal(1)
        expect(await REUSDExit.queuedExitStart()).to.equal(0)
        expect(await REUSDExit.queuedExitEnd()).to.equal(0)
        expect(await REUSDExit.totalQueued()).to.equal(1)
        expect((await REUSDExit.queuedExitAt(0)).user).to.equal(owner.address)
        expect((await REUSDExit.queuedExitAt(0)).amount).to.equal(1)

        await REUSDExit.connect(owner).queueExit(2)

        expect(await REUSD.balanceOf(REUSDExit.address)).to.equal(3)
        expect(await REUSDExit.queuedExitStart()).to.equal(0)
        expect(await REUSDExit.queuedExitEnd()).to.equal(0)
        expect(await REUSDExit.totalQueued()).to.equal(3)
        expect((await REUSDExit.queuedExitAt(0)).user).to.equal(owner.address)
        expect((await REUSDExit.queuedExitAt(0)).amount).to.equal(3)

        await REUSDExit.connect(user1).queueExit(4)

        expect(await REUSD.balanceOf(REUSDExit.address)).to.equal(7)
        expect(await REUSDExit.queuedExitStart()).to.equal(0)
        expect(await REUSDExit.queuedExitEnd()).to.equal(1)
        expect(await REUSDExit.totalQueued()).to.equal(7)
        expect((await REUSDExit.queuedExitAt(0)).user).to.equal(owner.address)
        expect((await REUSDExit.queuedExitAt(0)).amount).to.equal(3)
        expect((await REUSDExit.queuedExitAt(1)).user).to.equal(user1.address)
        expect((await REUSDExit.queuedExitAt(1)).amount).to.equal(4)

        await REUSDExit.connect(user1).queueExit(8)

        expect(await REUSD.balanceOf(REUSDExit.address)).to.equal(15)
        expect(await REUSDExit.queuedExitStart()).to.equal(0)
        expect(await REUSDExit.queuedExitEnd()).to.equal(1)
        expect(await REUSDExit.totalQueued()).to.equal(15)
        expect((await REUSDExit.queuedExitAt(0)).user).to.equal(owner.address)
        expect((await REUSDExit.queuedExitAt(0)).amount).to.equal(3)
        expect((await REUSDExit.queuedExitAt(1)).user).to.equal(user1.address)
        expect((await REUSDExit.queuedExitAt(1)).amount).to.equal(12)

        await REUSDExit.connect(owner).queueExit(16)

        expect(await REUSD.balanceOf(REUSDExit.address)).to.equal(31)
        expect(await REUSDExit.queuedExitStart()).to.equal(0)
        expect(await REUSDExit.queuedExitEnd()).to.equal(2)
        expect(await REUSDExit.totalQueued()).to.equal(31)
        expect((await REUSDExit.queuedExitAt(0)).user).to.equal(owner.address)
        expect((await REUSDExit.queuedExitAt(0)).amount).to.equal(3)
        expect((await REUSDExit.queuedExitAt(1)).user).to.equal(user1.address)
        expect((await REUSDExit.queuedExitAt(1)).amount).to.equal(12)
        expect((await REUSDExit.queuedExitAt(2)).user).to.equal(owner.address)
        expect((await REUSDExit.queuedExitAt(2)).amount).to.equal(16)
    })

    describe("exits queued", function () {
        beforeEach(async function () {
            await REUSDExit.connect(user1).queueExit(utils.parseEther("100"))
            await REUSDExit.connect(user2).queueExit(utils.parseEther("200"))
            await REUSDExit.connect(user1).queueExit(utils.parseEther("400"))
        })

        it("fund(USDC, 700) funds everything", async function () {
            await REUSDExit.connect(owner).fund(USDC.address, utils.parseUnits("700", 6))

            expect(await REUSD.balanceOf(REUSDExit.address)).to.equal(0)
            expect(await USDC.balanceOf(user1.address)).to.equal(utils.parseUnits("500", 6))
            expect(await USDC.balanceOf(user2.address)).to.equal(utils.parseUnits("200", 6))
            expect(await REUSDExit.queuedExitStart()).to.equal(2)
            expect(await REUSDExit.queuedExitEnd()).to.equal(2)
            expect(await REUSDExit.totalQueued()).to.equal(0)
            expect((await REUSDExit.queuedExitAt(0)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(0)).amount).to.equal(0)
            expect((await REUSDExit.queuedExitAt(1)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(1)).amount).to.equal(0)
            expect((await REUSDExit.queuedExitAt(2)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(2)).amount).to.equal(0)
        })

        it("fund(USDC, 701) funds everything", async function () {
            await REUSDExit.connect(owner).fund(USDC.address, utils.parseUnits("701", 6))

            expect(await REUSD.balanceOf(REUSDExit.address)).to.equal(0)
            expect(await USDC.balanceOf(user1.address)).to.equal(utils.parseUnits("500", 6))
            expect(await USDC.balanceOf(user2.address)).to.equal(utils.parseUnits("200", 6))
            expect(await REUSDExit.queuedExitStart()).to.equal(2)
            expect(await REUSDExit.queuedExitEnd()).to.equal(2)
            expect(await REUSDExit.totalQueued()).to.equal(0)
            expect((await REUSDExit.queuedExitAt(0)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(0)).amount).to.equal(0)
            expect((await REUSDExit.queuedExitAt(1)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(1)).amount).to.equal(0)
            expect((await REUSDExit.queuedExitAt(2)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(2)).amount).to.equal(0)
        })

        it("fund(USDC, 699) works as expected", async function () {
            await REUSDExit.connect(owner).fund(USDC.address, utils.parseUnits("699", 6))

            expect(await REUSD.balanceOf(REUSDExit.address)).to.equal(utils.parseEther("1"))
            expect(await USDC.balanceOf(user1.address)).to.equal(utils.parseUnits("499", 6))
            expect(await USDC.balanceOf(user2.address)).to.equal(utils.parseUnits("200", 6))
            expect(await REUSDExit.queuedExitStart()).to.equal(2)
            expect(await REUSDExit.queuedExitEnd()).to.equal(2)
            expect(await REUSDExit.totalQueued()).to.equal(utils.parseEther("1"))
            expect((await REUSDExit.queuedExitAt(0)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(0)).amount).to.equal(0)
            expect((await REUSDExit.queuedExitAt(1)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(1)).amount).to.equal(0)
            expect((await REUSDExit.queuedExitAt(2)).user).to.equal(user1.address)
            expect((await REUSDExit.queuedExitAt(2)).amount).to.equal(utils.parseEther("1"))
        })

        it("fund(USDC, 99) works as expected", async function () {
            await REUSDExit.connect(owner).fund(USDC.address, utils.parseUnits("99", 6))

            expect(await REUSD.balanceOf(REUSDExit.address)).to.equal(utils.parseEther("601"))
            expect(await USDC.balanceOf(user1.address)).to.equal(utils.parseUnits("99", 6))
            expect(await USDC.balanceOf(user2.address)).to.equal(0)
            expect(await REUSDExit.queuedExitStart()).to.equal(0)
            expect(await REUSDExit.queuedExitEnd()).to.equal(2)
            expect(await REUSDExit.totalQueued()).to.equal(utils.parseEther("601"))
            expect((await REUSDExit.queuedExitAt(0)).user).to.equal(user1.address)
            expect((await REUSDExit.queuedExitAt(0)).amount).to.equal(utils.parseEther("1"))
            expect((await REUSDExit.queuedExitAt(1)).user).to.equal(user2.address)
            expect((await REUSDExit.queuedExitAt(1)).amount).to.equal(utils.parseEther("200"))
            expect((await REUSDExit.queuedExitAt(2)).user).to.equal(user1.address)
            expect((await REUSDExit.queuedExitAt(2)).amount).to.equal(utils.parseEther("400"))
        })

        it("fund(USDC, 100) works as expected", async function () {
            await REUSDExit.connect(owner).fund(USDC.address, utils.parseUnits("100", 6))

            expect(await REUSD.balanceOf(REUSDExit.address)).to.equal(utils.parseEther("600"))
            expect(await USDC.balanceOf(user1.address)).to.equal(utils.parseUnits("100", 6))
            expect(await USDC.balanceOf(user2.address)).to.equal(0)
            expect(await REUSDExit.queuedExitStart()).to.equal(1)
            expect(await REUSDExit.queuedExitEnd()).to.equal(2)
            expect(await REUSDExit.totalQueued()).to.equal(utils.parseEther("600"))
            expect((await REUSDExit.queuedExitAt(0)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(0)).amount).to.equal(0)
            expect((await REUSDExit.queuedExitAt(1)).user).to.equal(user2.address)
            expect((await REUSDExit.queuedExitAt(1)).amount).to.equal(utils.parseEther("200"))
            expect((await REUSDExit.queuedExitAt(2)).user).to.equal(user1.address)
            expect((await REUSDExit.queuedExitAt(2)).amount).to.equal(utils.parseEther("400"))
        })

        it("fund(USDC, 101) works as expected", async function () {
            await REUSDExit.connect(owner).fund(USDC.address, utils.parseUnits("101", 6))

            expect(await REUSD.balanceOf(REUSDExit.address)).to.equal(utils.parseEther("599"))
            expect(await USDC.balanceOf(user1.address)).to.equal(utils.parseUnits("100", 6))
            expect(await USDC.balanceOf(user2.address)).to.equal(utils.parseUnits("1", 6))
            expect(await REUSDExit.queuedExitStart()).to.equal(1)
            expect(await REUSDExit.queuedExitEnd()).to.equal(2)
            expect(await REUSDExit.totalQueued()).to.equal(utils.parseEther("599"))
            expect((await REUSDExit.queuedExitAt(0)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(0)).amount).to.equal(0)
            expect((await REUSDExit.queuedExitAt(1)).user).to.equal(user2.address)
            expect((await REUSDExit.queuedExitAt(1)).amount).to.equal(utils.parseEther("199"))
            expect((await REUSDExit.queuedExitAt(2)).user).to.equal(user1.address)
            expect((await REUSDExit.queuedExitAt(2)).amount).to.equal(utils.parseEther("400"))
        })

        it("fund(USDC, 300) works as expected", async function () {
            await REUSDExit.connect(owner).fund(USDC.address, utils.parseUnits("300", 6))

            expect(await REUSD.balanceOf(REUSDExit.address)).to.equal(utils.parseEther("400"))
            expect(await USDC.balanceOf(user1.address)).to.equal(utils.parseUnits("100", 6))
            expect(await USDC.balanceOf(user2.address)).to.equal(utils.parseUnits("200", 6))
            expect(await REUSDExit.queuedExitStart()).to.equal(2)
            expect(await REUSDExit.queuedExitEnd()).to.equal(2)
            expect(await REUSDExit.totalQueued()).to.equal(utils.parseEther("400"))
            expect((await REUSDExit.queuedExitAt(0)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(0)).amount).to.equal(0)
            expect((await REUSDExit.queuedExitAt(1)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(1)).amount).to.equal(0)
            expect((await REUSDExit.queuedExitAt(2)).user).to.equal(user1.address)
            expect((await REUSDExit.queuedExitAt(2)).amount).to.equal(utils.parseEther("400"))
        })

        it("fund(USDC, 100 + 200 + 400) funds everything", async function () {
            await REUSDExit.connect(owner).fund(USDC.address, utils.parseUnits("100", 6))
            await REUSDExit.connect(owner).fund(USDC.address, utils.parseUnits("200", 6))
            await REUSDExit.connect(owner).fund(USDC.address, utils.parseUnits("400", 6))

            expect(await REUSD.balanceOf(REUSDExit.address)).to.equal(0)
            expect(await USDC.balanceOf(user1.address)).to.equal(utils.parseUnits("500", 6))
            expect(await USDC.balanceOf(user2.address)).to.equal(utils.parseUnits("200", 6))
            expect(await REUSDExit.queuedExitStart()).to.equal(2)
            expect(await REUSDExit.queuedExitEnd()).to.equal(2)
            expect(await REUSDExit.totalQueued()).to.equal(0)
            expect((await REUSDExit.queuedExitAt(0)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(0)).amount).to.equal(0)
            expect((await REUSDExit.queuedExitAt(1)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(1)).amount).to.equal(0)
            expect((await REUSDExit.queuedExitAt(2)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(2)).amount).to.equal(0)
        })

        it("fund(USDC, 75 + multi-50) funds everything", async function () {
            await REUSDExit.connect(owner).fund(USDC.address, utils.parseUnits("75", 6))
            for (let x = 0; x < 15; ++x) {
                await REUSDExit.connect(owner).fund(USDC.address, utils.parseUnits("50", 6))
            }

            expect(await REUSD.balanceOf(REUSDExit.address)).to.equal(0)
            expect(await USDC.balanceOf(user1.address)).to.equal(utils.parseUnits("500", 6))
            expect(await USDC.balanceOf(user2.address)).to.equal(utils.parseUnits("200", 6))
            expect(await REUSDExit.queuedExitStart()).to.equal(2)
            expect(await REUSDExit.queuedExitEnd()).to.equal(2)
            expect(await REUSDExit.totalQueued()).to.equal(0)
            expect((await REUSDExit.queuedExitAt(0)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(0)).amount).to.equal(0)
            expect((await REUSDExit.queuedExitAt(1)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(1)).amount).to.equal(0)
            expect((await REUSDExit.queuedExitAt(2)).user).to.equal(constants.AddressZero)
            expect((await REUSDExit.queuedExitAt(2)).amount).to.equal(0)
        })
    })
})