import { readFileSync } from "fs";
import path from "path";
import {
  DecodedDeployData,
  GenLayerChain,
  GenLayerClient,
  TransactionHash,
  TransactionStatus,
} from "genlayer-js/types";
import { localnet } from "genlayer-js/chains";

/** Deploy AgentTrust Court with its no-argument constructor. */
export default async function main(client: GenLayerClient<any>) {
  const filePath = path.resolve(process.cwd(), "contracts/agent_trust_court.py");

  try {
    const contractCode = new Uint8Array(readFileSync(filePath));
    await client.initializeConsensusSmartContract();

    const deployTransaction = await client.deployContract({
      code: contractCode,
      args: [],
    });

    const receipt = await client.waitForTransactionReceipt({
      hash: deployTransaction as TransactionHash,
      status: TransactionStatus.ACCEPTED,
      retries: 200,
    });

    if (
      receipt.status !== 5 &&
      receipt.status !== 6 &&
      receipt.statusName !== "ACCEPTED" &&
      receipt.statusName !== "FINALIZED"
    ) {
      throw new Error(`Deployment failed. Receipt: ${JSON.stringify(receipt)}`);
    }

    const deployedContractAddress =
      (client.chain as GenLayerChain).id === localnet.id
        ? receipt.data.contract_address
        : (receipt.txDataDecoded as DecodedDeployData)?.contractAddress;

    console.log(`Contract deployed at address: ${deployedContractAddress}`);
    console.log("Copy this address into the AgentTrust Court web console.");
  } catch (error) {
    throw new Error(`Error during deployment: ${error}`);
  }
}
