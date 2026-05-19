export interface CurrencyPocketLike {
  currency: string | null | undefined;
}

export interface AccountMonthlyCostLike {
  monthlyCostCurrency?: string | null;
  currencies?: CurrencyPocketLike[];
}

export function normaliseCurrencyCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{3}$/.test(code) ? code : null;
}

export function firstAccountCurrency(
  account: { currencies?: CurrencyPocketLike[] },
  fallbackCurrency: string
) {
  const pocketCurrency = account.currencies
    ?.map((pocket) => normaliseCurrencyCode(pocket.currency))
    .find((currency): currency is string => Boolean(currency));
  return pocketCurrency ?? normaliseCurrencyCode(fallbackCurrency) ?? "CHF";
}

export function currencyExistsOnAccount(
  account: { currencies?: CurrencyPocketLike[] },
  currency: string | null | undefined
) {
  const code = normaliseCurrencyCode(currency);
  if (!code) return false;
  return Boolean(
    account.currencies?.some(
      (pocket) => normaliseCurrencyCode(pocket.currency) === code
    )
  );
}

export function validAccountCurrencyOrFirst(
  account: { currencies?: CurrencyPocketLike[] },
  currency: string | null | undefined,
  fallbackCurrency: string
) {
  const code = normaliseCurrencyCode(currency);
  if (code && currencyExistsOnAccount(account, code)) return code;
  return firstAccountCurrency(account, fallbackCurrency);
}

export function effectiveMonthlyCostCurrency(
  account: AccountMonthlyCostLike,
  fallbackCurrency: string
) {
  return (
    validAccountCurrencyOrFirst(
      account,
      account.monthlyCostCurrency,
      fallbackCurrency
    )
  );
}
