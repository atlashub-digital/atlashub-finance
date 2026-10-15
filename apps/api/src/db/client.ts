import postgres from "postgres";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;
/** Either the pool or an open transaction. */
export type Db = Sql | Tx;

export function createSql(url: string, opts: { max?: number } = {}): Sql {
  return postgres(url, {
    max: opts.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    // bigint (int8) money columns are returned as JS numbers. Minor units stay
    // far below Number.MAX_SAFE_INTEGER (9e15) for any realistic amount; the
    // parser rejects anything unsafe instead of silently losing precision.
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (v: number) => String(v),
        parse: (v: string) => {
          const n = Number(v);
          if (!Number.isSafeInteger(n)) throw new Error("int8 value exceeds safe integer range");
          return n;
        },
      },
    },
    onnotice: () => {},
  });
}
