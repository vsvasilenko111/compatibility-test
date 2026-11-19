import {describe,it,expect} from 'vitest';
import {parseHash,personalHash,personalUrl} from '../src/router';

describe('personal result links',()=>{
  it('opens one profile without treating it as an invitation or self-pair',()=>{
    expect(parseHash('#p.abC_12-x')).toEqual({kind:'personal',a:'abC_12-x',quick:false});
    expect(parseHash('#qp.abC_12-x')).toEqual({kind:'personal',a:'abC_12-x',quick:true});
    expect(parseHash('#p.abC_12-x).')).toEqual({kind:'personal',a:'abC_12-x',quick:false});
  });
  it('preserves old invite and pair routes and builds a bookmarkable personal URL',()=>{
    expect(personalHash('abc',false)).toBe('p.abc');
    expect(personalUrl('https://example.test/','abc',false)).toBe('https://example.test/#p.abc');
    expect(parseHash('#i.abc')).toEqual({kind:'invite',a:'abc',quick:false});
    expect(parseHash('#r.abc.def')).toEqual({kind:'result',a:'abc',b:'def',quick:false});
  });
});
