
exports.up = function(knex) {
    return knex.schema.alterTable('transaction', function(table) {
        table.dropUnique('wallet');
        table.unique(['wallet', 'coop_id']);
    })
};

exports.down = function(knex) {
    return knex.schema.alterTable('transaction', function(table) {
        table.dropUnique(['wallet', 'coop_id']);
        table.unique('wallet');
    })
};
