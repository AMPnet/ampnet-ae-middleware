exports.up = function(knex) {
    return knex.schema.alterTable('transaction', function(table) {
        table.dropUnique('hash');
    })
};

exports.down = function(knex) {
    return knex.schema.alterTable('transaction', function(table) {
        table.unique('hash');
    })
};
