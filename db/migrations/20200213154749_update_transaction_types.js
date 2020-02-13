exports.up = function(knex) {
    return knex.schema.raw(`
        ALTER TABLE "transaction" 
        DROP CONSTRAINT "transaction_type_check",
        ADD CONSTRAINT "transaction_type_check"
        CHECK (type IN ('WALLET_CREATE', 'ORG_CREATE', 'DEPOSIT', 'APPROVE', 'APPROVE_INVESTMENT', 'APPROVE_USER_WITHDRAW', 'PENDGING_ORG_WITHDRAW', 'PENDING_PROJ_WITHDRAW', 'WITHDRAW', 'INVEST', 'TRANSFER', 'ORG_ADD_MEMBER', 'PROJ_CREATE', 'ORG_ACTIVATE', 'START_REVENUE_PAYOUT', 'SHARE_PAYOUT', 'WITHDRAW_INVESTMENT', 'CANCEL_INVESTMENT'))
    `);
};

exports.down = function(knex) {
    return knex.schema.raw(`
        ALTER TABLE "transaction" 
        DROP CONSTRAINT "transaction_type_check",
        ADD CONSTRAINT "transaction_type_check"
        CHECK (type IN ('WALLET_CREATE', 'ORG_CREATE', 'DEPOSIT', 'APPROVE', 'APPROVE_INVESTMENT', 'APPROVE_USER_WITHDRAW', 'PENDGING_ORG_WITHDRAW', 'PENDING_PROJ_WITHDRAW', 'WITHDRAW', 'INVEST', 'TRANSFER', 'ORG_ADD_MEMBER', 'PROJ_CREATE', 'ORG_ACTIVATE', 'START_REVENUE_PAYOUT', 'SHARE_PAYOUT', 'WITHDRAW_INVESTMENT'))
    `);
};
