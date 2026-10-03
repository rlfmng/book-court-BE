import type pg from 'pg';

/** Anything we can run a query on: the pool or a checked-out client (inside a transaction). */
export type Queryable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;
