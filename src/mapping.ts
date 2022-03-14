import { BigInt, ByteArray, Bytes, ethereum } from "@graphprotocol/graph-ts";
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
  involvedEntity: Bytes | null
): void {
  let _event = new Event(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );
  _event.type = type;
  _event.contract = contract.toString();
  _event.timestamp = event.block.timestamp;
  _event.involvedEntity = involvedEntity;
  _event.save();
}

export function handleAdminChanged(event: AdminChanged): void {}

export function handleBeaconUpgraded(event: BeaconUpgraded): void {}

export function handleContractCreated(event: ContractCreated): void {
  let contract = new Contract(event.params.contractId.toString());
  contract.name = event.params.name;
  contract.birth = event.block.timestamp;
  contract.initiator = event.params.initiator;
  contract.signers = [];
  contract.signedSigners = [];
  contract.viewers = [];
  contract.signed = false;
  contract.save();
  createEvent(
    event,
    "ContractCreated",
    event.params.contractId,
    event.params.initiator
  );
}

export function handleContractHidden(event: ContractHidden): void {
  createEvent(
    event,
    "ContractHidden",
    event.params.contractId,
    event.params.party
  );
}

export function handleContractSigningCompleted(
  event: ContractSigningCompleted
): void {
  let contract = Contract.load(event.params.contractId.toString())!;
  contract.signed = true;
  contract.save();
  createEvent(event, "ContractSigningCompleted", event.params.contractId, null);
}

export function handleOwnershipTransferred(event: OwnershipTransferred): void {}

export function handleSignerSigned(event: SignerSigned): void {
  let contract = Contract.load(event.params.contractId.toString())!;
  let signedSigners = contract.signedSigners;
  signedSigners.push(event.params.signer);
  contract.signedSigners = signedSigners;
  contract.save();
  createEvent(
    event,
    "SignerSigned",
    event.params.contractId,
    event.params.signer
  );
}

export function handleRecipientsAdded(event: RecipientsAdded): void {
  let contract = Contract.load(event.params.contractId.toString())!;
  let signers = contract.signers;
  for (let i = 0; i < event.params.signers.length; ++i) {
    signers.push(event.params.signers[i]);
    createEvent(
      event,
      "Synthetic_SignerAdded",
      event.params.contractId,
      event.params.signers[i]
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
      event.params.signers[i]
    );
  }
  contract.viewers = viewers;
  contract.save();
}

export function handleUpgraded(event: Upgraded): void {}
