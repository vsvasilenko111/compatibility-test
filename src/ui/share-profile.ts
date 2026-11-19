import {BANK_VERSION,COMPATIBLE_SINCE,CURRENT_IDS,CURRENT_FIRM,MANIFEST,FIRM} from '../questions';
import {decode,encode} from '../codec/codec';
import {unansweredIds} from './flow';

/** Repack only complete compatible answers; never invent or reinterpret legacy responses. */
export function currentShareCode(code:string):string|null {
  try {
    const profile=decode(code,MANIFEST,FIRM);
    if(profile.bankVersion<COMPATIBLE_SINCE||!profile.priorities||unansweredIds(CURRENT_IDS,profile.responses).length)return null;
    return encode({...profile,bankVersion:BANK_VERSION},CURRENT_IDS,CURRENT_FIRM);
  } catch {
    return null;
  }
}
