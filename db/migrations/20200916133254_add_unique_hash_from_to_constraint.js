exports.up = function(knex) {
    return knex.schema.alterTable('transaction', function(table) {
        table.unique(['hash', 'from_wallet', 'to_wallet']);
    })
};

exports.down = function(knex) {
    return knex.schema.alterTable('transaction', function(table) {
        table.dropUnique(['hash', 'from_wallet', 'to_wallet']);
    })
};
