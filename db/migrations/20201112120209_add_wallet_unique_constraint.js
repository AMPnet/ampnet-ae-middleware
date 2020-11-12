
exports.up = function(knex) {
    return knex.schema.alterTable('transaction', function(table) {
        table.unique('wallet');
    })
};

exports.down = function(knex) {
    return knex.schema.alterTable('transaction', function(table) {
        table.dropUnique('wallet');
    })
};
