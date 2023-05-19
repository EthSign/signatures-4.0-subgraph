import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  EthSignV4,
  ContractCreated,
  ContractHidden,
  ContractSigningCompleted,
  RecipientsAdded,
  SignerSigned,
} from "../generated/EthSignV4/EthSignV4";
import { Registered } from "../generated/EthSignPublicEncryptionKeyRegistry/EthSignPublicEncryptionKeyRegistry";
import { Contract, Event, GeneralInfo, User } from "../generated/schema";

const GENERAL_INFO_ID = "GENERAL_INFO_ID";

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
  const tryGetContract = instance.try_getContract(contractId);
  if (tryGetContract.reverted) {
    return steps;
  }
  const packedSignersAndStatus = tryGetContract.value.packedSignersAndStatus;
  for (let i = 0; i < packedSignersAndStatus.length; ++i) {
    const v = packedSignersAndStatus[i];
    const decodedSignerData = instance.decodeSignerData(v);
    const step = decodedSignerData.value1;
    steps.push(BigInt.fromI32(step));
  }
  return steps;
}

function updateUserMetrics(address: Address, timestamp: BigInt): void {
  let user = User.load(address);
  if (!user) {
    user = new User(address);
    user.joinedTimestamp = timestamp;
    let generalInfo = GeneralInfo.load(GENERAL_INFO_ID)!;
    generalInfo.totalUsers++;
    generalInfo.save();
  }
  user.save();
}

export function handleContractCreated(event: ContractCreated): void {
  let contract = new Contract(event.params.contractId.toHexString());
  const ethsignInstance = EthSignV4.bind(event.address);
  const contractStruct = ethsignInstance.try_getContract(
    event.params.contractId
  );
  if (contractStruct.reverted) {
    return;
  }
  contract.name = event.params.name;
  contract.rawDataHash = contractStruct.value.rawDataHash;
  contract.birth = event.block.timestamp;
  contract.expiry = contractStruct.value.expiry;
  contract.initiator = event.params.initiator;
  contract.signers = [];
  contract.steps = [];
  contract.signedSigners = [];
  contract.viewers = [];
  contract.signed = false;
  contract.metadata = event.params.metadata;
  contract.save();
  createEvent(
    event,
    "ContractCreated",
    event.params.contractId,
    event.params.initiator,
    null
  );

  let generalInfo = GeneralInfo.load(GENERAL_INFO_ID);
  if (!generalInfo) {
    generalInfo = new GeneralInfo(GENERAL_INFO_ID);
    generalInfo.signaturesMade = 1;
    generalInfo.contractsSigned = 0;
    generalInfo.totalUsers = 0;
  } else {
    generalInfo.signaturesMade++;
  }
  generalInfo.save();

  updateUserMetrics(event.params.initiator, event.block.timestamp);
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
  let contract = Contract.load(event.params.contractId.toHexString());
  if (contract == null) {
    return;
  }
  contract.signed = true;
  contract.save();
  createEvent(
    event,
    "ContractSigningCompleted",
    event.params.contractId,
    null,
    null
  );

  let generalInfo = GeneralInfo.load(GENERAL_INFO_ID);
  if (!generalInfo) {
    generalInfo = new GeneralInfo(GENERAL_INFO_ID);
    generalInfo.signaturesMade = 0;
    generalInfo.contractsSigned = 1;
    generalInfo.totalUsers = 0;
  } else {
    generalInfo.contractsSigned++;
  }
  generalInfo.save();
}

export function handleSignerSigned(event: SignerSigned): void {
  let contract = Contract.load(event.params.contractId.toHexString());
  if (contract == null) {
    return;
  }
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
  updateUserMetrics(event.params.signer, event.block.timestamp);
}

export function handleRecipientsAdded(event: RecipientsAdded): void {
  let instance = EthSignV4.bind(event.address);
  let contract = Contract.load(event.params.contractId.toHexString());
  if (contract == null) {
    return;
  }
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

export function handleRegistered(event: Registered): void {
  let user = User.load(event.params.entity);
  if (!user) {
    user = new User(event.params.entity);
    user.publicEncryptionKey = event.params.publicEncryptionKey;
  }
  user.save();
}
