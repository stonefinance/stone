import { describe, it, expect } from 'vitest';
import {
  getDenomInfo,
  getChainDenomFromRegistry,
  getDisplaySymbol,
  IBC_DENOM_REGISTRY,
  NATIVE_DENOM_REGISTRY,
} from './denom-registry';

describe('Denom Registry', () => {
  describe('getDenomInfo', () => {
    describe('IBC denoms', () => {
      it('returns info for known ATOM IBC denom', () => {
        const atomIbc = 'ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9';
        const info = getDenomInfo(atomIbc);
        expect(info).toBeDefined();
        expect(info!.symbol).toBe('ATOM');
        expect(info!.chainDenom).toBe('uatom');
        expect(info!.decimals).toBe(6);
      });

      it('returns info for known USDC IBC denom', () => {
        const usdcIbc = 'ibc/B559A80D62249C8AA07A380E2A2BEA6E5CA9A6F079C912C3A9E9B494105E4F81';
        const info = getDenomInfo(usdcIbc);
        expect(info).toBeDefined();
        expect(info!.symbol).toBe('USDC');
        expect(info!.chainDenom).toBe('uusdc');
        expect(info!.decimals).toBe(6);
      });

      it('returns info for known OSMO IBC denom', () => {
        const osmoIbc = 'ibc/376222D6D9DAE23092E29740E56B758580935A6D77C24C2ABD57A6A78A1F3955';
        const info = getDenomInfo(osmoIbc);
        expect(info).toBeDefined();
        expect(info!.symbol).toBe('OSMO');
        expect(info!.chainDenom).toBe('uosmo');
      });

      it('returns undefined for unknown IBC denom', () => {
        const unknownIbc = 'ibc/UNKNOWN1234567890ABCDEF';
        const info = getDenomInfo(unknownIbc);
        expect(info).toBeUndefined();
      });
    });

    describe('native denoms', () => {
      it('returns info for uatom', () => {
        const info = getDenomInfo('uatom');
        expect(info).toBeDefined();
        expect(info!.symbol).toBe('ATOM');
        expect(info!.chainDenom).toBe('uatom');
      });

      it('returns info for untrn', () => {
        const info = getDenomInfo('untrn');
        expect(info).toBeDefined();
        expect(info!.symbol).toBe('NTRN');
        expect(info!.chainDenom).toBe('untrn');
      });

      it('returns info for uusdc', () => {
        const info = getDenomInfo('uusdc');
        expect(info).toBeDefined();
        expect(info!.symbol).toBe('USDC');
        expect(info!.chainDenom).toBe('uusdc');
      });

      it('returns info for stake (testnet denom)', () => {
        const info = getDenomInfo('stake');
        expect(info).toBeDefined();
        expect(info!.symbol).toBe('STAKE');
      });
    });

    describe('display names', () => {
      it('resolves ATOM display name to uatom info', () => {
        const info = getDenomInfo('ATOM');
        expect(info).toBeDefined();
        expect(info!.symbol).toBe('ATOM');
        expect(info!.chainDenom).toBe('uatom');
      });

      it('resolves atom (lowercase) to uatom info', () => {
        const info = getDenomInfo('atom');
        expect(info).toBeDefined();
        expect(info!.symbol).toBe('ATOM');
      });

      it('resolves USDC display name to uusdc info', () => {
        const info = getDenomInfo('USDC');
        expect(info).toBeDefined();
        expect(info!.symbol).toBe('USDC');
        expect(info!.chainDenom).toBe('uusdc');
      });

      it('resolves NTRN display name to untrn info', () => {
        const info = getDenomInfo('NTRN');
        expect(info).toBeDefined();
        expect(info!.symbol).toBe('NTRN');
        expect(info!.chainDenom).toBe('untrn');
      });
    });

    describe('unknown denom fallback', () => {
      it('returns undefined for completely unknown denom', () => {
        const info = getDenomInfo('unknowncoin');
        expect(info).toBeUndefined();
      });

      it('returns undefined for unknown micro-denom', () => {
        const info = getDenomInfo('uxyz');
        expect(info).toBeUndefined();
      });
    });
  });

  describe('getChainDenomFromRegistry', () => {
    describe('IBC denoms', () => {
      it('returns uatom for ATOM IBC denom', () => {
        const atomIbc = 'ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9';
        const chainDenom = getChainDenomFromRegistry(atomIbc);
        expect(chainDenom).toBe('uatom');
      });

      it('returns uusdc for USDC IBC denom', () => {
        const usdcIbc = 'ibc/B559A80D62249C8AA07A380E2A2BEA6E5CA9A6F079C912C3A9E9B494105E4F81';
        const chainDenom = getChainDenomFromRegistry(usdcIbc);
        expect(chainDenom).toBe('uusdc');
      });

      it('returns uosmo for OSMO IBC denom', () => {
        const osmoIbc = 'ibc/376222D6D9DAE23092E29740E56B758580935A6D77C24C2ABD57A6A78A1F3955';
        const chainDenom = getChainDenomFromRegistry(osmoIbc);
        expect(chainDenom).toBe('uosmo');
      });
    });

    describe('native denoms (Pyth-compatible)', () => {
      it('returns uatom unchanged', () => {
        expect(getChainDenomFromRegistry('uatom')).toBe('uatom');
      });

      it('returns untrn unchanged', () => {
        expect(getChainDenomFromRegistry('untrn')).toBe('untrn');
      });

      it('returns uusdc unchanged', () => {
        expect(getChainDenomFromRegistry('uusdc')).toBe('uusdc');
      });
    });

    describe('display name conversion', () => {
      it('converts ATOM to uatom', () => {
        expect(getChainDenomFromRegistry('ATOM')).toBe('uatom');
      });

      it('converts USDC to uusdc', () => {
        expect(getChainDenomFromRegistry('USDC')).toBe('uusdc');
      });

      it('converts NTRN to untrn', () => {
        expect(getChainDenomFromRegistry('NTRN')).toBe('untrn');
      });
    });

    describe('unknown denom fallback', () => {
      it('adds u prefix to unknown display name', () => {
        // Fallback behavior: assume display name and add u prefix
        expect(getChainDenomFromRegistry('XYZ')).toBe('uxyz');
      });

      it('preserves u prefix for unknown micro-denom', () => {
        // Fallback: already has u prefix, keep as-is
        expect(getChainDenomFromRegistry('uxyz')).toBe('uxyz');
      });

      it('handles unknown IBC denom with fallback', () => {
        // Unknown IBC denom - fallback adds u prefix to the hash (not ideal but expected)
        const unknown = 'ibc/UNKNOWNHASH';
        const result = getChainDenomFromRegistry(unknown);
        // Since it doesn't start with 'u', fallback adds 'u' prefix
        expect(result).toBe('uibc/unknownhash');
      });
    });
  });

  describe('getDisplaySymbol', () => {
    describe('IBC denoms', () => {
      it('returns ATOM for ATOM IBC denom', () => {
        const atomIbc = 'ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9';
        expect(getDisplaySymbol(atomIbc)).toBe('ATOM');
      });

      it('returns USDC for USDC IBC denom', () => {
        const usdcIbc = 'ibc/B559A80D62249C8AA07A380E2A2BEA6E5CA9A6F079C912C3A9E9B494105E4F81';
        expect(getDisplaySymbol(usdcIbc)).toBe('USDC');
      });

      it('returns OSMO for OSMO IBC denom', () => {
        const osmoIbc = 'ibc/376222D6D9DAE23092E29740E56B758580935A6D77C24C2ABD57A6A78A1F3955';
        expect(getDisplaySymbol(osmoIbc)).toBe('OSMO');
      });
    });

    describe('native denoms', () => {
      it('returns ATOM for uatom', () => {
        expect(getDisplaySymbol('uatom')).toBe('ATOM');
      });

      it('returns NTRN for untrn', () => {
        expect(getDisplaySymbol('untrn')).toBe('NTRN');
      });

      it('returns USDC for uusdc', () => {
        expect(getDisplaySymbol('uusdc')).toBe('USDC');
      });

      it('returns STONE for ustone', () => {
        expect(getDisplaySymbol('ustone')).toBe('STONE');
      });

      it('returns STAKE for stake', () => {
        expect(getDisplaySymbol('stake')).toBe('STAKE');
      });
    });

    describe('display names (passthrough)', () => {
      it('returns ATOM for ATOM input', () => {
        expect(getDisplaySymbol('ATOM')).toBe('ATOM');
      });

      it('returns USDC for USDC input', () => {
        expect(getDisplaySymbol('USDC')).toBe('USDC');
      });
    });

    describe('unknown denom fallback', () => {
      it('returns IBC for unknown IBC denom', () => {
        // Unknown IBC denoms show generic "IBC" since hash doesn't encode symbol
        const unknownIbc = 'ibc/UNKNOWN1234567890ABCDEF';
        expect(getDisplaySymbol(unknownIbc)).toBe('IBC');
      });

      it('strips u prefix and uppercases unknown micro-denom', () => {
        expect(getDisplaySymbol('uxyz')).toBe('XYZ');
      });

      it('uppercases unknown display name', () => {
        expect(getDisplaySymbol('foo')).toBe('FOO');
      });

      it('handles mixed case unknown denom', () => {
        expect(getDisplaySymbol('FoObAr')).toBe('FOOBAR');
      });
    });
  });

  describe('registry consistency', () => {
    it('all IBC registry entries have required fields', () => {
      for (const [denom, info] of Object.entries(IBC_DENOM_REGISTRY)) {
        expect(info.symbol, `${denom} should have symbol`).toBeDefined();
        expect(info.chainDenom, `${denom} should have chainDenom`).toBeDefined();
        expect(info.name, `${denom} should have name`).toBeDefined();
        expect(info.decimals, `${denom} should have decimals`).toBeDefined();
        expect(typeof info.decimals).toBe('number');
      }
    });

    it('all native registry entries have required fields', () => {
      for (const [denom, info] of Object.entries(NATIVE_DENOM_REGISTRY)) {
        expect(info.symbol, `${denom} should have symbol`).toBeDefined();
        expect(info.chainDenom, `${denom} should have chainDenom`).toBeDefined();
        expect(info.name, `${denom} should have name`).toBeDefined();
        expect(info.decimals, `${denom} should have decimals`).toBeDefined();
        expect(typeof info.decimals).toBe('number');
      }
    });

    it('IBC denom keys start with ibc/ or are native denoms', () => {
      for (const denom of Object.keys(IBC_DENOM_REGISTRY)) {
        const isIbc = denom.startsWith('ibc/');
        const isNative = denom.startsWith('u') || !denom.includes('/');
        expect(
          isIbc || isNative,
          `${denom} should be IBC path or native denom`
        ).toBe(true);
      }
    });

    it('chainDenom values follow micro-denom convention', () => {
      const allInfos = [
        ...Object.values(IBC_DENOM_REGISTRY),
        ...Object.values(NATIVE_DENOM_REGISTRY),
      ];
      for (const info of allInfos) {
        // Most chain denoms start with 'u' (micro prefix) or are special like 'stake'
        const isValidChainDenom =
          info.chainDenom.startsWith('u') || info.chainDenom === 'stake';
        expect(
          isValidChainDenom,
          `${info.chainDenom} should be micro-prefixed or 'stake'`
        ).toBe(true);
      }
    });
  });
});
