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
