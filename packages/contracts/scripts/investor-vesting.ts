/**
 * ubiquity/ubiquity-dollar#937 ($450)
 * Final Pre-Seed/Seed Investor Debt UBQ
 * Computes and validates the final vested UBQ token allocations and remaining debt balances for pre-seed/seed investors.
 */

export interface InvestorAllocationRecord {
  investorAddress: string;
  totalAllocatedUbq: bigint;
  alreadyPaidUbq: bigint;
  cliffTimestamp: number;
  vestingEndTimestamp: number;
}

export interface InvestorSettlementSummary {
  investorAddress: string;
  vestedUbq: bigint;
  remainingDebtUbq: bigint;
  isFullySettled: boolean;
}

export function computeInvestorDebtSettlement(
  record: InvestorAllocationRecord,
  currentTimestamp: number
): InvestorSettlementSummary {
  if (record.totalAllocatedUbq < 0n || record.alreadyPaidUbq < 0n) {
    throw new Error("Negative allocation or payment amount is invalid");
  }
  let vestedUbq = 0n;
  if (currentTimestamp < record.cliffTimestamp) {
    vestedUbq = 0n;
  } else if (currentTimestamp >= record.vestingEndTimestamp || record.vestingEndTimestamp <= record.cliffTimestamp) {
    vestedUbq = record.totalAllocatedUbq;
  } else {
    const elapsed = BigInt(currentTimestamp - record.cliffTimestamp);
    const duration = BigInt(record.vestingEndTimestamp - record.cliffTimestamp);
    vestedUbq = (record.totalAllocatedUbq * elapsed) / duration;
  }

  const remainingDebtUbq = vestedUbq > record.alreadyPaidUbq ? vestedUbq - record.alreadyPaidUbq : 0n;
  return {
    investorAddress: record.investorAddress,
    vestedUbq,
    remainingDebtUbq,
    isFullySettled: remainingDebtUbq === 0n && vestedUbq === record.totalAllocatedUbq,
  };
}
