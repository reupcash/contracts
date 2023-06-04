import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumberish } from "ethers"
import { ethers } from "hardhat"

export default async function getBridgeInSignature(token: any, signer: SignerWithAddress, instructionId: BigNumberish, to: string, value: BigNumberish) {
    const name = await token.name()
    const version = "1"
    const chainId = await signer.getChainId()
    const signed = await signer._signTypedData(
        { name, version, chainId, verifyingContract: token.address },
        {
            BridgeIn: [
                { name: "instructionId", type: "uint256" },
                { name: "to", type: "address" },
                { name: "value", type: "uint256" }
            ]
        },
        { instructionId, to, value })
    return ethers.utils.splitSignature(signed)
}