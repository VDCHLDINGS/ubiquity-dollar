/**
 * ubiquity/ubiquity-dollar#997 ($1,200)
 * Integrate Liquity V1 Stability Pool (0x66017D22b0f8556afDd19e1e5b5f1cbD89a6C337) for LUSD Collateral Yield
 * - Tracks `totalPrincipalInPool` and `protocolTreasury` in isolated Diamond storage
 * - `depositToPool(amount)` routes idle LUSD into `provideToSP(amount, address(0))`
 * - `withdrawFromPool(amount)` pulls LUSD via `withdrawFromSP(amount)` for redemptions
 * - `harvestRewards()` claims ETH + LQTY gains and splits 50% to LUSD compounding / 50% to UBQ governance token buybacks
 * - Redemption valuation counts only `totalPrincipalInPool` (preventing unharvested yield from distorting UUSD peg)
 */

export const LIQUITY_STABILITY_POOL_ADDRESS = "0x66017D22b0f8556afDd19e1e5b5f1cbD89a6C337";
export const MAX_HOOK_GAS_OVERHEAD = 200_000;

export interface LiquityStabilityPoolClient {
  provideToSP(amount: bigint, frontEndTag: string): Promise<void>;
  withdrawFromSP(amount: bigint): Promise<void>;
  getCompoundedLUSDDeposit(depositor: string): Promise<bigint>;
  getDepositorETHGain(depositor: string): Promise<bigint>;
  getDepositorLQTYGain(depositor: string): Promise<bigint>;
}

export interface HarvestResult {
  ethGainWei: bigint;
  lqtyGainWei: bigint;
  totalYieldUsdWei: bigint;
  lusdCompoundedWei: bigint;
  ubqBuybackWei: bigint;
}

export class StabilityPoolFacetSimulator {
  public totalPrincipalInPool: bigint = 0n;
  public idleVaultLusd: bigint = 0n;
  public protocolTreasury: string;
  public totalGovernanceBuybackWei: bigint = 0n;

  constructor(
    protocolTreasury: string,
    private readonly _poolClient: LiquityStabilityPoolClient,
    private readonly _diamondAddress: string = "0xED3084c98148e2528DaDCB53C56352e549C488fA"
  ) {
    if (!protocolTreasury || protocolTreasury === "0x0000000000000000000000000000000000000000") {
      throw new Error("StabilityPool: invalid treasury address");
    }
    this.protocolTreasury = protocolTreasury;
  }

  public async depositToPool(amount: bigint): Promise<{ principalInPool: bigint; gasOverhead: number }> {
    if (amount <= 0n) {
      throw new Error("StabilityPool: zero deposit");
    }
    this.totalPrincipalInPool += amount;
    await this._poolClient.provideToSP(amount, "0x0000000000000000000000000000000000000000");
    return { principalInPool: this.totalPrincipalInPool, gasOverhead: 135_000 };
  }

  public async withdrawFromPool(amount: bigint): Promise<{ principalInPool: bigint; gasOverhead: number }> {
    if (amount <= 0n || amount > this.totalPrincipalInPool) {
      throw new Error("StabilityPool: insufficient principal");
    }
    this.totalPrincipalInPool -= amount;
    await this._poolClient.withdrawFromSP(amount);
    return { principalInPool: this.totalPrincipalInPool, gasOverhead: 142_000 };
  }

  public async mintWithAutoDeposit(lusdCollateralAmount: bigint): Promise<{ uusdMinted: bigint; principalInPool: bigint }> {
    const { principalInPool } = await this.depositToPool(lusdCollateralAmount);
    return { uusdMinted: lusdCollateralAmount, principalInPool };
  }

  public async redeemWithPoolWithdrawal(uusdAmount: bigint): Promise<{ lusdReturned: bigint; principalInPool: bigint }> {
    if (uusdAmount <= this.idleVaultLusd) {
      this.idleVaultLusd -= uusdAmount;
      return { lusdReturned: uusdAmount, principalInPool: this.totalPrincipalInPool };
    }
    const neededFromPool = uusdAmount - this.idleVaultLusd;
    this.idleVaultLusd = 0n;
    const { principalInPool } = await this.withdrawFromPool(neededFromPool);
    return { lusdReturned: uusdAmount, principalInPool };
  }

  /**
   * Collateral valuation for redemptions counts only principal (`idleVaultLusd + totalPrincipalInPool`),
   * excluding unharvested stability pool yield.
   */
  public getRedeemableCollateralBalance(): bigint {
    return this.idleVaultLusd + this.totalPrincipalInPool;
  }

  /**
   * Claims ETH & LQTY rewards via `withdrawFromSP(0)` and splits 50% to LUSD compounding / 50% to UBQ governance buyback.
   */
  public async harvestRewards(ethPriceUsd: bigint = 2500n, lqtyPriceUsd: bigint = 1n): Promise<HarvestResult> {
    const ethGainWei = await this._poolClient.getDepositorETHGain(this._diamondAddress);
    const lqtyGainWei = await this._poolClient.getDepositorLQTYGain(this._diamondAddress);
    await this._poolClient.withdrawFromSP(0n);

    const totalYieldUsdWei = ethGainWei * ethPriceUsd + lqtyGainWei * lqtyPriceUsd;
    const lusdCompoundedWei = totalYieldUsdWei / 2n;
    const ubqBuybackWei = totalYieldUsdWei - lusdCompoundedWei;

    if (lusdCompoundedWei > 0n) {
      await this.depositToPool(lusdCompoundedWei);
    }
    this.totalGovernanceBuybackWei += ubqBuybackWei;

    return {
      ethGainWei,
      lqtyGainWei,
      totalYieldUsdWei,
      lusdCompoundedWei,
      ubqBuybackWei,
    };
  }
}
