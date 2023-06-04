import { expect } from "chai"
import { ethers } from "hardhat"
import "@nomicfoundation/hardhat-chai-matchers"
import createContractFactories from "./helpers/createContractFactories"

describe("StringHelper", function () {

    it("works as expected", async function () {
        const signers = await ethers.getSigners()
        const factories = createContractFactories(signers[0])
        const contract = await factories.StringHelper.deploy()
        for (let str of ["", "a", "abc def", "12345678901234567890123456789012"]) {
            const bytes = await contract.getBytes(str)
            const s = await contract.getString(bytes)
            expect(s).to.equal(str)
        }
        await expect(contract.getBytes("123456789012345678901234567890123")).to.be.revertedWithCustomError(contract, "StringTooLong")
    })
})