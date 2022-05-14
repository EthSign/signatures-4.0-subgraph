import { BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  EthSignV4,
  AdminChanged,
  BeaconUpgraded,
  ContractCreated,
  ContractHidden,
  ContractSigningCompleted,
  OwnershipTransferred,
  RecipientsAdded,
  SignerSigned,
  Upgraded,
} from "../generated/EthSignV4/EthSignV4";
import { Contract, Event, User } from "../generated/schema";

function createEvent(
  event: ethereum.Event,
  type: string,
  contract: Bytes,
  involvedEntity: Bytes | null,
  rawDataHash: string | null
): void {
  let _event = new Event(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  );
  _event.type = type;
  _event.contract = contract.toHexString();
  _event.timestamp = event.block.timestamp;
  _event.involvedEntity = involvedEntity;
  _event.rawDataHash = rawDataHash;
  _event.save();
}

function getSteps(instance: EthSignV4, contractId: Bytes): BigInt[] {
  let steps: BigInt[] = [];
  const packedSignersAndStatus = instance.getContract(contractId)
    .packedSignersAndStatus;
  for (let i = 0; i < packedSignersAndStatus.length; ++i) {
    const v = packedSignersAndStatus[i];
    const decodedSignerData = instance.decodeSignerData(v);
    const step = decodedSignerData.value1;
    steps.push(BigInt.fromI32(step));
  }
  return steps;
}

export function handleContractCreated(event: ContractCreated): void {
  let contract = new Contract(event.params.contractId.toHexString());
  const ethsignInstance = EthSignV4.bind(event.address);
  const contractStruct = ethsignInstance.getContract(event.params.contractId);
  contract.name = event.params.name;
  contract.rawDataHash = contractStruct.rawDataHash;
  contract.birth = event.block.timestamp;
  contract.expiry = contractStruct.expiry;
  contract.initiator = event.params.initiator;
  contract.signers = [];
  contract.steps = [];
  contract.signedSigners = [];
  contract.viewers = [];
  contract.signed = false;
  contract.save();
  createEvent(
    event,
    "ContractCreated",
    event.params.contractId,
    event.params.initiator,
    null
  );
}

export function handleContractHidden(event: ContractHidden): void {
  createEvent(
    event,
    "ContractHidden",
    event.params.contractId,
    event.params.party,
    null
  );
}

export function handleContractSigningCompleted(
  event: ContractSigningCompleted
): void {
  let contract = Contract.load(event.params.contractId.toHexString())!;
  contract.signed = true;
  contract.save();
  createEvent(
    event,
    "ContractSigningCompleted",
    event.params.contractId,
    null,
    null
  );
}

export function handleSignerSigned(event: SignerSigned): void {
  let contract = Contract.load(event.params.contractId.toHexString())!;
  let signedSigners = contract.signedSigners;
  signedSigners.push(event.params.signer);
  contract.signedSigners = signedSigners;
  contract.save();
  createEvent(
    event,
    "SignerSigned",
    event.params.contractId,
    event.params.signer,
    event.params.rawSignatureDataHash
  );
}

export function handleRecipientsAdded(event: RecipientsAdded): void {
  let instance = EthSignV4.bind(event.address);
  let contract = Contract.load(event.params.contractId.toHexString())!;
  let signers: Bytes[] = [];
  for (let i = 0; i < event.params.signersData.length; ++i) {
    const signerAddress = instance.decodeSignerData(event.params.signersData[i])
      .value0;
    signers.push(signerAddress);
    createEvent(
      event,
      "Synthetic_SignerAdded",
      event.params.contractId,
      signerAddress,
      null
    );
  }
  contract.signers = signers;
  let viewers = contract.viewers;
  for (let i = 0; i < event.params.viewers.length; ++i) {
    viewers.push(event.params.viewers[i]);
    createEvent(
      event,
      "Synthetic_ViewerAdded",
      event.params.contractId,
      event.params.viewers[i],
      null
    );
  }
  contract.viewers = viewers;
  contract.steps = getSteps(
    EthSignV4.bind(event.address),
    event.params.contractId
  );
  contract.save();
}
