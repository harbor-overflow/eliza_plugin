import { Memory } from '@elizaos/core';
import { ObjectOwner } from '@mysten/sui/client';

export type SuiObjectCreateChange = {
  digest: string;
  objectId: string;
  objectType: string;
  owner: ObjectOwner;
  sender: string;
  type: 'created';
  version: string;
};

export function isValidMemory(item: any): item is Memory {
  return (
    item &&
    typeof item === 'object' &&
    typeof item.entityId === 'string' &&
    typeof item.content === 'object' &&
    typeof item.roomId === 'string'
  );
}