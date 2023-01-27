import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumberish } from "ethers"
import { ethers } from "hardhat"

export default async function getPermitSignature(token: any, signer: SignerWithAddress, spenderAddress: string, value: BigNumberish, deadline: BigNumberish) {
    const nonce = await token.nonces(signer.address)
    const name = await token.name()
    const version = "1"
    const chainId = await signer.getChainId()
    const signed = await signer._signTypedData(
        { name, version, chainId, verifyingContract: token.address },
        {
            Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ]
        },
        { owner: signer.address, spender: spenderAddress, value, nonce, deadline })
    return ethers.utils.splitSignature(signed)
}