import { Account } from "$live/blocks/account.ts";

export interface VTEXAccount extends Account {
  accountName: string;
}

export default function intercept(account: VTEXAccount) {
  return account;
}
